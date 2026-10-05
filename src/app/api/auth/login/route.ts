import { db } from '@/lib/db'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { createSession, loginAllowed, loginSucceeded, verifyPassword } from '@/lib/auth'

/** POST /api/auth/login — email + password → HttpOnly session cookie. */
export async function POST(req: Request) {
  const body = await readJson<{ email?: string; password?: string }>(req)
  const email = (body?.email ?? '').trim().toLowerCase()
  const password = body?.password ?? ''
  if (!email || !password) return bad('Email and password required', 422)

  // small in-memory brute-force guard
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!loginAllowed(`${email}|${ip}`)) {
    return bad('Too many attempts — try again in a few minutes', 429)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return bad('Wrong email or password', 401)
  }
  loginSucceeded(`${email}|${ip}`)

  const cookie = await createSession(user.id, req)
  return new Response(JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  })
}
