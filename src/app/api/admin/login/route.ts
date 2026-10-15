import { bad, ok, readJson } from '@/lib/api-helpers'
import { adminCreds, adminSessionCookie, verifyAdminCredentials } from '@/lib/admin-auth'
import { isHttps, loginAllowed, loginSucceeded } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/admin/login — site-owner sign-in for the inline text editor.
 *  Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD env vars; when they are
 *  not configured the endpoint answers 403 (feature disabled, no defaults). */
export async function POST(req: Request) {
  if (!adminCreds()) {
    return bad('Admin sign-in is disabled — set ADMIN_EMAIL and ADMIN_PASSWORD first', 403)
  }
  const body = await readJson<{ email?: string; password?: string }>(req)
  const email = (body?.email ?? '').trim().toLowerCase()
  const password = body?.password ?? ''
  if (!email || !password) return bad('Email and password required', 422)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const key = `admin|${email}|${ip}`
  if (!loginAllowed(key)) {
    return bad('Too many attempts — try again in a few minutes', 429)
  }
  if (!verifyAdminCredentials(email, password)) {
    return bad('Wrong email or password', 401)
  }
  loginSucceeded(key)
  return ok({ ok: true }, { 'Set-Cookie': adminSessionCookie(isHttps(req)) })
}
