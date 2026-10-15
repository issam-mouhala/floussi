import { ok } from '@/lib/api-helpers'
import { clearAdminCookie } from '@/lib/admin-auth'
import { isHttps } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/admin/logout — clears the admin cookie. */
export async function POST(req: Request) {
  return ok({ ok: true }, { 'Set-Cookie': clearAdminCookie(isHttps(req)) })
}
