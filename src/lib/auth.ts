import { mainDb, setAmbientDb } from '@/lib/db'
import { demoDb, demoDbIfReady } from '@/lib/demo-db'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Floussi auth core (Task 21, sessions routed per-storage in Task 26).
 *
 *  - Passwords: scrypt (N=16384 default, 64-byte key) with a per-user random
 *    salt, stored as `scrypt:<salt>:<hash>`. Verification is constant-time.
 *  - Sessions: 32-byte random token handed to the browser in an HttpOnly
 *    cookie; only its SHA-256 hash is stored server-side. 30-day expiry.
 *    Real-user session rows live in the MAIN database; demo session rows live
 *    in the ephemeral demo DB and their cookie token carries a `d.` prefix so
 *    any request can be routed to the right storage statelessly.
 *    Reading the session from a Request parses the Cookie header directly,
 *    so it works in route handlers, scripts and tests alike.
 *  - Login brute force: tiny in-memory rate limiter (10 attempts / 15 min
 *    per email+IP pair). Single-process app — in-memory is the honest scope.
 */

export const SESSION_COOKIE = 'floussi_session'
/** Cookie-token prefix marking a demo session → resolves against the
 *  ephemeral demo DB (src/lib/demo-db.ts), never the main cloud DB. */
export const DEMO_TOKEN_PREFIX = 'd.'
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

/** Resolve the logged-in user AND route storage for the rest of the request.
 *
 *  ⚠ Ordering matters: the demo check + ambient installation happen in the
 *  SYNCHRONOUS prefix (before the first await). AsyncLocalStorage.enterWith
 *  only propagates when called before the caller's first suspension, so this
 *  is what makes every later `db.…` access of the request — in routes and
 *  libs alike — resolve to the ephemeral demo DB. */
async function resolveSession(req: Request) {
  const token = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE]
  if (!token || token.length < 20) return null

  if (token.startsWith(DEMO_TOKEN_PREFIX)) {
    // Demo session → ephemeral demo DB. If the demo file is not ready on this
    // instance yet, the session row cannot exist either → behave as logged out.
    const ready = demoDbIfReady()
    if (!ready) return null
    setAmbientDb(ready)
    try {
      const client = await demoDb()
      const row = await client.session
        .findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
        .catch(() => null)
      if (!row) return null
      if (row.expiresAt.getTime() < Date.now()) {
        void client.session.delete({ where: { id: row.id } }).catch(() => {})
        return null
      }
      return { id: row.user.id, email: row.user.email, name: row.user.name }
    } catch {
      return null
    }
  }

  // Real user — always the main DB, never affected by any ambient.
  const row = await mainDb.session
    .findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
    .catch(() => null)
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    void mainDb.session.delete({ where: { id: row.id } }).catch(() => {})
    return null
  }
  return { id: row.user.id, email: row.user.email, name: row.user.name }
}

/** Resolve the logged-in user from the request cookie, or null. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  return resolveSession(req)
}

/** Same as getSessionUser — semantic alias for protected handlers. */
export async function requireUser(req: Request): Promise<SessionUser | null> {
  return resolveSession(req)
}

/** Create a DB session row and return the Set-Cookie value for it.
 *  `opts.demo` stores the row in the ephemeral demo DB and prefixes the cookie
 *  token with `d.` so every later request resolves to the demo storage. */
export async function createSession(
  userId: string,
  req: Request,
  opts: { demo?: boolean } = {},
): Promise<string> {
  const token = (opts.demo ? DEMO_TOKEN_PREFIX : '') + newSessionToken()
  const client = opts.demo ? await demoDb() : mainDb
  await client.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  return sessionCookie(token, isHttps(req))
}

/** Delete the session referenced by the request's cookie (logout). Demo
 *  sessions (`d.` prefix) are removed from the ephemeral demo DB, real ones
 *  from the main DB. */
export async function destroySession(req: Request): Promise<void> {
  const token = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE]
  if (!token) return
  const client = token.startsWith(DEMO_TOKEN_PREFIX)
    ? await demoDb().catch(() => null)
    : mainDb
  if (!client) return
  await client.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => {})
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
