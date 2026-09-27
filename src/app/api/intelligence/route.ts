import { bad, langFromRequest, ok } from '@/lib/api-helpers'
import { getIntelligence } from '@/lib/intelligence'
import { cached } from '@/lib/cache'

/** GET /api/intelligence — Floussi IQ: health score, safe-to-spend, burn rate,
 *  month projection, category anomalies, streaks and smart tips. */
export async function GET(req: Request) {
  const lang = langFromRequest(req)
  try {
    return ok(await cached(`intel:${lang}`, 45_000, () => getIntelligence(lang)))
  } catch (e) {
    console.error('intelligence error', e)
    return bad('Failed to compute intelligence', 500)
  }
}
