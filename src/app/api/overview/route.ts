import { bad, langFromRequest, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { getAnalytics, getOverview } from '@/lib/analytics'
import { cached } from '@/lib/cache'

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const lang = langFromRequest(req)
  const url = new URL(req.url)
  const days = Number(url.searchParams.get('days') ?? '30')
  try {
    const [overview, analytics] = await Promise.all([
      cached(`overview:${user.id}:${lang}`, 45_000, () => getOverview(lang, user.id)),
      cached(`analytics:${user.id}:${lang}:${days}`, 45_000, () => getAnalytics(lang, user.id, days)),
    ])
    return ok({ overview, analytics })
  } catch (e) {
    console.error('overview error', e)
    return bad('Failed to compute overview', 500)
  }
}
