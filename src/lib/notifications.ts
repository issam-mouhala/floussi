import { db } from '@/lib/db'
import { tr, type Lang } from './i18n'
import { computeRaw } from './analytics'
import { startOfDay, startOfWeek, dayKey } from './dates'
import type { NotifDTO } from './types'

// In-memory throttle: rules re-evaluated at most every 10 minutes.
let lastRun = 0
const THROTTLE_MS = 10 * 60 * 1000

type Level = 'info' | 'success' | 'warning' | 'danger'

interface PendingRule {
  type: string
  level: Level
  key: Parameters<typeof tr>[1]
  payload: Record<string, string | number>
  dedupeKey: string
}

/**
 * Behavioral rules → deduped notifications. Each rule fires at most once per
 * day / week / month (encoded in dedupeKey), so the user is never spammed.
 */
export async function generateNotifications(userId: string, force = false): Promise<void> {
  if (!force && Date.now() - lastRun < THROTTLE_MS) return
  lastRun = Date.now()

  const raw = await computeRaw(userId)
  const week0 = startOfWeek(raw.now)
  const dk = dayKey(raw.now)
  const wk = dayKey(week0)
  const s = raw.settings
  const pending: PendingRule[] = []

  // 1) Daily budget (variable spend only — fixed bills don't count)
  const pct = raw.dailyBudgetPct
  if (s.dailyBudget > 0 && raw.today.variable > 0) {
    if (pct >= 100) {
      pending.push({
        type: 'daily_budget', level: 'danger', key: 'n.daily100',
        payload: { amount: Math.round(raw.today.variable), budget: Math.round(s.dailyBudget) },
        dedupeKey: `daily100:${dk}`,
      })
    } else if (pct >= 70) {
      pending.push({
        type: 'daily_budget', level: 'warning', key: 'n.daily70',
        payload: { pct: Math.round(pct), amount: Math.round(raw.today.variable), budget: Math.round(s.dailyBudget) },
        dedupeKey: `daily70:${dk}`,
      })
    }
  }

  // 2) Today far above the personal daily average (variable spend)
  if (raw.dailyAvgVar > 50 && raw.today.variable > raw.dailyAvgVar * 1.4 && raw.today.variable >= 100) {
    pending.push({
      type: 'above_avg', level: 'warning', key: 'n.aboveAvg',
      payload: {
        pct: `+${Math.round(((raw.today.variable - raw.dailyAvgVar) / raw.dailyAvgVar) * 100)}%`,
        avg: Math.round(raw.dailyAvgVar),
      },
      dedupeKey: `aboveAvg:${dk}`,
    })
  }

  // 3) Category spike this week (> 50% above the 4-week baseline, meaningful amount)
  for (const [slug, { week, avg }] of raw.catWeekVsAvg) {
    if (avg >= 60 && week > avg * 1.5 && week - avg >= 80) {
      const cat = await db.category.findFirst({ where: { userId, slug } })
      if (!cat) continue
      pending.push({
        type: 'category_spike', level: 'warning', key: 'n.catSpike',
        payload: {
          category: cat.nameEn,
          amount: Math.round(week),
          pct: `+${Math.round(((week - avg) / avg) * 100)}%`,
        },
        dedupeKey: `catSpike:${slug}:${wk}`,
      })
      break // one spike alert per refresh — never spam
    }
  }

  // 4) On track to save (positive reinforcement)
  if (raw.projectedSaving > 0 && s.savingsTarget > 0) {
    pending.push({
      type: 'save_track', level: 'success', key: 'n.saveTrack',
      payload: {
        amount: Math.round(raw.projectedSaving),
        target: Math.round(s.savingsTarget),
      },
      dedupeKey: `saveTrack:${dk.slice(0, 7)}`,
    })
  }

  // 5) Small frequent purchases accumulating this week
  if (raw.smallWeek.count >= 8) {
    pending.push({
      type: 'small_purchases', level: 'info', key: 'n.small',
      payload: { count: raw.smallWeek.count, amount: Math.round(raw.smallWeek.total) },
      dedupeKey: `small:${wk}`,
    })
  }

  // 6) Weekend budget (only on an actual weekend day, Casablanca time)
  if (raw.weekendBudgetSpend.isWeekend && s.weekendBudget > 0 && raw.weekendBudgetSpend.amount > s.weekendBudget) {
    const nowDow = new Date(raw.now.getTime() + 3600000).getUTCDay()
    pending.push({
      type: 'weekend', level: 'warning', key: 'n.weekend',
      payload: { amount: raw.weekendBudgetSpend.amount, budget: Math.round(s.weekendBudget) },
      dedupeKey: `weekend:${nowDow === 6 ? 'sat' : 'sun'}:${wk}`,
    })
  }

  // 7) Month-end projection over budget
  if (raw.projectedMonthEnd > s.monthlyBudget * 1.02) {
    pending.push({
      type: 'insight', level: 'warning', key: 'n.projection',
      payload: { projected: Math.round(raw.projectedMonthEnd), budget: Math.round(s.monthlyBudget) },
      dedupeKey: `projection:${dk.slice(0, 7)}`,
    })
  }

  for (const p of pending) {
    try {
      await db.appNotification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: p.dedupeKey } },
        create: {
          userId,
          type: p.type,
          level: p.level,
          key: p.key,
          payload: JSON.stringify(p.payload),
          dedupeKey: p.dedupeKey,
          read: false,
        },
        update: {},
      })
    } catch {
      // dedupe race — ignore
    }
  }
}

export async function listNotifications(lang: Lang, userId: string): Promise<NotifDTO[]> {
  const rows = await db.appNotification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 40 })
  return rows.map((r) => {
    let payload: Record<string, string | number> = {}
    try {
      payload = JSON.parse(r.payload)
    } catch {
      payload = {}
    }
    return {
      id: r.id,
      type: r.type,
      level: r.level as NotifDTO['level'],
      key: r.key,
      message: tr(lang, r.key as Parameters<typeof tr>[1], payload),
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
