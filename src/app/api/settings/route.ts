import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { getSettings } from '@/lib/analytics'
import { bustCache, cached } from '@/lib/cache'
import type { Lang } from '@/lib/i18n'

export async function GET() {
  const s = await cached('settings', 10_000, () => getSettings())
  return ok({
    displayName: s.displayName,
    language: s.language as Lang,
    currency: s.currency,
    theme: s.theme as 'light' | 'dark' | 'system',
    monthlyBudget: s.monthlyBudget,
    dailyBudget: s.dailyBudget,
    weekendBudget: s.weekendBudget,
    savingsTarget: s.savingsTarget,
  })
}

interface SettingsInput {
  displayName?: string
  language?: Lang
  theme?: 'light' | 'dark' | 'system'
  monthlyBudget?: number
  dailyBudget?: number
  weekendBudget?: number
  savingsTarget?: number
}

export async function PATCH(req: Request) {
  const body = await readJson<SettingsInput>(req)
  if (!body) return bad('Invalid body')

  const data: Record<string, unknown> = {}
  if (body.displayName?.trim()) data.displayName = body.displayName.trim().slice(0, 40)
  if (body.language === 'en' || body.language === 'fr' || body.language === 'ary') data.language = body.language
  if (body.theme === 'light' || body.theme === 'dark' || body.theme === 'system') data.theme = body.theme
  for (const k of ['monthlyBudget', 'dailyBudget', 'weekendBudget', 'savingsTarget'] as const) {
    const v = body[k]
    if (typeof v === 'number' && v >= 0 && Number.isFinite(v)) data[k] = Math.round(v * 100) / 100
  }

  await getSettings() // ensure row exists
  await db.settings.update({ where: { id: 'default' }, data })
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}
