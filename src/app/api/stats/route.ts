import { db } from '@/lib/db'
import { bad, langFromRequest, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { cached } from '@/lib/cache'
import { TZ_OFFSET_MS } from '@/lib/dates'
import { intlLocale, type Lang } from '@/lib/i18n'

/**
 * GET /api/stats?year=YYYY — YEARLY statistics (Task 21).
 *
 * The "all months + all transactions" section: per-month totals, counts,
 * necessary/unnecessary split, top category and biggest expense, plus the
 * year roll-up and all-time transaction records. Everything is computed in
 * Casablanca wall-clock time (same convention as the rest of the app).
 */
export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const lang: Lang = langFromRequest(req)
  const url = new URL(req.url)
  const yearParam = Number(url.searchParams.get('year') ?? '')

  try {
    const data = await cached(`stats:${user.id}:${lang}:${yearParam || 'cur'}`, 60_000, async () => {
      // all of the user's transactions — this is THE yearly + all-time section
      const txs = await db.transaction.findMany({
        where: { userId: user.id },
        include: { category: true },
        orderBy: { date: 'asc' },
      })

      const now = new Date()
      const nowYear = new Date(now.getTime() + TZ_OFFSET_MS).getUTCFullYear()
      const years = [...new Set(txs.map((t) => new Date(t.date.getTime() + TZ_OFFSET_MS).getUTCFullYear()))].sort(
        (a, b) => b - a,
      )
      const year =
        Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : (years[0] ?? nowYear)

      const loc = intlLocale(lang)
      const monthNames = Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(Date.UTC(2026, i, 15))),
      )
      const catName = (c: { nameEn: string; nameFr: string; nameAr: string; nameAry?: string | null }) =>
        lang === 'fr' ? c.nameFr : lang === 'ary' ? (c.nameAry?.trim() || c.nameAr) : c.nameEn

      type Agg = {
        total: number
        count: number
        necessary: number
        cats: Map<string, { name: string; icon: string; color: string; amount: number }>
        biggest: { amount: number; note: string | null } | null
      }
      const perMonth = new Map<string, Agg>()
      const yearAgg: Agg = { total: 0, count: 0, necessary: 0, cats: new Map(), biggest: null }
      const allTime = {
        txCount: 0,
        sum: 0,
        biggest: null as null | { amount: number; note: string | null; date: string },
        perMonthCount: new Map<string, number>(),
      }

      for (const t of txs) {
        const shifted = new Date(t.date.getTime() + TZ_OFFSET_MS)
        const y = shifted.getUTCFullYear()
        const mk = `${y}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
        const nec = t.necessary ?? t.category.essential

        allTime.txCount++
        allTime.sum += t.amount
        allTime.perMonthCount.set(mk, (allTime.perMonthCount.get(mk) ?? 0) + 1)
        if (!allTime.biggest || t.amount > allTime.biggest.amount) {
          allTime.biggest = { amount: t.amount, note: t.note, date: t.date.toISOString() }
        }

        if (y !== year) continue
        let agg = perMonth.get(mk)
        if (!agg) {
          agg = { total: 0, count: 0, necessary: 0, cats: new Map(), biggest: null }
          perMonth.set(mk, agg)
        }
        agg.total += t.amount
        agg.count++
        if (nec) agg.necessary += t.amount
        const cat = agg.cats.get(t.category.slug) ?? {
          name: catName(t.category),
          icon: t.category.icon,
          color: t.category.color,
          amount: 0,
        }
        cat.amount += t.amount
        agg.cats.set(t.category.slug, cat)
        if (!agg.biggest || t.amount > agg.biggest.amount) {
          agg.biggest = { amount: t.amount, note: t.note }
        }
        // year roll-up
        yearAgg.total += t.amount
        yearAgg.count++
        if (nec) yearAgg.necessary += t.amount
        const yc = yearAgg.cats.get(t.category.slug) ?? {
          name: catName(t.category),
          icon: t.category.icon,
          color: t.category.color,
          amount: 0,
        }
        yc.amount += t.amount
        yearAgg.cats.set(t.category.slug, yc)
        if (!yearAgg.biggest || t.amount > yearAgg.biggest.amount) {
          yearAgg.biggest = { amount: t.amount, note: t.note }
        }
      }

      const currentMonth = new Date(now.getTime() + TZ_OFFSET_MS).getUTCMonth()
      const months = Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`
        const agg = perMonth.get(key)
        const top = agg ? [...agg.cats.values()].sort((a, b) => b.amount - a.amount)[0] : undefined
        const future = year > nowYear || (year === nowYear && i > currentMonth)
        return {
          key,
          label: monthNames[i],
          total: Math.round(agg?.total ?? 0),
          count: agg?.count ?? 0,
          necessary: Math.round(agg?.necessary ?? 0),
          unnecessary: Math.round((agg?.total ?? 0) - (agg?.necessary ?? 0)),
          topCategory: top ? { name: top.name, icon: top.icon, color: top.color } : null,
          biggest: agg?.biggest ?? null,
          future,
        }
      })

      let busiest: { label: string; count: number } | null = null
      for (const [mk, c] of allTime.perMonthCount) {
        if (!busiest || c > busiest.count) busiest = { label: mk, count: c }
      }

      return {
        year,
        years: years.length ? years : [nowYear],
        months,
        totals: {
          total: Math.round(yearAgg.total),
          count: yearAgg.count,
          necessary: Math.round(yearAgg.necessary),
          unnecessary: Math.round(yearAgg.total - yearAgg.necessary),
          avgMonth: Math.round(yearAgg.total / Math.max(1, months.filter((m) => m.count > 0).length)),
          activeMonths: months.filter((m) => m.count > 0).length,
        },
        allTime: {
          txCount: allTime.txCount,
          avgTx: allTime.txCount ? Math.round((allTime.sum / allTime.txCount) * 100) / 100 : 0,
          biggest: allTime.biggest,
          busiestMonth: busiest ? { label: busiest.label, count: busiest.count } : null,
        },
      }
    })

    return ok(data)
  } catch (e) {
    console.error('stats error', e)
    return bad('Failed to compute yearly statistics', 500)
  }
}
