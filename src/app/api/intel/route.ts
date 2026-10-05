import { bad, langFromRequest, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { getIntel } from '@/lib/intel'

/** GET /api/intel — Intelligence Hub: recurring commitments with cadence,
 *  top spending labels, category month-over-month trends, 7-day activity,
 *  plus the full Floussi IQ health payload. All grounded in real data. */
export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const lang = langFromRequest(req)
  try {
    return ok(await getIntel(lang, user.id))
  } catch (e) {
    console.error('intel error', e)
    return bad('Failed to compute intelligence hub', 500)
  }
}
