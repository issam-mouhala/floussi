import { db } from '@/lib/db'
import { tr, intlLocale, type Lang } from './i18n'
import {
  startOfDay, addDays, startOfWeek, startOfMonth, addMonths,
  dayKey, monthKey, daysInMonth, isWeekendDay, TZ_OFFSET_MS,
} from './dates'

/** Format a boundary instant as its Casablanca wall-clock date label. */
const wallClock = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MS)
import type { OverviewDTO, AnalyticsDTO, SeriesPoint, TransactionDTO, CategoryDTO, DailyStatsDTO, DailyMonthDTO, DailyDayDTO } from './types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const catName = (lang: Lang, c: { nameEn: string; nameFr: string; nameAr: string; nameAry?: string | null }) =>
  lang === 'fr' ? c.nameFr : lang === 'ary' ? (c.nameAry?.trim() || c.nameAr) : c.nameEn

export async function getSettings(userId: string) {
  let s = await db.settings.findUnique({ where: { userId } })
  if (!s) {
    s = await db.settings.create({ data: { userId } })
  }
  return s
}

export async function getCategories(lang: Lang, userId: string): Promise<CategoryDTO[]> {
  const cats = await db.category.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } })
  return cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: catName(lang, c),
    nameEn: c.nameEn,
    nameFr: c.nameFr,
    nameAr: c.nameAr,
    nameAry: c.nameAry,
    icon: c.icon,
    color: c.color,
    essential: c.essential,
    sortOrder: c.sortOrder,
  }))
}

function txDTO(t: {
  id: string; amount: number; note: string | null; date: Date; necessary: boolean | null
  icon?: string | null
  isRecurring: boolean; paymentMethod: string
  category: { id: string; slug: string; nameEn: string; nameFr: string; nameAr: string; nameAry?: string | null; icon: string; color: string; essential: boolean }
}, lang: Lang): TransactionDTO {
  return {
    id: t.id,
    amount: t.amount,
    note: t.note,
    date: t.date.toISOString(),
    necessary: t.necessary ?? t.category.essential,
    icon: t.icon ?? null,
    isRecurring: t.isRecurring,
    paymentMethod: t.paymentMethod,
    category: {
      id: t.category.id,
      slug: t.category.slug,
      name: catName(lang, t.category),
      icon: t.category.icon,
      color: t.category.color,
      essential: t.category.essential,
    },
  }
}

// ---------------------------------------------------------------- raw aggregates

export interface RawStats {
  now: Date
  settings: Awaited<ReturnType<typeof getSettings>>
  today: { total: number; variable: number; necessary: number; unnecessary: number; count: number }
  week: { total: number; unnecessary: number }
  month: {
    total: number; variable: number; necessary: number; unnecessary: number; count: number
    recurringSoFar: number
  }
  dailyAvgVar: number
  recurringMonthlyAvg: number
  projectedMonthEnd: number
  projectedSaving: number
  dailyBudgetPct: number
  catMonth: Map<string, { amount: number; count: number; necessary: boolean }>
  prevMonthTotal: number
  smallWeek: { count: number; total: number }
  catWeekVsAvg: Map<string, { week: number; avg: number }>
  weekendBudgetSpend: { amount: number; isWeekend: boolean }
  total: number
}

export async function computeRaw(userId: string): Promise<RawStats> {
  const now = new Date()
  const settings = await getSettings(userId)
  const day0 = startOfDay(now)
  const week0 = startOfWeek(now)
  const month0 = startOfMonth(now)
  const gte = addMonths(month0, -4)

  const txs = await db.transaction.findMany({
    where: { userId, date: { gte } },
    include: { category: true },
  })
  const total = await db.transaction.count({ where: { userId } })

  const today = { total: 0, variable: 0, necessary: 0, unnecessary: 0, count: 0 }
  const week = { total: 0, unnecessary: 0 }
  const month = { total: 0, variable: 0, necessary: 0, unnecessary: 0, count: 0, recurringSoFar: 0 }
  const prevMonth0 = addMonths(month0, -1)
  let prevMonthTotal = 0
  const catMonth = new Map<string, { amount: number; count: number; necessary: boolean }>()
  const recurringByMonth = new Map<string, number>()
  const weekSpentByCat = new Map<string, number>()
  const priorWeeksByCat = new Map<string, number[]>() // 4 prior weeks
  const smallWeek = { count: 0, total: 0 }

  for (const t of txs) {
    const nec = t.necessary ?? t.category.essential
    const amt = t.amount
    const d = t.date

    if (d >= month0) {
      month.total += amt
      month.count++
      if (t.isRecurring) {
        month.recurringSoFar += amt
        recurringByMonth.set(monthKey(d), (recurringByMonth.get(monthKey(d)) ?? 0) + amt)
      } else {
        month.variable += amt
      }
      if (nec) month.necessary += amt
      else month.unnecessary += amt

      const slug = t.category.slug
      const agg = catMonth.get(slug) ?? { amount: 0, count: 0, necessary: false }
      agg.amount += amt
      agg.count++
      agg.necessary = nec
      catMonth.set(slug, agg)

      // small purchases this month
      if (!t.isRecurring && amt < 40) {
        // handled below for week; month-wide count not needed for rules
      }
    }

    if (d >= prevMonth0 && d < month0) prevMonthTotal += amt

    if (d >= week0) {
      week.total += amt
      if (!nec) week.unnecessary += amt
      const slug = t.category.slug
      weekSpentByCat.set(slug, (weekSpentByCat.get(slug) ?? 0) + amt)
      if (!t.isRecurring && amt < 40) {
        smallWeek.count++
        smallWeek.total += amt
      }
    }

    if (d >= day0) {
      today.total += amt
      today.count++
      if (!t.isRecurring) today.variable += amt
      if (nec) today.necessary += amt
      else today.unnecessary += amt
    }

    // category weekly baseline: 4 complete prior weeks
    if (d < week0 && d >= addDays(week0, -28)) {
      const wkIdx = 3 - Math.floor((week0.getTime() - startOfWeek(d).getTime()) / (7 * 86400000)) - 1
      const arr = priorWeeksByCat.get(t.category.slug) ?? [0, 0, 0, 0]
      arr[Math.max(0, Math.min(3, wkIdx))] += amt
      priorWeeksByCat.set(t.category.slug, arr)
    }

    // recurring monthly totals for baseline months (-3, -2, -1)
    if (t.isRecurring && d < month0 && d >= addMonths(month0, -3)) {
      recurringByMonth.set(monthKey(d), (recurringByMonth.get(monthKey(d)) ?? 0) + amt)
    }
  }

  const catWeekVsAvg = new Map<string, { week: number; avg: number }>()
  for (const [slug, weeks] of priorWeeksByCat) {
    const avg = weeks.reduce((a, b) => a + b, 0) / 4
    catWeekVsAvg.set(slug, { week: weekSpentByCat.get(slug) ?? 0, avg })
  }

  // current weekend spend (Sat 00:00 → now, Casablanca) for the weekend-budget rule
  const dowNow = new Date(now.getTime() + 3600000).getUTCDay()
  const daysSinceSat = dowNow === 6 ? 0 : dowNow === 0 ? 1 : -1
  let weekendSpend = 0
  if (daysSinceSat >= 0) {
    const satStart = addDays(startOfDay(now), -daysSinceSat)
    for (const t of txs) {
      if (t.date >= satStart) weekendSpend += t.amount
    }
  }

  const dom = Number(dayKey(now).slice(-2))
  const dim = daysInMonth(now)
  const dailyAvgVar = dom > 0 ? month.variable / dom : 0

  const baselineKeys = [monthKey(addMonths(month0, -3)), monthKey(addMonths(month0, -2)), monthKey(addMonths(month0, -1))]
  const baselineVals = baselineKeys.map((k) => recurringByMonth.get(k) ?? 0)
  const recurringMonthlyAvg = baselineVals.reduce((a, b) => a + b, 0) / 3

  const remainingDays = Math.max(0, dim - dom)
  const recurringRemaining = Math.max(0, recurringMonthlyAvg - month.recurringSoFar)
  const projectedMonthEnd = month.total + dailyAvgVar * remainingDays + recurringRemaining
  const projectedSaving = settings.monthlyBudget - projectedMonthEnd
  const dailyBudgetPct = settings.dailyBudget > 0 ? (today.variable / settings.dailyBudget) * 100 : 0

  const wkDow = dowNow
  const weekendBudgetSpend = { amount: Math.round(weekendSpend), isWeekend: wkDow === 0 || wkDow === 6 }

  return {
    now, settings,
    today, week, month, prevMonthTotal,
    dailyAvgVar, recurringMonthlyAvg,
    projectedMonthEnd, projectedSaving, dailyBudgetPct,
    catMonth, smallWeek, catWeekVsAvg, weekendBudgetSpend,
    total,
  }
}

// ---------------------------------------------------------------- overview (dashboard)

export async function getOverview(lang: Lang, userId: string): Promise<OverviewDTO> {
  const raw = await computeRaw(userId)
  const now = raw.now
  const day0 = startOfDay(now)
  const month0 = startOfMonth(now)
  const { settings } = raw

  const cats = await db.category.findMany({ where: { userId } })
  const catById = new Map(cats.map((c) => [c.id, c]))

  const txs = await db.transaction.findMany({
    where: { userId, date: { gte: addDays(day0, -13) } },
    orderBy: { date: 'desc' },
    include: { category: true },
  })
  const recentRows = await db.transaction.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    take: 6,
    include: { category: true },
  })

  // last-14-day series
  const byDay = new Map<string, { amount: number; necessary: number; unnecessary: number }>()
  for (const t of txs) {
    const nec = t.necessary ?? t.category.essential
    const k = dayKey(t.date)
    const rec = byDay.get(k) ?? { amount: 0, necessary: 0, unnecessary: 0 }
    rec.amount += t.amount
    if (nec) rec.necessary += t.amount
    else rec.unnecessary += t.amount
    byDay.set(k, rec)
  }
  const fmtDay = new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short' })
  const last14: SeriesPoint[] = []
  for (let i = 13; i >= 0; i--) {
    const d = addDays(day0, -i)
    const k = dayKey(d)
    const rec = byDay.get(k)
    last14.push({
      label: fmtDay.format(wallClock(d)),
      iso: k,
      amount: Math.round(rec?.amount ?? 0),
      necessary: Math.round(rec?.necessary ?? 0),
      unnecessary: Math.round(rec?.unnecessary ?? 0),
    })
  }

  // top category this month
  let topCategory: OverviewDTO['topCategory'] = null
  if (raw.catMonth.size > 0) {
    const sorted = [...raw.catMonth.entries()].sort((a, b) => b[1].amount - a[1].amount)
    const [slug, agg] = sorted[0]
    const cat = cats.find((c) => c.slug === slug)
    if (cat && agg.amount > 0) {
      topCategory = {
        name: catName(lang, cat),
        color: cat.color,
        icon: cat.icon,
        amount: Math.round(agg.amount),
        pct: Math.round((agg.amount / raw.month.total) * 100),
      }
    }
  }

  const savingProgressPct = settings.savingsTarget > 0
    ? clamp((raw.projectedSaving / settings.savingsTarget) * 100, 0, 100)
    : 0

  // --- month spending wheel (Expense dynamics): top categories + prorated trend vs prev month
  const wheelCats: OverviewDTO['wheel']['cats'] = [...raw.catMonth.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 8)
    .map(([slug, agg]) => {
      const cat = cats.find((c) => c.slug === slug)
      return {
        name: cat ? catName(lang, cat) : slug,
        slug,
        color: cat?.color ?? '#10b981',
        icon: cat?.icon ?? 'Wallet',
        amount: Math.round(agg.amount),
        pct: raw.month.total > 0 ? Math.max(1, Math.round((agg.amount / raw.month.total) * 100)) : 0,
      }
    })
  // prorate previous month to the same number of elapsed days for a fair comparison
  const dom = Number(dayKey(now).slice(-2))
  const prevDim = daysInMonth(addMonths(month0, -1))
  const prevProrated = prevDim > 0 ? (raw.prevMonthTotal / prevDim) * dom : 0
  const wheelChangePct = prevProrated > 0 && raw.month.total > 0
    ? Math.round(((raw.month.total - prevProrated) / prevProrated) * 100)
    : null

  return {
    todayTotal: Math.round(raw.today.total),
    todayVar: Math.round(raw.today.variable),
    todayNecessary: Math.round(raw.today.necessary),
    todayUnnecessary: Math.round(raw.today.unnecessary),
    weekTotal: Math.round(raw.week.total),
    monthTotal: Math.round(raw.month.total),
    monthNecessary: Math.round(raw.month.necessary),
    monthUnnecessary: Math.round(raw.month.unnecessary),
    monthlyBudget: settings.monthlyBudget,
    dailyBudget: settings.dailyBudget,
    weekendBudget: settings.weekendBudget,
    savingsTarget: settings.savingsTarget,
    remainingBudget: Math.round(settings.monthlyBudget - raw.month.total),
    dailyAvgVar: Math.round(raw.dailyAvgVar),
    projectedMonthEnd: Math.round(raw.projectedMonthEnd),
    projectedSaving: Math.round(raw.projectedSaving),
    savingProgressPct: Math.round(savingProgressPct),
    dailyBudgetPct: Math.round(raw.dailyBudgetPct),
    txToday: raw.today.count,
    txMonth: raw.month.count,
    txTotal: raw.total,
    topCategory,
    wheel: {
      total: Math.round(raw.month.total),
      changePct: wheelChangePct,
      cats: wheelCats,
    },
    last14,
    recent: recentRows.map((t) => txDTO(t, lang)),
    unreadCount: await db.appNotification.count({ where: { userId, read: false } }),
  }
}

// ---------------------------------------------------------------- analytics

export async function getAnalytics(lang: Lang, userId: string, days = 30): Promise<AnalyticsDTO> {
  const now = new Date()
  const day0 = startOfDay(now)
  const week0 = startOfWeek(now)
  const month0 = startOfMonth(now)
  const gte = addMonths(month0, -6)
  const txs = await db.transaction.findMany({
    where: { userId, date: { gte } },
    include: { category: true },
  })
  const cats = await db.category.findMany({ where: { userId } })
  const catBySlug = new Map(cats.map((c) => [c.slug, c]))
  const loc = intlLocale(lang)

  const necOf = (t: (typeof txs)[number]) => t.necessary ?? t.category.essential

  // --- by category (this month vs last month)
  const cur = new Map<string, { amount: number; count: number }>()
  const prev = new Map<string, number>()
  const prevMonth0 = addMonths(month0, -1)
  for (const t of txs) {
    if (t.date >= month0) {
      const agg = cur.get(t.category.slug) ?? { amount: 0, count: 0 }
      agg.amount += t.amount
      agg.count++
      cur.set(t.category.slug, agg)
    } else if (t.date >= prevMonth0) {
      prev.set(t.category.slug, (prev.get(t.category.slug) ?? 0) + t.amount)
    }
  }
  const monthTotal = [...cur.values()].reduce((a, b) => a + b.amount, 0)
  const byCategory: AnalyticsDTO['byCategory'] = [...cur.entries()]
    .map(([slug, agg]) => {
      const cat = catBySlug.get(slug)
      const prevAmount = prev.get(slug) ?? 0
      return {
        name: cat ? catName(lang, cat) : slug,
        color: cat?.color ?? '#78716c',
        icon: cat?.icon ?? 'Wallet',
        essential: cat?.essential ?? false,
        amount: Math.round(agg.amount),
        count: agg.count,
        pct: monthTotal > 0 ? Math.round((agg.amount / monthTotal) * 100) : 0,
        prevAmount: Math.round(prevAmount),
        changePct: prevAmount > 0 ? Math.round(((agg.amount - prevAmount) / prevAmount) * 100) : null,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  // --- by day (last N days)
  const dayRange = days === 90 ? 90 : 30
  const txInRange = txs.filter((t) => t.date >= addDays(day0, -(dayRange - 1)))
  const dayMap = new Map<string, number>()
  for (const t of txInRange) {
    const k = dayKey(t.date)
    dayMap.set(k, (dayMap.get(k) ?? 0) + t.amount)
  }
  const fmtDay = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' })
  const byDay: SeriesPoint[] = []
  for (let i = dayRange - 1; i >= 0; i--) {
    const d = addDays(day0, -i)
    const k = dayKey(d)
    byDay.push({ label: fmtDay.format(wallClock(d)), iso: k, amount: Math.round(dayMap.get(k) ?? 0) })
  }

  // --- by week (last 10 weeks)
  const weekMap = new Map<string, number>()
  for (const t of txs) {
    if (t.date >= addDays(week0, -63)) {
      const k = dayKey(startOfWeek(t.date))
      weekMap.set(k, (weekMap.get(k) ?? 0) + t.amount)
    }
  }
  const fmtWeek = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' })
  const byWeek: SeriesPoint[] = []
  for (let i = 9; i >= 0; i--) {
    const w0 = addDays(week0, -7 * i)
    const k = dayKey(w0)
    byWeek.push({ label: fmtWeek.format(wallClock(w0)), iso: k, amount: Math.round(weekMap.get(k) ?? 0) })
  }

  // --- by month (6 months) + necessary split
  const monthMap = new Map<string, { amount: number; necessary: number; unnecessary: number }>()
  for (const t of txs) {
    const k = monthKey(t.date)
    const rec = monthMap.get(k) ?? { amount: 0, necessary: 0, unnecessary: 0 }
    rec.amount += t.amount
    if (necOf(t)) rec.necessary += t.amount
    else rec.unnecessary += t.amount
    monthMap.set(k, rec)
  }
  const fmtMonth = new Intl.DateTimeFormat(loc, { month: 'short' })
  const byMonth: SeriesPoint[] = []
  for (let i = 5; i >= 0; i--) {
    const m0 = addMonths(month0, -i)
    const k = monthKey(m0)
    const rec = monthMap.get(k)
    byMonth.push({
      label: fmtMonth.format(wallClock(m0)),
      iso: k,
      amount: Math.round(rec?.amount ?? 0),
      necessary: Math.round(rec?.necessary ?? 0),
      unnecessary: Math.round(rec?.unnecessary ?? 0),
    })
  }

  // --- averages & records
  const dom = Number(dayKey(now).slice(-2))
  const dimThis = daysInMonth(now)
  const prevMonthVars: number[] = []
  const prevMonthDays = new Map<string, Set<string>>()
  for (const t of txs) {
    if (!t.isRecurring && t.date >= addMonths(month0, -1) && t.date < month0) {
      const k = monthKey(t.date)
      prevMonthVars.push(t.amount)
      const set = prevMonthDays.get(k) ?? new Set<string>()
      set.add(dayKey(t.date))
      prevMonthDays.set(k, set)
    }
  }
  const prevVarTotal = prevMonthVars.reduce((a, b) => a + b, 0)
  const prevActiveDays = Math.max(1, [...prevMonthDays.values()][0]?.size ?? 30)
  const avgDailyThis = dom > 0 ? monthVariable(txs, month0) / dom : 0
  const avgDailyPrev = prevVarTotal / prevActiveDays

  const highestPoint = [...byDay].sort((a, b) => b.amount - a.amount)[0]
  const highestDay = highestPoint && highestPoint.amount > 0
    ? { label: highestPoint.label, amount: highestPoint.amount }
    : null

  // --- weekend vs weekday (last 28 days)
  const weAmts: number[] = []
  const wdAmts: number[] = []
  for (const p of byDay.slice(-28)) {
    const isWe = isWeekendDay(new Date(p.iso + 'T12:00:00Z'))
    ;(isWe ? weAmts : wdAmts).push(p.amount)
  }
  const weAvg = weAmts.length ? weAmts.reduce((a, b) => a + b, 0) / weAmts.length : 0
  const wdAvg = wdAmts.length ? wdAmts.reduce((a, b) => a + b, 0) / wdAmts.length : 0
  const weekendPct = wdAvg > 0 && weAvg > 0 ? Math.round(((weAvg - wdAvg) / wdAvg) * 100) : null

  // --- recurring groups
  const recMap = new Map<string, { total: number; last: Date; cat: (typeof cats)[number] }>()
  for (const t of txs) {
    if (!t.isRecurring) continue
    const rec = recMap.get(t.note ?? t.category.slug)
    if (rec) {
      rec.total += t.amount
      if (t.date > rec.last) rec.last = t.date
    } else {
      recMap.set(t.note ?? t.category.slug, { total: t.amount, last: t.date, cat: t.category })
    }
  }
  const recurring = [...recMap.entries()]
    .map(([note, rec]) => ({
      note,
      categoryName: catName(lang, rec.cat),
      categoryColor: rec.cat.color,
      icon: rec.cat.icon,
      monthlyAvg: Math.round(rec.total / 3),
      lastDate: rec.last.toISOString(),
    }))
    .sort((a, b) => b.monthlyAvg - a.monthlyAvg)

  // --- small frequent purchases (< 40 DH, this month, non-recurring)
  const smallTxs = txs.filter((t) => t.date >= month0 && !t.isRecurring && t.amount < 40)
  const smallTotal = smallTxs.reduce((a, t) => a + t.amount, 0)

  // --- unusual spending (this month): > 2.5x the category's avg tx size (prev 3 months) and >= 300 DH
  const catAvgTx = new Map<string, { total: number; count: number }>()
  for (const t of txs) {
    if (t.date >= addMonths(month0, -3) && t.date < month0) {
      const agg = catAvgTx.get(t.category.slug) ?? { total: 0, count: 0 }
      agg.total += t.amount
      agg.count++
      catAvgTx.set(t.category.slug, agg)
    }
  }
  const unusual = txs
    .filter((t) => {
      if (t.date < month0) return false
      const base = catAvgTx.get(t.category.slug)
      if (!base || base.count === 0) return false
      const avg = base.total / base.count
      return t.amount >= Math.max(avg * 2.5, 300)
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((t) => {
      const base = catAvgTx.get(t.category.slug)!
      return {
        id: t.id,
        amount: Math.round(t.amount),
        note: t.note,
        date: t.date.toISOString(),
        categoryName: catName(lang, t.category),
        categoryColor: t.category.color,
        ratio: Math.round((t.amount / (base.total / base.count)) * 10) / 10,
      }
    })

  // --- week & month comparisons
  const weekThis = Math.round(weekMap.get(dayKey(week0)) ?? 0)
  const weekPrev = Math.round(weekMap.get(dayKey(addDays(week0, -7))) ?? 0)
  const monthDailyRateThis = dom > 0 ? (monthMap.get(monthKey(month0))?.amount ?? 0) / dom : 0
  const prevMonthDays2 = daysInMonth(addMonths(month0, -1))
  const monthDailyRatePrev = (monthMap.get(monthKey(prevMonth0))?.amount ?? 0) / prevMonthDays2
  const monthChangePct = monthDailyRatePrev > 0
    ? Math.round(((monthDailyRateThis - monthDailyRatePrev) / monthDailyRatePrev) * 100)
    : null

  // --- potential savings
  const wastedMonth = (monthMap.get(monthKey(month0))?.unnecessary ?? 0)
  const scenarios = [10, 20, 30, 50].map((pct) => ({
    pct,
    month: Math.round((wastedMonth * pct) / 100),
    year: Math.round((wastedMonth * pct * 12) / 100),
  }))
  const potentialByCategory = byCategory
    .filter((c) => !c.essential)
    .map((c) => ({ name: c.name, color: c.color, amount: c.amount }))

  return {
    byCategory,
    byDay,
    byWeek,
    byMonth,
    avgDailyThis: Math.round(avgDailyThis),
    avgDailyPrev: Math.round(avgDailyPrev),
    highestDay,
    weekendPct,
    weekThis,
    weekPrev,
    monthDailyRateThis: Math.round(monthDailyRateThis),
    monthDailyRatePrev: Math.round(monthDailyRatePrev),
    monthChangePct,
    recurring,
    small: { count: smallTxs.length, total: Math.round(smallTotal), avg: smallTxs.length ? Math.round(smallTotal / smallTxs.length) : 0 },
    unusual,
    potential: { wastedMonth: Math.round(wastedMonth), scenarios, byCategory: potentialByCategory },
  }
}

// helper: variable (non-recurring) spend this month
function monthVariable(txs: Array<{ isRecurring: boolean; amount: number; date: Date }>, month0: Date): number {
  return txs.filter((t) => !t.isRecurring && t.date >= month0).reduce((a, t) => a + t.amount, 0)
}

// ---------------------------------------------------------------- daily stats (per-date view)

/**
 * Per-day statistics for the Daily view: 3 full months of calendar data
 * (zero-filled), each day with its total / count / necessary split / top
 * categories, plus range summary KPIs.
 */
export async function getDailyStats(lang: Lang, userId: string): Promise<DailyStatsDTO> {
  const now = new Date()
  const day0 = startOfDay(now)
  const month0 = startOfMonth(now)
  const start = addMonths(month0, -2)
  const end = addMonths(month0, 1) // exclusive upper bound (covers whole current month)

  const txs = await db.transaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    include: { category: true },
    orderBy: { date: 'asc' },
  })
  const { dailyBudget } = await getSettings(userId)
  const loc = intlLocale(lang)

  // aggregate per Casablanca day
  const perDay = new Map<string, { total: number; count: number; necessary: number; cats: Map<string, { name: string; color: string; icon: string; amount: number }> }>()
  for (const t of txs) {
    const k = dayKey(t.date)
    const rec = perDay.get(k) ?? { total: 0, count: 0, necessary: 0, cats: new Map() }
    const nec = t.necessary ?? t.category.essential
    rec.total += t.amount
    rec.count++
    if (nec) rec.necessary += t.amount
    const c = rec.cats.get(t.category.slug) ?? { name: catName(lang, t.category), color: t.category.color, icon: t.category.icon, amount: 0 }
    c.amount += t.amount
    rec.cats.set(t.category.slug, c)
    perDay.set(k, rec)
  }

  // build the 3 calendar months (zero-filled)
  const fmtMonth = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' })
  const months: DailyMonthDTO[] = []
  const activeDayTotals: number[] = []
  const weekendAmts: number[] = []
  const weekdayAmts: number[] = []
  let underBudget = 0, overBudget = 0
  for (let mi = 2; mi >= 0; mi--) {
    const m0 = addMonths(month0, -mi)
    const key = monthKey(m0)
    const dim = daysInMonth(m0)
    const days: DailyDayDTO[] = []
    for (let d = 1; d <= dim; d++) {
      const iso = `${key}-${String(d).padStart(2, '0')}`
      const wall = new Date(new Date(iso + 'T12:00:00Z').getTime() - TZ_OFFSET_MS) // a mid-day instant of that Casablanca day
      const future = startOfDay(wall) > day0
      const rec = perDay.get(iso)
      const total = Math.round(rec?.total ?? 0)
      const weekend = isWeekendDay(wall)
      if (!future && rec) {
        activeDayTotals.push(total)
        ;(weekend ? weekendAmts : weekdayAmts).push(total)
        if (dailyBudget > 0) (total <= dailyBudget ? underBudget++ : overBudget++)
      }
      days.push({
        iso,
        day: d,
        total,
        count: rec?.count ?? 0,
        necessary: Math.round(rec?.necessary ?? 0),
        unnecessary: Math.round((rec ? rec.total - rec.necessary : 0)),
        weekend,
        future,
        topCats: rec
          ? [...rec.cats.values()].sort((a, b) => b.amount - a.amount).slice(0, 5).map((c) => ({ ...c, amount: Math.round(c.amount) }))
          : [],
      })
    }
    months.push({ key, label: fmtMonth.format(new Date(m0.getTime() + TZ_OFFSET_MS)), days })
  }

  const total = activeDayTotals.reduce((a, b) => a + b, 0)
  const txCount = txs.length
  const activeDays = activeDayTotals.length
  const rangeDays = activeDayTotals.length + (() => { let z = 0; for (const mo of months) for (const d of mo.days) if (!d.future && d.total === 0 && d.count === 0) z++; return z })()
  const weAvg = weekendAmts.length ? weekendAmts.reduce((a, b) => a + b, 0) / weekendAmts.length : 0
  const wdAvg = weekdayAmts.length ? weekdayAmts.reduce((a, b) => a + b, 0) / weekdayAmts.length : 0
  const unnecessaryTotal = months.reduce((acc, mo) => acc + mo.days.reduce((a, d) => a + (d.future ? 0 : d.unnecessary), 0), 0)

  return {
    months,
    summary: {
      total,
      txCount,
      activeDays,
      avgActive: activeDays ? Math.round(total / activeDays) : 0,
      avgCalendar: rangeDays ? Math.round(total / rangeDays) : 0,
      maxDay: (() => {
        let best: DailyStatsDTO['summary']['maxDay'] = null
        for (const mo of months) for (const d of mo.days) {
          if (d.future || d.total === 0) continue
          if (!best || d.total > best.total) best = { iso: d.iso, total: d.total, count: d.count }
        }
        return best
      })(),
      minDay: (() => {
        let best: DailyStatsDTO['summary']['minDay'] = null
        for (const mo of months) for (const d of mo.days) {
          if (d.future || d.total === 0) continue
          if (!best || d.total < best.total) best = { iso: d.iso, total: d.total, count: d.count }
        }
        return best
      })(),
      weekendAvg: Math.round(weAvg),
      weekdayAvg: Math.round(wdAvg),
      weekendPct: wdAvg > 0 && weAvg > 0 ? Math.round(((weAvg - wdAvg) / wdAvg) * 100) : null,
      underBudgetDays: underBudget,
      overBudgetDays: overBudget,
      dailyBudget,
      unnecessaryTotal,
      unnecessaryPct: total > 0 ? Math.round((unnecessaryTotal / total) * 100) : 0,
    },
  }
}
