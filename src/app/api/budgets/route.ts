import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, langFromRequest, ok, readJson } from '@/lib/api-helpers'
import { computeRaw, getSettings } from '@/lib/analytics'
import { startOfMonth } from '@/lib/dates'
import { tr } from '@/lib/i18n'
import { formatMAD } from '@/lib/money'
import { bustCache, cached } from '@/lib/cache'

export async function GET(req: Request) {
  const lang = langFromRequest(req)
  const data = await cached(`budgets:${lang}`, 30_000, async () => {
  const [budgets, cats, settings] = await Promise.all([
    db.budget.findMany({ include: { category: true } }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    getSettings(),
  ])

  const raw = await computeRaw()
  const month0 = startOfMonth(raw.now)

  const rows = await Promise.all(
    budgets.map(async (b) => {
      const spentAgg = await db.transaction.aggregate({
        where: { categoryId: b.categoryId ?? undefined, date: { gte: month0 } },
        _sum: { amount: true },
      })
      const spent = spentAgg._sum?.amount ?? 0
      const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0
      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.category ? (lang === 'fr' ? b.category.nameFr : lang === 'ary' ? b.category.nameAr : b.category.nameEn) : null,
        categoryIcon: b.category?.icon ?? 'Wallet',
        categoryColor: b.category?.color ?? '#10b981',
        amount: b.amount,
        spent: Math.round(spent),
        pct,
        remaining: Math.round(b.amount - spent),
        status: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok',
      }
    })
  )

  // categories without a budget (for the picker)
  const withBudget = new Set(budgets.map((b) => b.categoryId))
  const available = cats
    .filter((c) => !withBudget.has(c.id))
    .map((c) => ({ id: c.id, name: lang === 'fr' ? c.nameFr : lang === 'ary' ? c.nameAr : c.nameEn, icon: c.icon, color: c.color }))

  const monthSpentAgg = await db.transaction.aggregate({ where: { date: { gte: month0 } }, _sum: { amount: true } })
  const monthSpent = monthSpentAgg._sum.amount ?? 0

  return {
    monthlyBudget: settings.monthlyBudget,
    dailyBudget: settings.dailyBudget,
    weekendBudget: settings.weekendBudget,
    monthSpent: Math.round(monthSpent),
    overallPct: settings.monthlyBudget > 0 ? Math.round((monthSpent / settings.monthlyBudget) * 100) : 0,
    budgets: rows.sort((a, b) => b.spent / (b.amount || 1) - a.spent / (a.amount || 1)),
    availableCategories: available,
    hint: tr(lang, 'bu.subtitle'),
    sampleFormat: formatMAD(monthSpent, lang),
  }
  })
  return ok(data)
}

interface BudgetInput {
  categoryId?: string
  amount?: number
}

export async function POST(req: Request) {
  const body = await readJson<BudgetInput>(req)
  if (!body?.categoryId || typeof body.amount !== 'number' || !(body.amount > 0)) {
    return bad('categoryId and positive amount required')
  }
  const existing = await db.budget.findUnique({ where: { categoryId: body.categoryId } })
  if (existing) {
    await db.budget.update({ where: { id: existing.id }, data: { amount: body.amount } })
    void autoBackupIfHasData().catch(() => {})
    bustCache()
    return ok({ id: existing.id, updated: true })
  }
  const created = await db.budget.create({
    data: { categoryId: body.categoryId, amount: body.amount },
  })
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ id: created.id, updated: false })
}
