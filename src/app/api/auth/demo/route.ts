import { bad } from '@/lib/api-helpers'
import { createSession, loginAllowed, loginSucceeded } from '@/lib/auth'
import { bustCache } from '@/lib/cache'
import { dbInfo } from '@/lib/db'
import { ensureDemoUser, resetDemoData, seedDemoData } from '@/lib/demo'
import { DEMO_EMAIL } from '@/lib/types'

// Serverless hardening (Vercel): the demo route performs ~20 sequential DB
// round-trips (find-or-create user + repair categories + wipe + seed ~232
// transactions + budgets + goals + session). A cold start plus a remote
// Turso can exceed the default 10 s on the Hobby plan → the client saw a
// dead "try demo" button. Ask for the plan maximum explicitly.
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** POST /api/auth/demo — one-click shared demo session (Task 23).
 *
 * No credentials: finds-or-creates the demo user, wipes + re-seeds its fake
 * dataset (so every visitor explores a pristine account), then hands out a
 * normal HttpOnly session cookie. The demo space is fully isolated — real
 * accounts are never touched. */
export async function POST(req: Request) {
  // light brute-force guard shared with login (10 hits / 15 min per IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!loginAllowed(`demo|${ip}`)) {
    return bad('Too many attempts — try again in a few minutes', 429)
  }

  try {
    const { id } = await ensureDemoUser()
    await resetDemoData(id)
    const seeded = await seedDemoData(id)

    loginSucceeded(`demo|${ip}`)
    bustCache()

    const cookie = await createSession(id, req)
    return new Response(
      JSON.stringify({ user: { id, email: DEMO_EMAIL, name: 'Démo' }, seeded: seeded.transactions }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } },
    )
  } catch (err) {
    console.error('[auth/demo]', err)
    // libsql connection failures surface as PrismaClientUnknownRequestError
    // with an EMPTY message, so regex-matching the text is unreliable.
    // db.ts already tracks the active storage mode — that's the honest signal:
    // local-mode in production means missing env vars; turso-mode failure
    // means the credentials/URL don't work from this deployment.
    const info = dbInfo()
    if (info.mode === 'local' && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
      return bad(
        'Database not connected on this deployment — add TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in Vercel → Settings → Environment Variables, then redeploy. Diagnostic: open /api/health',
        503,
      )
    }
    const msg = err instanceof Error ? `${err.message}` : String(err ?? '')
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : ''
    if (info.mode === 'turso' || /P1001|P1003|P1017|LIBSQL|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(`${code} ${msg}`)) {
      return bad(
        'Database is not reachable right now — check the Turso URL/token in Vercel → Settings → Environment Variables, then redeploy. Diagnostic: open /api/health',
        503,
      )
    }
    if (/demo-category-missing/i.test(msg)) {
      return bad(
        'Demo dataset is missing a category — click the demo button again (it self-repairs)',
        503,
      )
    }
    return bad('Demo is starting up — try again in a moment', 503)
  }
}
