import { db } from '@/lib/db'
import type { Lang } from './i18n'
import type { Key } from './i18n'
import { startOfDay, addDays, startOfMonth, daysInMonth, isWeekendDay } from './dates'

/**
 * Floussi IQ — the financial intelligence engine.
 *
 * Computes a 0-100 health score and a set of live signals from the user's
 * real behaviour: month pace vs elapsed time, daily-budget adherence streak,
 * category anomalies (this week vs last week), weekend pressure, essential
 * ratio, burn rate, month-end projection and today's safe-to-spend.
 * Everything is deterministic math on the local database — instant, offline,
 * and localized server-side.
 */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const catName = (lang: Lang, c: { nameEn: string; nameFr: string; nameAr: string; nameAry?: string | null }) =>
  lang === 'fr' ? c.nameFr : lang === 'ary' ? (c.nameAry?.trim() || c.nameAr) : c.nameEn

export interface IntelligenceTip {
  key: Key
  params?: Record<string, string | number>
  tone: 'good' | 'warn' | 'bad' | 'info'
}

export interface IntelligenceDTO {
  empty: boolean
  score: number
  gradeKey: 'iq.gradeGreat' | 'iq.gradeGood' | 'iq.gradeFair' | 'iq.gradeAttention'
  burn: number // avg spend / day over the last 7 days
  projected: number // projected month-end total
  monthBudget: number
  monthSpent: number
  projectedSaving: number
  elapsedPct: number // % of the month that has passed
  usedPct: number // % of the monthly budget already used
  safeToday: number
  dailyBudget: number
  streak: number // consecutive days (ending today) under the daily budget
  anomalies: { name: string; icon: string; color: string; pct: number; delta: number }[]
  weekendShare: number // % of last-14d spend happening on weekends
  necessaryShare: number // % of this month that is essential
  tips: IntelligenceTip[]
}

export async function getIntelligence(lang: Lang, userId: string): Promise<IntelligenceDTO> {
  const s = await db.settings.findUnique({ where: { userId } })
  const monthlyBudget = s?.monthlyBudget ?? 0
  const dailyBudget = s?.dailyBudget ?? 0
  const savingsTarget = s?.savingsTarget ?? 0

  const now = new Date()
  const today = startOfDay(now)
  const mStart = startOfMonth(now)
  const dim = daysInMonth(now)
  const dayOfMonth = Math.round((today.getTime() - mStart.getTime()) / 86400000) + 1
  const daysLeft = Math.max(0, dim - dayOfMonth)
  const elapsedPct = clamp((dayOfMonth / dim) * 100, 0, 100)

  const windowStart = addDays(today, -29) // 30 days of behaviour
  const txs = await db.transaction.findMany({
    where: { userId, date: { gte: windowStart } },
    select: {
      amount: true, note: true, date: true, necessary: true,
      category: { select: { id: true, nameEn: true, nameFr: true, nameAr: true, nameAry: true, icon: true, color: true, essential: true } },
    },
  })

  if (txs.length === 0) {
    return {
      empty: true, score: 0, gradeKey: 'iq.gradeAttention', burn: 0, projected: 0,
      monthBudget: monthlyBudget, monthSpent: 0, projectedSaving: monthlyBudget,
      elapsedPct, usedPct: 0, safeToday: dailyBudget, dailyBudget, streak: 0,
      anomalies: [], weekendShare: 0, necessaryShare: 0, tips: [],
    }
  }

  const dayKeyOf = (d: Date) => startOfDay(d).getTime()
  const perDay = new Map<number, number>()
  for (const t of txs) perDay.set(dayKeyOf(t.date), (perDay.get(dayKeyOf(t.date)) ?? 0) + t.amount)
  const spentOn = (d: Date) => perDay.get(startOfDay(d).getTime()) ?? 0

  // month totals
  const monthTx = txs.filter((t) => t.date >= mStart)
  const monthSpent = monthTx.reduce((a, t) => a + t.amount, 0)
  const usedPct = monthlyBudget > 0 ? clamp((monthSpent / monthlyBudget) * 100, 0, 999) : 0

  // burn rate: last 7 days (including today so far)
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i))
  const spend7 = last7.reduce((a, d) => a + spentOn(d), 0)
  const burn = spend7 / 7
  const projected = monthSpent + burn * daysLeft
  const projectedSaving = monthlyBudget - projected

  // safe to spend today
  const perDaySafe = monthlyBudget > 0 ? (monthlyBudget - monthSpent) / Math.max(daysLeft, 1) : dailyBudget
  const safeToday = dailyBudget > 0
    ? clamp(Math.min(dailyBudget, perDaySafe), 0, dailyBudget)
    : Math.max(0, perDaySafe)

  // streak: consecutive days ending today with spend <= daily budget
  let streak = 0
  if (dailyBudget > 0) {
    for (let i = 0; i < 30; i++) {
      const d = addDays(today, -i)
      if (spentOn(d) <= dailyBudget) streak++
      else break
    }
  }

  // category anomalies: this week vs previous week
  const w1s = addDays(today, -6), w1e = addDays(today, 1)
  const w0s = addDays(today, -13), w0e = addDays(today, -6)
  const byCat = new Map<string, { cur: number; prev: number; c: (typeof txs)[number]['category'] }>()
  for (const t of txs) {
    const e = byCat.get(t.category.id) ?? { cur: 0, prev: 0, c: t.category }
    const ts = t.date.getTime()
    if (ts >= w1s.getTime() && ts < w1e.getTime()) e.cur += t.amount
    else if (ts >= w0s.getTime() && ts < w0e.getTime()) e.prev += t.amount
    byCat.set(t.category.id, e)
  }
  const anomalies = [...byCat.values()]
    .map((e) => ({ e, ratio: e.prev >= 15 && e.cur >= 15 ? e.cur / e.prev : 0 }))
    .filter((x) => x.ratio >= 1.6 && x.e.cur - x.e.prev >= 15)
    .sort((a, b) => b.e.cur - b.e.prev - (a.e.cur - a.e.prev))
    .slice(0, 2)
    .map((x) => ({
      name: catName(lang, x.e.c), icon: x.e.c.icon, color: x.e.c.color,
      pct: Math.round((x.ratio - 1) * 100), delta: Math.round(x.e.cur - x.e.prev),
    }))

  // weekend pressure over 14 days
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, -i))
  const spend14 = last14.reduce((a, d) => a + spentOn(d), 0)
  const weekend14 = last14.filter(isWeekendDay).reduce((a, d) => a + spentOn(d), 0)
  const weekendShare = spend14 > 0 ? Math.round((weekend14 / spend14) * 100) : 0

  // essential share this month
  const necOf = (t: (typeof txs)[number]) => t.necessary ?? t.category.essential
  const necessaryShare = monthSpent > 0
    ? Math.round((monthTx.filter(necOf).reduce((a, t) => a + t.amount, 0) / monthSpent) * 100)
    : 0

  // ---- score (0-100) ----
  const paceScore = clamp(35 - (usedPct - elapsedPct) * 0.7, 0, 35) // on/ahead pace → full
  const daysOk = dailyBudget > 0 ? last7.filter((d) => spentOn(d) <= dailyBudget).length : 4
  const adherenceScore = (daysOk / 7) * 25
  const essentialScore = clamp((necessaryShare - 30) / 45, 0, 1) * 20
  const savingRatio = savingsTarget > 0 ? projectedSaving / savingsTarget : projectedSaving > 0 ? 1 : 0
  const savingScore = clamp(savingRatio, 0, 1) * 20
  const score = Math.round(paceScore + adherenceScore + essentialScore + savingScore)
  const gradeKey: IntelligenceDTO['gradeKey'] =
    score >= 85 ? 'iq.gradeGreat' : score >= 70 ? 'iq.gradeGood' : score >= 55 ? 'iq.gradeFair' : 'iq.gradeAttention'

  // ---- tips (max 3) ----
  const tips: IntelligenceTip[] = []
  if (anomalies.length > 0) {
    tips.push({ key: 'iq.tipAnomaly', params: { cat: anomalies[0].name, pct: anomalies[0].pct }, tone: 'bad' })
  }
  if (monthlyBudget > 0 && usedPct > elapsedPct + 8) {
    tips.push({
      key: 'iq.tipBehindPace',
      params: { amount: Math.round(((usedPct - elapsedPct) / 100) * monthlyBudget) },
      tone: 'warn',
    })
  }
  if (safeToday <= 1 && monthlyBudget > 0) {
    tips.push({ key: 'iq.tipSafeZero', tone: 'warn' })
  }
  if (streak >= 3) {
    tips.push({ key: 'iq.tipStreak', params: { n: streak }, tone: 'good' })
  }
  if (projectedSaving > 0) {
    tips.push({ key: 'iq.tipSaving', params: { amount: Math.round(projectedSaving) }, tone: 'good' })
  }
  if (weekendShare >= 45) {
    tips.push({ key: 'iq.tipWeekend', params: { pct: weekendShare }, tone: 'info' })
  }
  if (elapsedPct > 15 && usedPct <= elapsedPct - 5) {
    tips.push({ key: 'iq.tipGoodPace', tone: 'good' })
  }
  const toneRank = { bad: 0, warn: 1, good: 2, info: 3 } as const
  tips.sort((a, b) => toneRank[a.tone] - toneRank[b.tone])

  return {
    empty: false, score, gradeKey, burn: Math.round(burn), projected: Math.round(projected),
    monthBudget: monthlyBudget, monthSpent: Math.round(monthSpent),
    projectedSaving: Math.round(projectedSaving), elapsedPct: Math.round(elapsedPct),
    usedPct: Math.round(usedPct), safeToday: Math.round(safeToday), dailyBudget,
    streak, anomalies, weekendShare, necessaryShare, tips: tips.slice(0, 3),
  }
}
