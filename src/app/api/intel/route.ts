import { bad, langFromRequest, ok } from '@/lib/api-helpers'
import { getIntel } from '@/lib/intel'

/** GET /api/intel — Intelligence Hub: recurring commitments with cadence,
 *  top spending labels, category month-over-month trends, 7-day activity,
 *  plus the full Floussi IQ health payload. All grounded in real data. */
export async function GET(req: Request) {
  const lang = langFromRequest(req)
  try {
    return ok(await getIntel(lang))
  } catch (e) {
    console.error('intel error', e)
    return bad('Failed to compute intelligence hub', 500)
  }
}
