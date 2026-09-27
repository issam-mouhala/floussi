// Africa/Casablanca timezone helpers (UTC+1 year-round since 2018).
// All day/week/month boundaries in the app are computed in Casablanca wall-clock time.

export const TZ_OFFSET_MS = 1 * 3600000

/** Start of the Casablanca calendar day containing `d` (as a real UTC instant). */
export function startOfDay(d: Date | number): Date {
  const shifted = new Date((typeof d === 'number' ? d : d.getTime()) + TZ_OFFSET_MS)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - TZ_OFFSET_MS)
}

export function addDays(d: Date | number, n: number): Date {
  return new Date((typeof d === 'number' ? d : d.getTime()) + n * 86400000)
}

/** Monday-start week. */
export function startOfWeek(d: Date | number): Date {
  const day = startOfDay(d)
  const dow = (new Date(day.getTime() + TZ_OFFSET_MS).getUTCDay() + 6) % 7 // 0 = Monday
  return addDays(day, -dow)
}

export function startOfMonth(d: Date | number): Date {
  const shifted = new Date((typeof d === 'number' ? d : d.getTime()) + TZ_OFFSET_MS)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - TZ_OFFSET_MS)
}

export function addMonths(d: Date | number, n: number): Date {
  const shifted = new Date((typeof d === 'number' ? d : d.getTime()) + TZ_OFFSET_MS)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + n, 1) - TZ_OFFSET_MS)
}

/** Stable day key like `2026-09-06` in Casablanca time. */
export function dayKey(d: Date | number): string {
  const shifted = new Date((typeof d === 'number' ? d : d.getTime()) + TZ_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

/** Stable month key like `2026-09` in Casablanca time. */
export function monthKey(d: Date | number): string {
  const shifted = new Date((typeof d === 'number' ? d : d.getTime()) + TZ_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

export function daysInMonth(d: Date | number): number {
  const shifted = new Date((typeof d === 'number' ? d : d.getTime()) + TZ_OFFSET_MS)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()
}

/** Week index key like `2026-W36` in Casablanca time (used for notification dedupe). */
export function weekKey(d: Date | number): string {
  const s = startOfWeek(d)
  const shifted = new Date(s.getTime() + TZ_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-W${String(weekNumber(shifted)).padStart(2, '0')}`
}

function weekNumber(utcMonday: Date): number {
  const target = new Date(Date.UTC(utcMonday.getUTCFullYear(), utcMonday.getUTCMonth(), utcMonday.getUTCDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3) // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diff = target.getTime() - firstThursday.getTime()
  return 1 + Math.round(diff / (7 * 86400000))
}

export function isWeekendDay(d: Date | number): boolean {
  const dow = new Date((typeof d === 'number' ? d : d.getTime()) + TZ_OFFSET_MS).getUTCDay()
  return dow === 0 || dow === 6
}
