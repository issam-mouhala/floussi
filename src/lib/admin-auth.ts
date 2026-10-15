import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Admin auth (Task 31) — the site-owner sign-in behind the inline text editor.
 *
 *  - Credentials come from the ENVIRONMENT only: ADMIN_EMAIL + ADMIN_PASSWORD.
 *    If either is missing, admin sign-in is DISABLED (403) — there is no
 *    silent default password, ever. Set both in Vercel → Environment Variables.
 *  - The admin cookie is SELF-VERIFYING (same proven pattern as demo cookies,
 *    Task 30): `a.<payload>.<hmac>` — HMAC-SHA256 over an embedded expiry.
 *    No DB row, no instance affinity: valid on EVERY Vercel instance, pure-CPU
 *    synchronous check. The signed surface grants ONLY text-override writing
 *    (site copy corrections) — deliberately narrow, hence the static key.
 *  - Verification is constant-time (sha256 digests + timingSafeEqual) and the
 *    login route reuses the app's in-memory brute-force guard.
 */

export const ADMIN_COOKIE = 'floussi_admin'
const ADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ADMIN_TTL_S = Math.floor(ADMIN_TTL_MS / 1000)
const ADMIN_SIGNING_KEY = 'floussi-admin-cookies-v1'

export interface AdminCreds {
  email: string
  password: string
}

/** Configured credentials, or null when admin sign-in is disabled. */
export function adminCreds(): AdminCreds | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')

/** Constant-time credential check (sha256 digests + timingSafeEqual). */
export function verifyAdminCredentials(email: string, password: string): boolean {
  const creds = adminCreds()
  if (!creds) return false
  const a = Buffer.from(sha256Hex(email.trim().toLowerCase()))
  const b = Buffer.from(sha256Hex(creds.email))
  const c = Buffer.from(sha256Hex(password))
  const d = Buffer.from(sha256Hex(creds.password))
  const emailOk = a.length === b.length && timingSafeEqual(a, b)
  const passOk = c.length === d.length && timingSafeEqual(c, d)
  return emailOk && passOk
}

function signAdminToken(ttlMs: number = ADMIN_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + ttlMs }))
  const sig = createHmac('sha256', ADMIN_SIGNING_KEY).update(payload).digest()
  return `a.${payload.toString('base64url')}.${sig.toString('base64url')}`
}

/** Set-Cookie value for a fresh admin session (7 days). */
export function adminSessionCookie(https: boolean): string {
  const attrs = [
    `${ADMIN_COOKIE}=${signAdminToken()}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ADMIN_TTL_S}`,
  ]
  if (https) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearAdminCookie(https: boolean): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${https ? '; Secure' : ''}`
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** True when the request carries a valid admin cookie. Sync, zero I/O. */
export function isAdminReq(req: Request): boolean {
  const token = parseCookies(req.headers.get('cookie'))[ADMIN_COOKIE]
  if (!token?.startsWith('a.')) return false
  const rest = token.slice(2)
  const dot = rest.indexOf('.')
  if (dot <= 0) return false
  let payload: Buffer
  let sig: Buffer
  try {
    payload = Buffer.from(rest.slice(0, dot), 'base64url')
    sig = Buffer.from(rest.slice(dot + 1), 'base64url')
  } catch {
    return false
  }
  const expect = createHmac('sha256', ADMIN_SIGNING_KEY).update(payload).digest()
  if (sig.length !== expect.length || !timingSafeEqual(sig, expect)) return false
  try {
    const p = JSON.parse(payload.toString('utf8')) as { v?: number; exp?: number }
    return p.v === 1 && typeof p.exp === 'number' && p.exp >= Date.now()
  } catch {
    return false
  }
}
