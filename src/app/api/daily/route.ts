import { ok } from '@/lib/api-helpers'
import { getDailyStats } from '@/lib/analytics'
import { cached } from '@/lib/cache'
import type { Lang } from '@/lib/i18n'

const LANGS: Lang[] = ['en', 'fr', 'ary']

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lang: Lang = LANGS.includes(url.searchParams.get('lang') as Lang) ? (url.searchParams.get('lang') as Lang) : 'en'
  const stats = await cached(`daily:${lang}`, 30_000, () => getDailyStats(lang))
  return ok(stats)
}
