import { bad, langFromRequest, ok, readJson } from '@/lib/api-helpers'
import { getAnalytics, getOverview } from '@/lib/analytics'
import { cached } from '@/lib/cache'

export async function GET(req: Request) {
  const lang = langFromRequest(req)
  const url = new URL(req.url)
  const days = Number(url.searchParams.get('days') ?? '30')
  try {
    const [overview, analytics] = await Promise.all([
      cached(`overview:${lang}`, 45_000, () => getOverview(lang)),
      cached(`analytics:${lang}:${days}`, 45_000, () => getAnalytics(lang, days)),
    ])
    return ok({ overview, analytics })
  } catch (e) {
    console.error('overview error', e)
    return bad('Failed to compute overview', 500)
  }
}
