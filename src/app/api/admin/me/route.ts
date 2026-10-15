import { ok } from '@/lib/api-helpers'
import { adminCreds, isAdminReq } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/me — { admin, enabled } so the client can show/hide the
 *  admin bar. `enabled` reports whether credentials are configured at all.
 *  Always 200 (same pattern as /api/auth/me). */
export async function GET(req: Request) {
  return ok({ admin: isAdminReq(req), enabled: !!adminCreds() })
}
