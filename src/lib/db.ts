import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Database factory — dual mode:
 *
 *  - TURSO_DATABASE_URL set  → Turso cloud (free tier, libSQL/SQLite wire
 *    compatible). Data lives OFF this machine: sandbox resets, redeployments
 *    and disk wipes can no longer touch it. TURSO_AUTH_TOKEN authenticates.
 *  - otherwise               → local SQLite file (previous behaviour).
 *
 * If the Turso config is broken (bad URL, missing package state), we fall back
 * to the local file so the app NEVER becomes unusable.
 *
 * SELF-HEAL: sandbox resets have been observed to wipe .env while the project
 * files survive. When TURSO_* env vars are missing we therefore also look for
 * db/turso-vault.json (credential vault, restored 2026-09-13 after the
 * "site shows Sept 10 while cloud has Sept 12" incident). This keeps the app
 * pinned to the cloud across environment resets.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined // routable proxy (exported as `db`)
  main?: PrismaClient // raw main client (exported as `mainDb`)
  __floussiDbMode?: 'turso' | 'local'
  __floussiCredsSource?: CredsSource
}

/**
 * Parse a libsql:// URL, extracting an inline ?authToken=… query parameter
 * (some guides tell people to put the whole credentialed URL in DATABASE_URL).
 * Returns the bare URL plus the token found, if any.
 */
function parseLibsqlUrl(raw: string): { url: string; authToken?: string } | null {
  const s = raw.trim()
  if (!/^libsql:\/\//.test(s)) return null
  const q = s.indexOf('?')
  if (q === -1) return { url: s }
  try {
    const params = new URLSearchParams(s.slice(q + 1))
    const token = params.get('authToken') ?? undefined
    params.delete('authToken')
    const rest = params.toString()
    return { url: s.slice(0, q) + (rest ? `?${rest}` : ''), authToken: token || undefined }
  } catch {
    return { url: s.slice(0, q) }
  }
}

type CredsSource = 'env' | 'env-url' | 'vault' | 'none'
let lastCredsSource: CredsSource =
  (globalThis as { __floussiCredsSource?: CredsSource }).__floussiCredsSource ?? 'none'

function setCredsSource(s: CredsSource) {
  lastCredsSource = s
  ;(globalThis as { __floussiCredsSource?: CredsSource }).__floussiCredsSource = s
}

/** Read Turso credentials from env (both conventions), falling back to vaults. */
function loadTursoCreds(): { url: string; authToken?: string; source: CredsSource } | null {
  // 1) canonical names — TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
  if (tursoUrl) {
    setCredsSource('env')
    return { url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined, source: 'env' }
  }
  // 2) DATABASE_URL pointing at Turso (libsql://) — accepted for convenience:
  //    on Vercel many people paste DATABASE_URL="libsql://…?authToken=…".
  //    The token is extracted automatically; TURSO_AUTH_TOKEN still wins if set.
  const dbUrl = process.env.DATABASE_URL?.trim()
  if (dbUrl) {
    const parsed = parseLibsqlUrl(dbUrl)
    if (parsed) {
      setCredsSource('env-url')
      return {
        url: parsed.url,
        authToken: process.env.TURSO_AUTH_TOKEN?.trim() || parsed.authToken,
        source: 'env-url',
      }
    }
  }
  // 3) vault locations: db/turso-vault.json (in-project) then /home/z/floussi-backups
  //    (outside the project dir — survives project-directory resets)
  for (const dir of [path.join(process.cwd(), 'db'), '/home/z/floussi-backups']) {
    try {
      const vaultPath = path.join(dir, 'turso-vault.json')
      if (!fs.existsSync(vaultPath)) continue
      const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8')) as { url?: string; token?: string }
      if (vault.url?.trim()) {
        setCredsSource('vault')
        return { url: vault.url.trim(), authToken: vault.token?.trim() || undefined, source: 'vault' }
      }
    } catch {
      // vault unreadable → try next location, never crash over storage config
    }
  }
  setCredsSource('none')
  return null
}

function createDb(): PrismaClient {
  const creds = loadTursoCreds()
  if (creds) {
    try {
      globalForPrisma.__floussiDbMode = 'turso'
      console.log(
        `[db] storage = TURSO cloud (${creds.url.replace(/^[^:]+:\/\//, 'libsql://')}, creds=${creds.source})`,
      )
      return new PrismaClient({
        adapter: new PrismaLibSQL({ url: creds.url, authToken: creds.authToken }),
      })
    } catch (e) {
      console.error(
        '[db] Turso adapter failed, falling back to local SQLite:',
        e instanceof Error ? e.message : e,
      )
    }
  }
  globalForPrisma.__floussiDbMode = 'local'
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    console.error(
      '[db] ⚠️ Falling back to LOCAL SQLite while deployed — deployed apps have no data file!\n' +
        '     Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (or DATABASE_URL="libsql://…?authToken=…")\n' +
        '     in Vercel → Settings → Environment Variables, then redeploy. See DEPLOY-VERCEL.md.\n' +
        '     Check https://<your-app>.vercel.app/api/health to verify the storage mode.',
    )
  }
  return new PrismaClient()
}

// ------------------------------------------------------------------ routing
//
// Task 26 — request-routable `db`. Real users always hit the main client
// (Turso cloud / local SQLite). Demo sessions instead resolve against the
// EPHEMERAL demo database (src/lib/demo-db.ts, a /tmp file — never Turso).
//
// auth.ts installs the demo client for the whole request via
// AsyncLocalStorage.enterWith (synchronously, before the handler's first
// await — that is what makes it propagate). From that point every
// `db.…` access in ANY route or lib of this request resolves to the demo
// client — no per-route plumbing, and future code is safe by default.
// Outside a request (scripts, instrumentation boot) there is no ambient
// client, so `db` simply is the main client — previous behaviour.

const ambientDb = new AsyncLocalStorage<PrismaClient>()

/** Make `client` THE database for the remainder of the current request.
 *  Must be called synchronously (before any await) in the request path. */
export function setAmbientDb(client: PrismaClient): void {
  ambientDb.enterWith(client)
}

/** The client an ambient context points at, or the main client. */
function resolveActual(target: PrismaClient): PrismaClient {
  return ambientDb.getStore() ?? target
}

function makeRoutable(main: PrismaClient): PrismaClient {
  return new Proxy(main, {
    get(target, prop) {
      const actual = resolveActual(target)
      // receiver = actual: keeps Prisma internals working when accessed
      // through the proxy (private fields, symbol props, delegates).
      const value = Reflect.get(actual, prop, actual)
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(actual)
        : value
    },
    has(target, prop) {
      return Reflect.has(resolveActual(target), prop)
    },
    set(target, prop, value) {
      return Reflect.set(resolveActual(target), prop, value, resolveActual(target))
    },
  })
}

const mainRaw = globalForPrisma.main ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForPrisma.main = mainRaw

/** The raw main client — for code that must ALWAYS target the real accounts
 *  DB regardless of any demo ambient (purges, boot jobs, auth lookups). */
export const mainDb = mainRaw

/** Request-routable client: ambient (demo) or main. Default export. */
export const db = globalForPrisma.prisma ?? makeRoutable(mainRaw)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export function dbMode(): 'turso' | 'local' {
  return globalForPrisma.__floussiDbMode ?? 'local'
}

/** Where the current credentials came from — surfaced by /api/health. */
export function dbInfo(): { mode: 'turso' | 'local'; source: CredsSource; vercel: boolean } {
  return { mode: dbMode(), source: lastCredsSource, vercel: !!process.env.VERCEL }
}
