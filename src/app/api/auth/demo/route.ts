import { bad } from '@/lib/api-helpers'
import { createSession, loginAllowed, loginSucceeded } from '@/lib/auth'
import { bustCache } from '@/lib/cache'
import { ensureDemoUser, purgeLegacyDemoUser, resetDemoData, seedDemoData } from '@/lib/demo'
import { demoDb } from '@/lib/demo-db'
import { DEMO_EMAIL } from '@/lib/types'

// Serverless hardening (Vercel): seeding ~232 transactions + budgets + goals
// on a cold start must never hit the plan's invocation limit.
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** POST /api/auth/demo — one-click shared demo session (Task 23, storage
 *  moved out of the cloud DB in Task 26).
 *
 * No credentials: prepares the EPHEMERAL demo database (a per-instance local
 * file — /tmp/floussi-demo.db on Vercel, NEVER Turso), wipes + re-seeds the
 * fake dataset so every visitor explores a pristine account, then hands out a
 * normal HttpOnly session cookie whose `d.`-prefixed token routes all later
 * requests of the session to the demo storage.
 *
 * Cloud impact: ZERO — the main (Turso) database is only touched once per
 * instance by purgeLegacyDemoUser() to delete the demo account that used to
 * live there before Task 26. Real accounts are never touched. */
export async function POST(req: Request) {
  // light brute-force guard shared with login (10 hits / 15 min per IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!loginAllowed(`demo|${ip}`)) {
    return bad('Too many attempts — try again in a few minutes', 429)
  }

  try {
    // 1) the ephemeral demo DB (local file — works even if Turso is down)
    const client = await demoDb()

    // 2) fresh demo dataset on this instance
    const userId = await ensureDemoUser(client)
    await resetDemoData(client, userId)
    const seeded = await seedDemoData(client, userId)

    loginSucceeded(`demo|${ip}`)
    bustCache()

    // 3) one-time migration: delete the legacy demo account from the MAIN DB
    //    (pre-Task-26 storage). Best-effort — never blocks the demo.
    const purge = await purgeLegacyDemoUser()
    if (purge.error) console.warn('[auth/demo] legacy purge deferred:', purge.error)

    const cookie = await createSession(userId, req, { demo: true })
    return new Response(
      JSON.stringify({ user: { id: userId, email: DEMO_EMAIL, name: 'Démo' }, seeded: seeded.transactions }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } },
    )
  } catch (err) {
    console.error('[auth/demo]', err)
    // The demo no longer depends on Turso, so the previous cloud-diagnostics
    // no longer apply here: failures are local-file/bootstrap issues. They are
    // almost always transient (cold start, first-touch race) → invite a retry.
    const msg = err instanceof Error ? `${err.message}` : String(err ?? '')
    if (/demo-category-missing/i.test(msg)) {
      return bad(
        'Demo dataset is missing a category — click the demo button again (it self-repairs)',
        503,
      )
    }
    return bad('Demo is starting up — try again in a moment', 503)
  }
}
