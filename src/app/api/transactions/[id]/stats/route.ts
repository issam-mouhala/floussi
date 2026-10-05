import { db } from '@/lib/db'
import { bad, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { findSimilar } from '@/lib/similar'
import { cached } from '@/lib/cache'

/** Casablanca wall-clock shift used across the app (UTC+1, no DST). */
const SHIFT = 3_600_000

function monthWindow(date: Date) {
  const s = new Date(date.getTime() + SHIFT)
  const y = s.getUTCFullYear()
  const m = s.getUTCMonth()
  return { start: new Date(Date.UTC(y, m, 1) - SHIFT), end: new Date(Date.UTC(y, m + 1, 1) - SHIFT), y, m }
}

/** GET /api/transactions/[id]/stats — statistics about one transaction:
 *  share of its month, share & rank inside its category, comparison with the
 *  average expense, day context and all-time category totals. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  try {
    const result = await cached(`txstats:${user.id}:${id}`, 20_000, async () => {
    const tx = await db.transaction.findFirst({ where: { id, userId: user.id }, include: { category: true } })
    if (!tx) return null

    const { start, end } = monthWindow(tx.date)
    const monthTxs = await db.transaction.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      select: { id: true, amount: true, categoryId: true, date: true },
    })

    const monthTotal = monthTxs.reduce((a, t) => a + t.amount, 0)
    const avgTx = monthTxs.length ? monthTotal / monthTxs.length : 0

    const catTxs = monthTxs.filter((t) => t.categoryId === tx.categoryId)
    const categoryTotal = catTxs.reduce((a, t) => a + t.amount, 0)
    const sorted = [...catTxs].sort((a, b) => b.amount - a.amount)
    const categoryRank = sorted.findIndex((t) => t.id === tx.id) + 1

    // Casablanca day window of this transaction
    const dayStartInstant = Math.floor((tx.date.getTime() + SHIFT) / 86_400_000) * 86_400_000 - SHIFT
    const dayTxs = monthTxs.filter((t) => t.date >= new Date(dayStartInstant) && t.date < new Date(dayStartInstant + 86_400_000))
    const dayTotal = dayTxs.reduce((a, t) => a + t.amount, 0)

    const shiftedDay = new Date(tx.date.getTime() + SHIFT)
    const dow = shiftedDay.getUTCDay()
    const isWeekend = dow === 6 || dow === 0

    const [similarCount, sameCatAllTime] = await Promise.all([
      db.transaction.count({ where: { userId: user.id, categoryId: tx.categoryId } }),
      db.transaction.aggregate({ where: { userId: user.id, categoryId: tx.categoryId }, _sum: { amount: true } }),
    ])

    // intelligent similar-transaction detection (label/amount/category/cadence)
    const allForSimilar = await db.transaction.findMany({
      where: { userId: user.id },
      select: { id: true, amount: true, note: true, categoryId: true, date: true },
      orderBy: { date: 'desc' },
    })
    const similar = findSimilar(
      { id: tx.id, amount: tx.amount, note: tx.note, categoryId: tx.categoryId, date: tx.date.toISOString() },
      allForSimilar.map((t) => ({ ...t, date: t.date.toISOString() })),
    )

    return {
      tx: {
        id: tx.id,
        amount: tx.amount,
        note: tx.note,
        date: tx.date.toISOString(),
        necessary: tx.necessary ?? tx.category.essential,
        icon: tx.icon,
        isRecurring: tx.isRecurring,
        paymentMethod: tx.paymentMethod,
        categoryId: tx.categoryId,
        category: {
          slug: tx.category.slug,
          nameEn: tx.category.nameEn,
          nameFr: tx.category.nameFr,
          nameAr: tx.category.nameAr,
          icon: tx.category.icon,
          color: tx.category.color,
        },
      },
      stats: {
        monthCount: monthTxs.length,
        monthTotal: Math.round(monthTotal * 100) / 100,
        monthShare: monthTotal > 0 ? Math.round((tx.amount / monthTotal) * 1000) / 10 : 0,
        categoryTotal: Math.round(categoryTotal * 100) / 100,
        categoryShare: categoryTotal > 0 ? Math.round((tx.amount / categoryTotal) * 1000) / 10 : 0,
        categoryCount: catTxs.length,
        categoryRank: categoryRank || null,
        avgTx: Math.round(avgTx * 100) / 100,
        multipleOfAvg: avgTx > 0 ? Math.round((tx.amount / avgTx) * 10) / 10 : null,
        dayTotal: Math.round(dayTotal * 100) / 100,
        dayCount: dayTxs.length,
        isWeekend,
        allTimeCount: similarCount,
        allTimeTotal: Math.round((sameCatAllTime._sum.amount ?? 0) * 100) / 100,
        monthKey: `${shiftedDay.getUTCFullYear()}-${String(shiftedDay.getUTCMonth() + 1).padStart(2, '0')}`,
      },
      similar,
    }
    })
    if (!result) return bad('Transaction not found', 404)
    return ok(result)
  } catch (e) {
    console.error('tx stats error', e)
    return bad('Stats failed', 500)
  }
}
