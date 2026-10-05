import { db } from '@/lib/db'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Floussi auth core (Task 21) — zero-dependency, framework-agnostic.
 *
 *  - Passwords: scrypt (N=16384 default, 64-byte key) with a per-user random
 *    salt, stored as `scrypt:<salt>:<hash>`. Verification is constant-time.
 *  - Sessions: 32-byte random token handed to the browser in an HttpOnly
 *    cookie; only its SHA-256 hash is stored server-side. 30-day expiry.
 *    Reading the session from a Request parses the Cookie header directly,
 *    so it works in route handlers, scripts and tests alike.
 *  - Login brute force: tiny in-memory rate limiter (10 attempts / 15 min
 *    per email+IP pair). Single-process app — in-memory is the honest scope.
 */

export const SESSION_COOKIE = 'floussi_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_TTL_S = Math.floor(SESSION_TTL_MS / 1000)

export interface SessionUser {
  id: string
  email: string
  name: string
}

// ------------------------------------------------------------------ passwords

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password.normalize('NFKC'), salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = (stored ?? '').split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  try {
    const test = scryptSync(password.normalize('NFKC'), salt, 64)
    const ref = Buffer.from(hash, 'hex')
    return test.length === ref.length && timingSafeEqual(test, ref)
  } catch {
    return false
  }
}

// ------------------------------------------------------------------- sessions

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
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

/** Resolve the logged-in user from the request cookie, or null. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE]
  if (!token || token.length < 20) return null
  const row = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    void db.session.delete({ where: { id: row.id } }).catch(() => {})
    return null
  }
  return { id: row.user.id, email: row.user.email, name: row.user.name }
}

/** Same as getSessionUser — semantic alias for protected handlers. */
export async function requireUser(req: Request): Promise<SessionUser | null> {
  return getSessionUser(req)
}

/** Create a DB session row and return the Set-Cookie value for it. */
export async function createSession(userId: string, req: Request): Promise<string> {
  const token = newSessionToken()
  await db.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  return sessionCookie(token, isHttps(req))
}

/** Delete the session referenced by the request's cookie (logout). */
export async function destroySession(req: Request): Promise<void> {
  const token = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE]
  if (!token) return
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => {})
}

export function isHttps(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function sessionCookie(token: string, https: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_S}`,
  ]
  if (https) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearSessionCookie(https: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${https ? '; Secure' : ''}`
}

// --------------------------------------------------------------- rate limiting

const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

/** Throws false when blocked. Call on every login attempt with the same key. */
export function loginAllowed(key: string): boolean {
  const now = Date.now()
  const a = attempts.get(key)
  if (!a || a.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  a.count++
  return a.count <= MAX_ATTEMPTS
}

export function loginSucceeded(key: string): void {
  attempts.delete(key)
}

// --------------------------------------------------------- registration helper

export function validateRegistration(
  name: unknown,
  email: unknown,
  password: unknown,
): { name: string; email: string; password: string } | { error: string } {
  const n = typeof name === 'string' ? name.trim() : ''
  const e = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const p = typeof password === 'string' ? password : ''
  if (n.length < 2 || n.length > 40) return { error: 'name' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120) return { error: 'email' }
  if (p.length < 6 || p.length > 200) return { error: 'password' }
  return { name: n, email: e, password: p }
}
