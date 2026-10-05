import { ok } from '@/lib/api-helpers'
import { clearSessionCookie, destroySession, isHttps } from '@/lib/auth'

/** POST /api/auth/logout — delete the session server-side and clear the cookie. */
export async function POST(req: Request) {
  await destroySession(req)
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(isHttps(req)) },
  })
}
