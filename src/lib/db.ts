import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
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
  prisma: PrismaClient | undefined
  __floussiDbMode?: 'turso' | 'local'
}

/** Read Turso credentials from env, falling back to credential vaults. */
function loadTursoCreds(): { url: string; authToken?: string; source: 'env' | 'vault' } | null {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (url) return { url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined, source: 'env' }
  // vault locations: db/turso-vault.json (in-project) then /home/z/floussi-backups
  // (outside the project dir — survives project-directory resets)
  for (const dir of [path.join(process.cwd(), 'db'), '/home/z/floussi-backups']) {
    try {
      const vaultPath = path.join(dir, 'turso-vault.json')
      if (!fs.existsSync(vaultPath)) continue
      const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8')) as { url?: string; token?: string }
      if (vault.url?.trim()) {
        return { url: vault.url.trim(), authToken: vault.token?.trim() || undefined, source: 'vault' }
      }
    } catch {
      // vault unreadable → try next location, never crash over storage config
    }
  }
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
  return new PrismaClient()
}

export const db = globalForPrisma.prisma ?? createDb()

export function dbMode(): 'turso' | 'local' {
  return globalForPrisma.__floussiDbMode ?? 'local'
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
