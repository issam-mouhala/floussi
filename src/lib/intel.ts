import { db } from '@/lib/db'
import type { Lang } from './i18n'
import { getIntelligence, type IntelligenceDTO } from './intelligence'
import { normLabel, detectCadence } from './similar'
import { startOfDay, addDays, startOfMonth, isWeekendDay, TZ_OFFSET_MS } from './dates'

/**
 * Intelligence Hub — the pro analytics layer on top of Floussi IQ.
 *
 * Everything is grounded in the user's REAL transactions (same FACTS-only
 * philosophy as the coach): recurring commitment groups with detected
 * cadence, top spending labels, category month-over-month trends and the
 * 7-day activity shape. Deterministic math on the local/Turso DB — instant,
 * offline, localized server-side, RTL-safe through tr() islands.
 */

const wallDay = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10)
const r2 = (n: number) => Math.round(n * 100) / 100

export interface RecurringGroupDTO {
  label: string
  count: number
  total: number
  avg: number
  cadenceDays: number | null
  lastDate: string
  categoryName: string
  icon: string
  color: string
}

export interface MerchantDTO {
  label: string
  count: number
  total: number
  categoryName: string
  icon: string
  color: string
}

export interface CatTrendDTO {
  name: string
  icon: string
  color: string
  total: number
  prev: number
  deltaPct: number | null // null = new this month (no baseline)
  sharePct: number
}

export interface IntelDTO {
  health: IntelligenceDTO
  monthTotal: number
  prevMonthTotal: number
  deltaPct: number | null
  txCount: number
  recurring: RecurringGroupDTO[]
  recurringMonthlyEstimate: number
  merchants: MerchantDTO[]
  cats: CatTrendDTO[]
  week: { date: string; total: number; weekend: boolean }[]
}

export async function getIntel(lang: Lang): Promise<IntelDTO> {
  const health = await getIntelligence(lang)

  const now = new Date()
  const today = startOfDay(now)
  const mStart = startOfMonth(now)
  const prevMStart = startOfMonth(addDays(mStart, -1))
  const since90 = addDays(today, -89)

  const txs = await db.transaction.findMany({
    where: { date: { gte: since90 } },
    select: {
      amount: true, note: true, date: true, necessary: true,
      category: { select: { id: true, nameEn: true, nameFr: true, nameAr: true, nameAry: true, icon: true, color: true, essential: true } },
    },
  })
  const txCount = await db.transaction.count()

  const catNameOf = (c: { nameEn: string; nameFr: string; nameAr: string; nameAry?: string | null }) =>
    lang === 'fr' ? c.nameFr : lang === 'ary' ? (c.nameAry?.trim() || c.nameAr) : c.nameEn

  // ---- month vs previous month -------------------------------------------
  const monthTx = txs.filter((t) => t.date >= mStart)
  const prevMonthTx = txs.filter((t) => t.date >= prevMStart && t.date < mStart)
  const monthTotal = r2(monthTx.reduce((a, t) => a + t.amount, 0))
  const prevMonthTotal = r2(prevMonthTx.reduce((a, t) => a + t.amount, 0))
  const deltaPct = prevMonthTotal > 0 ? Math.round(((monthTotal - prevMonthTotal) / prevMonthTotal) * 100) : null

  // ---- recurring commitment groups ---------------------------------------
  const groups = new Map<string, typeof txs>()
  for (const t of txs) {
    const label = normLabel(t.note ?? '')
    if (!label) continue
    const arr = groups.get(label) ?? []
    arr.push(t)
    groups.set(label, arr)
  }

  const recurring: RecurringGroupDTO[] = []
  const merchants: MerchantDTO[] = []
  for (const [label, arr] of groups) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => a.date.getTime() - b.date.getTime())
    const total = r2(arr.reduce((a, t) => a + t.amount, 0))
    // dominant category of the group
    const catCounts = new Map<string, number>()
    for (const t of arr) catCounts.set(t.category.id, (catCounts.get(t.category.id) ?? 0) + 1)
    const domCatId = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const domCat = arr.find((t) => t.category.id === domCatId)!.category

    // merchants: top spend labels over the last 30 days
    const last30 = arr.filter((t) => t.date >= addDays(today, -29))
    if (last30.length >= 1) {
      const t30total = r2(last30.reduce((a, t) => a + t.amount, 0))
      merchants.push({
        label: sorted[sorted.length - 1].note ?? label,
        count: last30.length,
        total: t30total,
        categoryName: catNameOf(domCat),
        icon: domCat.icon,
        color: domCat.color,
      })
    }

    // recurring: ≥3 occurrences — with a strict cadence when one exists
    // (weekly / biweekly / monthly), otherwise just a repeating label
    if (arr.length >= 3) {
      const gaps: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(Math.round((sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86_400_000))
      }
      const cadence = detectCadence(gaps)
      const last = sorted[sorted.length - 1]
      recurring.push({
        label: last.note ?? label,
        count: arr.length,
        total,
        avg: r2(total / arr.length),
        cadenceDays: cadence,
        lastDate: last.date.toISOString(),
        categoryName: catNameOf(domCat),
        icon: domCat.icon,
        color: domCat.color,
      })
    }
  }
  recurring.sort((a, b) => (b.cadenceDays ? 1 : 0) - (a.cadenceDays ? 1 : 0) || b.total - a.total)
  merchants.sort((a, b) => b.total - a.total)
  const topMerchants = merchants.slice(0, 6)
  const recurringMonthlyEstimate = r2(
    recurring.reduce((a, g) => {
      if (g.cadenceDays === 30 || g.cadenceDays === 31) return a + g.avg
      if (g.cadenceDays === 14) return a + g.avg * 2
      if (g.cadenceDays === 7) return a + g.avg * 4
      return a // no strict cadence → honestly excluded from the monthly estimate
    }, 0),
  )

  // ---- category month-over-month intelligence ----------------------------
  const thisMonth = new Map<string, { amt: number; cat: (typeof txs)[number]['category'] }>()
  for (const t of monthTx) {
    const e = thisMonth.get(t.category.id) ?? { amt: 0, cat: t.category }
    e.amt += t.amount
    thisMonth.set(t.category.id, e)
  }
  const prevMonth = new Map<string, number>()
  for (const t of prevMonthTx) prevMonth.set(t.category.id, (prevMonth.get(t.category.id) ?? 0) + t.amount)

  const cats: CatTrendDTO[] = [...thisMonth.entries()]
    .map(([id, { amt, cat }]) => {
      const prev = prevMonth.get(id) ?? 0
      return {
        name: catNameOf(cat),
        icon: cat.icon,
        color: cat.color,
        total: r2(amt),
        prev: r2(prev),
        deltaPct: prev > 0 ? Math.round(((amt - prev) / prev) * 100) : null,
        sharePct: monthTotal > 0 ? Math.round((amt / monthTotal) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 7)

  // ---- 7-day activity shape ---------------------------------------------
  const perDay = new Map<string, number>()
  for (const t of txs) {
    const k = wallDay(t.date)
    perDay.set(k, (perDay.get(k) ?? 0) + t.amount)
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, -(6 - i))
    const date = wallDay(d)
    return { date, total: r2(perDay.get(date) ?? 0), weekend: isWeekendDay(d) }
  })

  return {
    health,
    monthTotal,
    prevMonthTotal,
    deltaPct,
    txCount,
    recurring,
    recurringMonthlyEstimate,
    merchants: topMerchants,
    cats,
    week,
  }
}
