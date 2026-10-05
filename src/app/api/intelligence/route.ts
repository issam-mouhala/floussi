import { bad, langFromRequest, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { getIntelligence } from '@/lib/intelligence'
import { cached } from '@/lib/cache'

/** GET /api/intelligence — Floussi IQ: health score, safe-to-spend, burn rate,
 *  month projection, category anomalies, streaks and smart tips. */
export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const lang = langFromRequest(req)
  try {
    return ok(await cached(`intelligence:${user.id}:${lang}`, 45_000, () => getIntelligence(lang, user.id)))
  } catch (e) {
    console.error('intelligence error', e)
    return bad('Failed to compute intelligence', 500)
  }
}
