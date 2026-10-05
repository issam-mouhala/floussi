import { db } from '@/lib/db'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { createSession, hashPassword, validateRegistration } from '@/lib/auth'
import { CATEGORIES } from '@/lib/seed'
import { bustCache } from '@/lib/cache'

/** POST /api/auth/register — create an account.
 *
 * A new account starts COMPLETELY EMPTY (zero demo data — the Floussi iron
 * rule): the 13 base categories are cloned into the user's space and their
 * settings row is created with factory defaults. Real transactions come only
 * from the user's own entries or a backup import. */
export async function POST(req: Request) {
  const body = await readJson<{ name?: string; email?: string; password?: string }>(req)
  const parsed = validateRegistration(body?.name, body?.email, body?.password)
  if ('error' in parsed) {
    return bad(
      parsed.error === 'email'
        ? 'Invalid email address'
        : parsed.error === 'password'
          ? 'Password must be at least 6 characters'
          : 'Please enter your name',
      422,
    )
  }
  const { name, email, password } = parsed

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return bad('An account already exists with this email', 409)

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: hashPassword(password),
      // clone the base taxonomy into the new user's space
      categories: {
        create: CATEGORIES.map((c) => ({
          slug: c.slug,
          nameEn: c.nameEn,
          nameFr: c.nameFr,
          nameAr: c.nameAr,
          icon: c.icon,
          color: c.color,
          essential: c.essential,
          sortOrder: c.sortOrder,
        })),
      },
      settings: { create: { displayName: name } },
    },
    select: { id: true, email: true, name: true },
  })

  const cookie = await createSession(user.id, req)
  bustCache()
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  })
}
