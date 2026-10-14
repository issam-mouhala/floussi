import { aiStatus } from '@/lib/ai'
import { ok } from '@/lib/api-helpers'
import { db, dbInfo } from '@/lib/db'
import { demoStorageInfo } from '@/lib/demo-db'
import { APP_VERSION } from '@/lib/version'

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
 *   - demo: ephemeral local file → the demo account does NOT consume Turso
 *     storage (Task 26); its dataset lives in /tmp on the server instance.
 *   - ai: "env" | "file" | "missing" (Task 29) — with Task 30 the coach NEVER
 *     fails: "missing" means /api/chat answers with the local precision engine
 *     (exact figures, no AI) instead of an error.
 *   - version (Task 30) — compare with the latest zip: if it differs, the
 *     deployment is still an old build (that is the #1 cause of "the bugs are
 *     still there").
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
  const ai = aiStatus()
  const warning =
    info.mode === 'local' && (info.vercel || process.env.NODE_ENV === 'production')
      ? 'Mode SQLite local actif — sur Vercel cela signifie que les variables Turso sont absentes (aucune donnée ne se chargera). Ajoutez TURSO_DATABASE_URL et TURSO_AUTH_TOKEN (ou DATABASE_URL="libsql://…?authToken=…") dans Vercel → Settings → Environment Variables, puis redéployez. Voir DEPLOY-VERCEL.md.'
      : undefined

  return ok({
    ok: reachable,
    version: APP_VERSION,
    storage: info.mode,
    creds: info.source,
    demo: demoStorageInfo(),
    ai,
    latencyMs: Date.now() - started,
    warning,
    hint: reachable ? undefined : 'Database unreachable — check the environment variables, then redeploy.',
  })
}
