/**
 * Smart search for transactions — natural-language parsing in Darija (Latin +
 * Arabic script), French and English, whatever the UI language is.
 *
 *   "tnine"            → every Monday
 *   "tnine 11 decembre" → Monday 11 December (explicit date wins)
 *   "khobze"           → keyword text search
 *   "khobze 5dh"       → keyword + exact amount
 *   "had chhar" / "ce mois-ci" / "this month" → month range
 *   "11 دجنبر" / "11/12" / "decembre" → specific day / whole month
 *
 * The parser is pure and language-agnostic: it matches all three input
 * languages at once and returns structured filters + ready-to-render,
 * localized chips. `buildSmartComment` turns the server aggregate into a
 * short, human comment in the UI language.
 */

import { tr, intlLocale, type Key, type Lang } from './i18n'
import { formatMAD } from './money'

// ------------------------------------------------------------------ types

export type SmartScope =
  | 'none'
  | 'day' // explicit date ("11 decembre", "11/12")
  | 'singlemonth' // whole month ("decembre", "decembre 2025")
  | 'weekday' // recurring weekday ("tnine")
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'lastweek'
  | 'lastmonth'

export interface SmartChip {
  kind: 'when' | 'amount' | 'text'
  label: string
  /** raw substrings to strip from the input when the chip × is tapped */
  removeSpans: string[]
}

export interface SmartParse {
  /** leftover keywords → server text search ("" = keyword filter off) */
  q: string
  /** ISO instant range (day / month / relative period) */
  from: string | null
  to: string | null
  /** 0 = Sunday … 6 = Saturday (recurring weekday filter) */
  weekday: number | null
  /** exact amount filter */
  amount: number | null
  scope: SmartScope
  /** localized date/weekday label used by the smart comment */
  dateLabel: string | null
  chips: SmartChip[]
}

/** Aggregate over the WHOLE filtered set — computed server-side. */
export interface SmartAgg {
  sum: number
  avg: number
  max: number
  maxNote: string | null
  maxDate: string | null
  essPct: number
  topDay: number | null
  topDayPct: number
}

// ------------------------------------------------------- normalization

const AR_DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Normalize one word for dictionary matching (keeps the raw text untouched). */
function normWord(s: string): string {
  let x = s.toLowerCase().replace(/’/g, "'")
  x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // latin accents → plain
  x = x.replace(AR_DIACRITICS, '')
  x = x.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  x = x.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
  x = x.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
  // trim edge punctuation/quotes that stick to words in chat text
  x = x.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return x
}

// -------------------------------------------------------- dictionaries

// 0 = Sunday … 6 = Saturday — darija chat (latin, incl. 7/3 chat letters),
// MSA Arabic script, French, English.
const RAW_WEEKDAY: [string, number][] = [
  ['sunday', 0], ['dimanche', 0], ['lhad', 0], ['l7ad', 0], ['الاحد', 0], ['لحد', 0],
  ['monday', 1], ['lundi', 1], ['tnine', 1], ['tanine', 1], ['tnin', 1], ['etnine', 1], ['التنين', 1], ['تنين', 1], ['الاثنين', 1],
  ['tuesday', 2], ['mardi', 2], ['tlatt', 2], ['tlat', 2], ['talat', 2], ['tslat', 2], ['التلات', 2], ['تلات', 2], ['الثلاثاء', 2],
  ['wednesday', 3], ['mercredi', 3], ['larb3', 3], ['larbe3', 3], ['larba3', 3], ['erba3', 3], ['الاربع', 3], ['الاربعاء', 3], ['لاربع', 3], ['اربع', 3],
  ['thursday', 4], ['jeudi', 4], ['khmis', 4], ['khames', 4], ['khemis', 4], ['الخميس', 4], ['خميس', 4],
  ['friday', 5], ['vendredi', 5], ['jem3a', 5], ['jom3a', 5], ['jum3a', 5], ['jm3a', 5], ['jemaa', 5], ['الجمعه', 5], ['جمعه', 5],
  ['saturday', 6], ['samedi', 6], ['sebt', 6], ['sabt', 6], ['السبت', 6], ['سبت', 6],
]
const WEEKDAY = new Map(RAW_WEEKDAY.map(([w, n]) => [normWord(w), n]))

// 0 = January … 11 = December
const RAW_MONTH: [string, number][] = [
  ['janvier', 0], ['january', 0], ['jan', 0], ['يناير', 0],
  ['fevrier', 1], ['february', 1], ['fev', 1], ['feb', 1], ['فبراير', 1],
  ['mars', 2], ['march', 2], ['مارس', 2],
  ['avril', 3], ['april', 3], ['avr', 3], ['apr', 3], ['ابريل', 3], ['أبريل', 3],
  ['mai', 4], ['may', 4], ['ماي', 4],
  ['juin', 5], ['june', 5], ['jun', 5], ['يونيو', 5],
  ['juillet', 6], ['july', 6], ['juil', 6], ['jul', 6], ['يوليوز', 6], ['يوليو', 6],
  ['aout', 7], ['august', 7], ['aug', 7], ['غشت', 7], ['اغست', 7], ['اوت', 7],
  ['septembre', 8], ['september', 8], ['sept', 8], ['sep', 8], ['شتنبر', 8], ['سبتمبر', 8],
  ['octobre', 9], ['october', 9], ['oct', 9], ['اكتوبر', 9],
  ['novembre', 10], ['november', 10], ['nov', 10], ['نونبر', 10], ['نوفمبر', 10],
  ['decembre', 11], ['december', 11], ['dec', 11], ['دجنبر', 11], ['ديسمبر', 11],
]
const MONTH = new Map(RAW_MONTH.map(([w, n]) => [normWord(w), n]))

type PeriodKind = 'today' | 'yesterday' | 'week' | 'month' | 'lastweek' | 'lastmonth'

// multi-word relative periods (checked before single tokens)
const RAW_PHRASE: [string, PeriodKind][] = [
  ['had simana', 'week'], ['had lsimana', 'week'], ['هاد السيمانه', 'week'], ['هاد السمانه', 'week'],
  ['this week', 'week'], ['cette semaine', 'week'], ['semaine en cours', 'week'],
  ['had chhar', 'month'], ['had lchhar', 'month'], ['هاد الشهر', 'month'], ['chhar hada', 'month'],
  ['this month', 'month'], ['ce mois', 'month'], ['ce mois-ci', 'month'], ['mois en cours', 'month'],
  ['simana li fatat', 'lastweek'], ['السيمانه لي فاتت', 'lastweek'], ['السيمانة الماضيه', 'lastweek'],
  ['last week', 'lastweek'], ['semaine derniere', 'lastweek'],
  ['chhar li fat', 'lastmonth'], ['الشهر لي فات', 'lastmonth'], ['الشهر الماضي', 'lastmonth'],
  ['last month', 'lastmonth'], ['mois dernier', 'lastmonth'],
]
const PHRASE = new Map(RAW_PHRASE.map(([w, k]) => [normWord(w), k]))

// single-word relative periods
const RAW_REL: [string, PeriodKind][] = [
  ['lyoum', 'today'], ['lyum', 'today'], ['alyoum', 'today'], ['lyouma', 'today'], ['اليوم', 'today'],
  ['today', 'today'], ["aujourd'hui", 'today'],
  ['hier', 'yesterday'], ['yesterday', 'yesterday'], ['lbareh', 'yesterday'], ['lbare7', 'yesterday'],
  ['lbarah', 'yesterday'], ['lbar7', 'yesterday'], ['البارح', 'yesterday'], ['امس', 'yesterday'],
]
const REL = new Map(RAW_REL.map(([w, k]) => [normWord(w), k]))

const CURRENCY_WORDS = new Set(['dh', 'dhs', 'mad', 'درهم', 'دراهم'])

// -------------------------------------------------------------- helpers

interface Word {
  raw: string
  norm: string
  start: number
  end: number
}

function tokenize(raw: string): Word[] {
  return [...raw.matchAll(/\S+/g)].map((m) => ({
    raw: m[0],
    norm: normWord(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }))
}

function num(v: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(v)) return null
  const n = Number(v.replace(',', '.'))
  return isFinite(n) ? n : null
}

/** Day number incl. French ordinals — "1er", "21eme". */
function dayNum(v: string): number | null {
  return num(v) ?? num(v.replace(/(?:er|eme)$/i, ''))
}

/** ISO range for one local calendar day. */
function dayRange(y: number, m0: number, d: number): { from: string; to: string } {
  return {
    from: new Date(y, m0, d, 0, 0, 0, 0).toISOString(),
    to: new Date(y, m0, d, 23, 59, 59, 999).toISOString(),
  }
}

function periodRange(kind: PeriodKind): { from: string; to: string } {
  const now = new Date()
  const sod = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  if (kind === 'today') return { from: sod(now).toISOString(), to: now.toISOString() }
  if (kind === 'yesterday') {
    const s = sod(now)
    s.setDate(s.getDate() - 1)
    return { from: s.toISOString(), to: new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59, 59, 999).toISOString() }
  }
  if (kind === 'week') {
    const s = sod(now)
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7)) // Monday start
    return { from: s.toISOString(), to: now.toISOString() }
  }
  if (kind === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() }
  }
  if (kind === 'lastweek') {
    const s = sod(now)
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7) - 7)
    const e = new Date(s)
    e.setDate(e.getDate() + 7)
    e.setMilliseconds(-1)
    return { from: s.toISOString(), to: e.toISOString() }
  }
  // lastmonth
  const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const e = new Date(now.getFullYear(), now.getMonth(), 1)
  e.setMilliseconds(-1)
  return { from: s.toISOString(), to: e.toISOString() }
}

/** Most recent past occurrence of a month/day (no year given). */
function recentYear(m0: number, d: number): number {
  const now = new Date()
  const y = now.getFullYear()
  if (new Date(y, m0, d, 23, 59, 59, 999).getTime() > now.getTime()) return y - 1
  return y
}

function monthRange(y: number, m0: number): { from: string; to: string } {
  const s = new Date(y, m0, 1, 0, 0, 0, 0)
  const e = new Date(y, m0 + 1, 1)
  e.setMilliseconds(-1)
  return { from: s.toISOString(), to: e.toISOString() }
}

// ------------------------------------------------------ localized labels

const WEEKDAY_REF_SUNDAY = new Date(2026, 0, 4) // a known Sunday

export function weekdayName(wd: number, lang: Lang): string {
  const d = new Date(WEEKDAY_REF_SUNDAY)
  d.setDate(d.getDate() + wd)
  return new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long' }).format(d)
}

function dayName(y: number, m0: number, d: number, lang: Lang): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m0, d))
}

function monthName(y: number, m0: number, lang: Lang): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { month: 'long', year: 'numeric' }).format(new Date(y, m0, 1))
}

function shortDate(iso: string | null, lang: Lang): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short' })
    .format(d)
    .replace(/\.+$/, '') // fr short months carry a period — template adds its own
}

const PERIOD_KEY: Record<PeriodKind, Key> = {
  today: 'tx.dateToday',
  yesterday: 'tx.dateYesterday',
  week: 'tx.dateWeek',
  month: 'tx.dateMonth',
  lastweek: 'tx.dateLastWeek',
  lastmonth: 'tx.dateLastMonth',
}

// --------------------------------------------------------------- parser

export function parseSmartQuery(raw: string, lang: Lang): SmartParse {
  const empty: SmartParse = {
    q: raw.trim(),
    from: null,
    to: null,
    weekday: null,
    amount: null,
    scope: 'none',
    dateLabel: null,
    chips: [],
  }
  const trimmed = raw.trim()
  if (!trimmed) return empty

  const words = tokenize(trimmed)
  const taken = new Array(words.length).fill(false)
  const chips: SmartChip[] = []
  const spanOf = (i: number, j: number) => trimmed.slice(words[i].start, words[j].end)

  let from: string | null = null
  let to: string | null = null
  let weekday: number | null = null
  let amount: number | null = null
  let scope: SmartScope = 'none'
  let dateLabel: string | null = null
  let dayYMD: { y: number; m: number; d: number } | null = null
  let monthYM: { y: number; m: number } | null = null
  let periodKind: PeriodKind | null = null

  // 1) multi-word relative periods (3-gram then 2-gram, left to right)
  for (let i = 0; i < words.length; i++) {
    if (taken[i] || !words[i].norm) continue
    for (const n of [3, 2]) {
      if (i + n > words.length) continue
      const slice: string[] = []
      let ok = true
      for (let k = i; k < i + n; k++) {
        if (taken[k] || !words[k].norm) { ok = false; break }
        slice.push(words[k].norm)
      }
      if (!ok) continue
      const hit = PHRASE.get(slice.join(' '))
      if (hit) {
        for (let k = i; k < i + n; k++) taken[k] = true
        if (!periodKind) periodKind = hit
        chips.push({ kind: 'when', label: tr(lang, PERIOD_KEY[hit]), removeSpans: [spanOf(i, i + n - 1)] })
        break
      }
    }
  }

  // 2) amounts — "50dh", "50 dh", "5,50 درهم"
  for (let i = 0; i < words.length; i++) {
    if (taken[i] || !words[i].norm) continue
    const w = words[i].norm
    const glued = w.match(/^(\d{1,7}(?:[.,]\d{1,2})?)(dh|dhs|mad|درهم|دراهم)$/)
    if (glued) {
      const v = num(glued[1])
      if (v != null && v > 0 && v < 1_000_000) {
        amount = v
        taken[i] = true
        chips.push({ kind: 'amount', label: formatMAD(v, lang), removeSpans: [spanOf(i, i)] })
        continue
      }
    }
    const v = num(w)
    const next = words[i + 1]
    if (v != null && v > 0 && v < 1_000_000 && next && !taken[i + 1] && CURRENCY_WORDS.has(next.norm)) {
      amount = v
      taken[i] = true
      taken[i + 1] = true
      chips.push({ kind: 'amount', label: formatMAD(v, lang), removeSpans: [spanOf(i, i + 1)] })
      i++
    }
  }

  // 3) explicit dates — ISO "2025-12-11", slash "11/12", "11/12/2025"
  for (let i = 0; i < words.length; i++) {
    if (taken[i] || !words[i].norm) continue
    const w = words[i].norm
    const iso = w.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (iso) {
      const y = Number(iso[1]); const m = Number(iso[2]) - 1; const d = Number(iso[3])
      if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
        dayYMD = { y, m, d }
        taken[i] = true
        chips.push({ kind: 'when', label: dayName(y, m, d, lang), removeSpans: [spanOf(i, i)] })
        break
      }
    }
    const slash = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
    if (slash) {
      const d = Number(slash[1]); const m = Number(slash[2]) - 1
      let y = slash[3] ? Number(slash[3]) : null
      if (y != null && y < 100) y += 2000
      if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
        dayYMD = { y: y ?? recentYear(m, d), m, d }
        taken[i] = true
        chips.push({ kind: 'when', label: dayName(y ?? recentYear(m, d), m, d, lang), removeSpans: [spanOf(i, i)] })
        break
      }
    }
  }

  // 4) number + month adjacent pair ("11 decembre" / "دجنبر 11" [+ year])
  if (!dayYMD) {
    for (let i = 0; i < words.length; i++) {
      if (taken[i] || !words[i].norm) continue
      const w = words[i].norm
      const monthIdx = MONTH.get(w)
      const left = i > 0 ? words[i - 1] : null
      const right = i < words.length - 1 ? words[i + 1] : null
      const leftNum = left && !taken[i - 1] ? dayNum(left.norm) : null
      const rightNum = right && !taken[i + 1] ? dayNum(right.norm) : null
      // year candidates adjacent to the pair
      const after2 = i < words.length - 2 && !taken[i + 2] ? num(words[i + 2].norm) : null
      const before2 = i > 1 && !taken[i - 2] ? num(words[i - 2].norm) : null
      const asYear = (v: number | null) => (v != null && v >= 1990 && v <= 2100 ? v : null)

      if (monthIdx !== undefined && ((rightNum != null && rightNum >= 1 && rightNum <= 31) || (leftNum != null && leftNum >= 1 && leftNum <= 31))) {
        const d = rightNum != null && rightNum >= 1 && rightNum <= 31 ? rightNum : leftNum!
        const y = asYear(after2) ?? asYear(before2) ?? recentYear(monthIdx, d)
        dayYMD = { y, m: monthIdx, d }
        // consume: [before2?] num month [after2?] — keep to the tight trio
        const lo = leftNum != null && d === leftNum ? i - 1 : i
        const hi = rightNum != null && d === rightNum ? i + 1 : i
        const yAfter = asYear(after2) != null ? i + 2 : null
        const yBefore = yAfter == null && asYear(before2) != null ? i - 2 : null
        const from2 = yBefore ?? lo
        const to2 = yAfter ?? hi
        for (let k = from2; k <= to2; k++) taken[k] = true
        chips.push({ kind: 'when', label: dayName(y, monthIdx, d, lang), removeSpans: [spanOf(from2, to2)] })
        break
      }
    }
  }

  // 5) month alone (+" year") → whole month
  if (!dayYMD) {
    for (let i = 0; i < words.length; i++) {
      if (taken[i] || !words[i].norm) continue
      const m0 = MONTH.get(words[i].norm)
      if (m0 === undefined) continue
      const next = i < words.length - 1 && !taken[i + 1] ? num(words[i + 1].norm) : null
      const yearTok = next != null && next >= 1990 && next <= 2100 ? next : null
      const yr = yearTok ?? (m0 > new Date().getMonth() ? new Date().getFullYear() - 1 : new Date().getFullYear())
      const hi = yearTok != null ? i + 1 : i
      monthYM = { y: yr, m: m0 }
      for (let k = i; k <= hi; k++) taken[k] = true
      chips.push({ kind: 'when', label: monthName(yr, m0, lang), removeSpans: [spanOf(i, hi)] })
      break
    }
  }

  // 6) weekday — always consumed as a token, but only used for filtering
  //    when there is no explicit date ("tnine 11 decembre" → the date wins)
  {
    for (let i = 0; i < words.length; i++) {
      if (taken[i] || !words[i].norm) continue
      const wd = WEEKDAY.get(words[i].norm)
      if (wd !== undefined) {
        weekday = wd
        taken[i] = true
        chips.push({ kind: 'when', label: weekdayName(wd, lang), removeSpans: [spanOf(i, i)] })
        break
      }
    }
  }

  // 7) single-word relative periods
  if (!periodKind) {
    for (let i = 0; i < words.length; i++) {
      if (taken[i] || !words[i].norm) continue
      const rel = REL.get(words[i].norm)
      if (rel) {
        periodKind = rel
        taken[i] = true
        chips.push({ kind: 'when', label: tr(lang, PERIOD_KEY[rel]), removeSpans: [spanOf(i, i)] })
        break
      }
    }
  }

  // ---- resolve range + scope --------------------------------------
  if (dayYMD) {
    const r = dayRange(dayYMD.y, dayYMD.m, dayYMD.d)
    from = r.from
    to = r.to
    scope = 'day'
    dateLabel = dayName(dayYMD.y, dayYMD.m, dayYMD.d, lang)
  } else if (monthYM) {
    const r = monthRange(monthYM.y, monthYM.m)
    from = r.from
    to = r.to
    scope = 'singlemonth'
    dateLabel = monthName(monthYM.y, monthYM.m, lang)
  } else if (periodKind) {
    const r = periodRange(periodKind)
    from = r.from
    to = r.to
    scope = periodKind
    dateLabel = tr(lang, PERIOD_KEY[periodKind])
  } else if (weekday != null) {
    scope = 'weekday'
    dateLabel = weekdayName(weekday, lang)
  }
  // a weekday next to an explicit date/range is decoration — filter off
  if (scope !== 'weekday') weekday = null

  // ---- leftover keywords ------------------------------------------
  const leftoverIdx = words.map((_, i) => i).filter((i) => !taken[i] && words[i].norm)
  const leftoverWords = leftoverIdx.map((i) => words[i])
  const q = leftoverWords.map((w) => w.raw).join(' ')

  if (q) chips.push({ kind: 'text', label: q.length > 24 ? `${q.slice(0, 24)}…` : q, removeSpans: leftoverWords.map((w) => w.raw) })

  return { q, from, to, weekday, amount, scope, dateLabel, chips }
}

// ---------------------------------------------------- smart comment

/**
 * Short human comment (1–3 sentences) about the current result set,
 * written in the UI language from real aggregates.
 */
export function buildSmartComment(p: SmartParse, agg: SmartAgg | undefined, total: number, lang: Lang): string {
  const parts: string[] = []
  const a = agg
  if (!a || total === 0) {
    parts.push(tr(lang, 'tx.cmtEmpty'))
    if (p.amount != null) parts.push(tr(lang, 'tx.cmtEmptyAmount'))
    return parts.join(' ')
  }
  const sum = formatMAD(a.sum, lang)
  if (p.q) {
    parts.push(tr(lang, 'tx.cmtKeyword', { q: p.q, n: total, sum }))
  } else if (p.scope === 'day' && p.dateLabel) {
    parts.push(tr(lang, 'tx.cmtDay', { date: p.dateLabel, n: total, sum }))
  } else if (p.scope === 'singlemonth' && p.dateLabel) {
    parts.push(tr(lang, 'tx.cmtMonth', { date: p.dateLabel, n: total, sum }))
  } else if (p.scope === 'weekday' && p.dateLabel) {
    parts.push(tr(lang, 'tx.cmtWeekday', { day: p.dateLabel, n: total, sum }))
  } else if (p.scope !== 'none') {
    parts.push(tr(lang, 'tx.cmtPeriod', { n: total, sum }))
  } else if (p.amount != null) {
    parts.push(tr(lang, 'tx.cmtAmount', { amount: formatMAD(p.amount, lang), n: total }))
  }
  if (a.max > 0) {
    if (a.maxNote) {
      parts.push(tr(lang, 'tx.cmtMax', { max: formatMAD(a.max, lang), note: a.maxNote, date: shortDate(a.maxDate, lang) }))
    } else {
      parts.push(tr(lang, 'tx.cmtMaxNo', { max: formatMAD(a.max, lang), date: shortDate(a.maxDate, lang) }))
    }
  }
  if (total >= 5 && p.scope !== 'weekday' && a.topDay != null && a.topDayPct >= 40) {
    parts.push(tr(lang, 'tx.cmtTopDay', { day: weekdayName(a.topDay, lang), pct: a.topDayPct }))
  } else if (a.essPct > 0 && a.essPct < 100) {
    parts.push(tr(lang, 'tx.cmtEss', { pct: a.essPct }))
  }
  return parts.filter(Boolean).join(' ')
}
