import { ok } from '@/lib/api-helpers'
import { getSessionUser } from '@/lib/auth'

/** GET /api/auth/me — the session user, or null when signed out.
 *  Always 200 so the client can poll it without error noise. */
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  return ok({ user })
}
