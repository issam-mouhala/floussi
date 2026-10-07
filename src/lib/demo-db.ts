import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'
import fs from 'node:fs'
import { DEMO_SCHEMA_SQL, DEMO_SCHEMA_VERSION } from './demo-schema'

/**
 * Ephemeral demo database (Task 26) — the demo account NEVER touches Turso.
 *
 * Why: every demo login used to wipe + re-seed ~232 transactions into the
 * cloud database, permanently burning Turso free-tier storage for throwaway
 * data. The whole demo dataset now lives in a local SQLite file instead:
 *
 *   - Vercel: /tmp/floussi-demo.db (/tmp is the only writable dir serverless)
 *   - local dev: the same /tmp file (override with DEMO_DB_PATH)
 *
 * Lifecycle:
 *   - First demo use on an instance boots the file: schema check via
 *     PRAGMA user_version → (re)created from DEMO_SCHEMA_SQL when missing or
 *     stale, then handed to Prisma through the libSQL adapter in file mode.
 *   - While the instance stays warm, the file persists → a visitor's in-demo
 *     edits survive between requests of the same session.
 *   - Cold starts / version bumps rebuild it — demo data is disposable by
 *     design: every demo login resets it anyway (resetDemoData).
 *
 * Initialization starts eagerly at first import and is cached on globalThis
 * (survives dev HMR). demoDbIfReady() lets auth.ts install the ambient demo
 * client SYNCHRONOUSLY — required because AsyncLocalStorage.enterWith only
 * propagates when called before the first await of the request handler.
 */

const DEMO_DB_PATH = process.env.DEMO_DB_PATH?.trim() || '/tmp/floussi-demo.db'
const FILE_URL = `file:${DEMO_DB_PATH}`

const globalForDemo = globalThis as unknown as {
  __floussiDemoDb?: PrismaClient
  __floussiDemoDbInit?: Promise<PrismaClient>
}

async function buildDemoDb(): Promise<PrismaClient> {
  // 1) bootstrap the schema through a raw libsql handle (executeMultiple runs
  //    the whole DDL script in one call; handles are closed before Prisma opens)
  try {
    const raw = createClient({ url: FILE_URL })
    try {
      const v = await raw.execute('PRAGMA user_version')
      const current = Number(v.rows[0]?.user_version ?? 0)
      console.log(
        `[demo-db] bootstrap: path=${DEMO_DB_PATH} file_version=${current} target=${DEMO_SCHEMA_VERSION} sql_bytes=${DEMO_SCHEMA_SQL.length}`,
      )
      if (current < DEMO_SCHEMA_VERSION) {
        // stale or brand-new file — rebuild cleanly (demo data is disposable)
        try {
          await raw.close()
        } catch {
          /* already closed */
        }
        for (const suffix of ['', '-wal', '-shm']) {
          try {
            fs.unlinkSync(DEMO_DB_PATH + suffix)
          } catch {
            /* absent */
          }
        }
        const fresh = createClient({ url: FILE_URL })
        try {
          await fresh.executeMultiple(DEMO_SCHEMA_SQL)
          await fresh.execute(`PRAGMA user_version = ${DEMO_SCHEMA_VERSION}`)
          console.log(`[demo-db] schema v${DEMO_SCHEMA_VERSION} applied to ${DEMO_DB_PATH}`)
        } finally {
          try {
            await fresh.close()
          } catch {
            /* close is best-effort */
          }
        }
      }
    } finally {
      try {
        await raw.close()
      } catch {
        /* double-close is harmless */
      }
    }

    // VERIFY on a dedicated short-lived handle: if the schema is not physically
    // in the file, fail the init loudly instead of handing Prisma a broken
    // client (a file: URL silently falling back to :memory: would look like this).
    const probe = createClient({ url: FILE_URL })
    try {
      const verify = await probe.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'")
      const tables = Number(verify.rows[0]?.n ?? 0)
      if (tables < 8) {
        throw new Error(
          `demo schema verification failed on ${DEMO_DB_PATH}: only ${tables} table(s) present after bootstrap (expected 8) — check the DEMO_DB_PATH / @libsql/client build`,
        )
      }
      console.log(`[demo-db] verified: ${tables} tables in ${DEMO_DB_PATH}`)
    } finally {
      try {
        await probe.close()
      } catch {
        /* best-effort */
      }
    }
  } catch (e) {
    console.error('[demo-db] schema bootstrap failed:', e instanceof Error ? e.message : e)
    // DO NOT fall through with a broken client: rethrow so (a) the caller
    // returns the actionable "Demo is starting up" 503, and (b) the cached
    // init promise resets, forcing a clean re-bootstrap on the next request.
    throw e
  }

  // 2) Prisma over the same file through the libSQL adapter (file mode)
  return new PrismaClient({ adapter: new PrismaLibSQL({ url: FILE_URL }) })
}

function startInit(): Promise<PrismaClient> {
  const p = buildDemoDb().catch((e) => {
    // allow a retry on the next request instead of caching the failure forever
    globalForDemo.__floussiDemoDbInit = undefined
    globalForDemo.__floussiDemoDb = undefined
    throw e
  })
  p.then((c) => {
    globalForDemo.__floussiDemoDb = c
  }).catch(() => {
    /* handled above */
  })
  return p
}

/** Ready client, or undefined while (or if) initialization has not completed. */
export function demoDbIfReady(): PrismaClient | undefined {
  return globalForDemo.__floussiDemoDb
}

/** The ephemeral demo PrismaClient — awaits (and starts if needed) its init. */
export function demoDb(): Promise<PrismaClient> {
  if (!globalForDemo.__floussiDemoDbInit) {
    globalForDemo.__floussiDemoDbInit = startInit()
  }
  return globalForDemo.__floussiDemoDbInit
}

/** Surfaces in /api/health — proves the demo is NOT on the cloud DB. */
export function demoStorageInfo(): { mode: string; path: string; vercel: boolean } {
  return { mode: 'ephemeral-local-file', path: DEMO_DB_PATH, vercel: !!process.env.VERCEL }
}

// Start bootstrapping as soon as this module is imported anywhere, so the
// sync accessor is ready long before the first demo request resolves.
if (!globalForDemo.__floussiDemoDbInit) {
  globalForDemo.__floussiDemoDbInit = startInit()
}
