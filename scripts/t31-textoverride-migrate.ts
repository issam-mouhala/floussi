/**
 * Task 31 — additive migration for the admin text editor: creates the
 * `TextOverride` table (IF NOT EXISTS) on BOTH storage targets:
 *   1. the local SQLite file (DATABASE_URL from .env)
 *   2. the Turso cloud database (env vars, else db/turso-vault.json)
 * Pure CREATE IF NOT EXISTS — never touches existing tables or rows.
 * Idempotent: safe to run any number of times.
 *
 * Usage: bun scripts/t31-textoverride-migrate.ts
 */
import { createClient } from '@libsql/client'
import { readFileSync, existsSync } from 'node:fs'
import { config } from 'dotenv'

config()

const DDL = [
  `CREATE TABLE IF NOT EXISTS "TextOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TextOverride_locale_key" ON "TextOverride"("locale", "key")`,
]

type Target = { name: string; url: string; authToken?: string }

function loadTargets(): Target[] {
  const out: Target[] = []

  // 1) local SQLite file (same default the app uses)
  const localUrl = process.env.DATABASE_URL?.trim() || 'file:/home/z/my-project/db/custom.db'
  out.push({ name: `local (${localUrl})`, url: localUrl })

  // 2) Turso cloud — env first, then the vault (same order as src/lib/db.ts)
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined
  if (tursoUrl) {
    out.push({ name: 'turso (env)', url: tursoUrl, authToken: tursoToken })
  } else {
    for (const dir of ['/home/z/my-project/db', '/home/z/floussi-backups']) {
      const vaultPath = `${dir}/turso-vault.json`
      if (!existsSync(vaultPath)) continue
      try {
        const vault = JSON.parse(readFileSync(vaultPath, 'utf8')) as { url?: string; token?: string }
        if (vault.url?.trim()) {
          out.push({ name: 'turso (vault)', url: vault.url.trim(), authToken: vault.token?.trim() })
          break
        }
      } catch {
        // vault unreadable → skip
      }
    }
  }
  return out
}

async function main() {
  const targets = loadTargets()
  let failed = false
  for (const t of targets) {
    const client = createClient({ url: t.url, authToken: t.authToken })
    try {
      for (const stmt of DDL) await client.execute(stmt)
      const res = await client.execute(`SELECT COUNT(*) AS n FROM "TextOverride"`)
      const n = Number(res.rows[0]?.n ?? 0)
      console.log(`✓ ${t.name} — TextOverride ready (rows: ${n})`)
    } catch (e) {
      failed = true
      console.error(`✗ ${t.name} — FAILED:`, e instanceof Error ? e.message : e)
    } finally {
      client.close()
    }
  }
  if (failed) process.exit(1)
}

main()
