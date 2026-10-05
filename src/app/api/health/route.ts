import { ok } from '@/lib/api-helpers'
import { db, dbInfo } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Deployment diagnostic — GET /api/health
 *
 * Open it right after deploying (https://<app>.vercel.app/api/health):
 *   - ok: true            → the database answered
 *   - storage: "turso"    → cloud DB connected (data will be there)
 *   - storage: "local"    → SQLite file fallback: on Vercel this means the
 *     Turso env vars are missing and the app will show NO DATA. The warning
 *     field spells out the exact fix.
 */
export async function GET() {
  const started = Date.now()
  let reachable = false
  try {
    await db.$queryRaw`SELECT 1`
    reachable = true
  } catch {
    reachable = false
  }

  const info = dbInfo()
  const warning =
    info.mode === 'local' && (info.vercel || process.env.NODE_ENV === 'production')
      ? 'Mode SQLite local actif — sur Vercel cela signifie que les variables Turso sont absentes (aucune donnée ne se chargera). Ajoutez TURSO_DATABASE_URL et TURSO_AUTH_TOKEN (ou DATABASE_URL="libsql://…?authToken=…") dans Vercel → Settings → Environment Variables, puis redéployez. Voir DEPLOY-VERCEL.md.'
      : undefined

  return ok({
    ok: reachable,
    storage: info.mode,
    creds: info.source,
    latencyMs: Date.now() - started,
    warning,
    hint: reachable ? undefined : 'Database unreachable — check the environment variables, then redeploy.',
  })
}
