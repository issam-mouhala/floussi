import { bad, langFromRequest, ok } from '@/lib/api-helpers'
import { getAnalytics } from '@/lib/analytics'
import { cached } from '@/lib/cache'

export async function GET(req: Request) {
  const lang = langFromRequest(req)
  const url = new URL(req.url)
  const days = Number(url.searchParams.get('days') ?? '30')
  try {
    const analytics = await cached(`analytics:${lang}:${days}`, 45_000, () => getAnalytics(lang, days))
    return ok(analytics)
  } catch (e) {
    console.error('analytics error', e)
    return bad('Failed to compute analytics', 500)
  }
}
