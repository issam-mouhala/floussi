import { db } from '@/lib/db'
import { bad, langFromRequest, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { getCategories } from '@/lib/analytics'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bustCache, cached } from '@/lib/cache'

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const lang = langFromRequest(req)
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const cat = url.searchParams.get('category') ?? ''
  const essential = url.searchParams.get('essential') ?? '' // '' | 'yes' | 'no'
  const recurring = url.searchParams.get('recurring') ?? ''
  const days = Number(url.searchParams.get('days') ?? '0')
  const from = url.searchParams.get('from') ?? '' // ISO instant — inclusive start
  const to = url.searchParams.get('to') ?? '' // ISO instant — inclusive end
  const weekday = url.searchParams.get('weekday') ?? '' // 0=Sun..6=Sat — Casablanca weekday, recurring
  const amount = url.searchParams.get('amount') ?? '' // exact amount match (±0.005)
  const sort = url.searchParams.get('sort') ?? 'new'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 500)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
  // cache key = full filter signature (from/to ISO instants make it unique per range)
  const ck = `tx:${user.id}:${lang}|${q}|${cat}|${essential}|${recurring}|${days}|${from}|${to}|${weekday}|${amount}|${sort}|${limit}|${offset}`

  const payload = await cached(ck, 15_000, async () => {
    const where: Record<string, unknown> = { userId: user.id }
    if (from || to) {
      const df: Record<string, unknown> = {}
      const f = from ? new Date(from) : null
      const t2 = to ? new Date(to) : null
      if (f && !isNaN(f.getTime())) df.gte = f
      if (t2 && !isNaN(t2.getTime())) df.lte = t2
      if (Object.keys(df).length) where.date = df
    } else if (days > 0) {
      where.date = { gte: new Date(Date.now() - days * 86400000) }
    }
    if (cat) where.categoryId = cat
    if (recurring === 'yes') where.isRecurring = true
    if (recurring === 'no') where.isRecurring = false

    // essential/avoidable filtering resolved in JS (necessary can be null = inherit)
    let rows = await db.transaction.findMany({
      where,
      include: { category: true },
      orderBy: { date: sort === 'old' ? 'asc' : 'desc' },
    })
    if (essential === 'yes') rows = rows.filter((t) => (t.necessary ?? t.category.essential) === true)
    if (essential === 'no') rows = rows.filter((t) => (t.necessary ?? t.category.essential) === false)
    if (q) {
      // fuzzy keyword match — "khobze" finds "khobzate" (darija spelling varies):
      // token hits when included, or shares a long-enough common prefix with a word
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
      const lcpLen = (a: string, b: string) => {
        let i = 0
        while (i < a.length && i < b.length && a[i] === b[i]) i++
        return i
      }
      // cross-script bridge: consonant skeleton unifies Arabic script with
      // arabizi chat spelling — خبزة → "xbz" ≈ khobzate → "xbzt"
      const AR2LAT: Record<string, string> = {
        ب: 'b', ت: 't', ث: 't', ج: 'j', ح: 'h', خ: 'x', د: 'd', ذ: 'd', ر: 'r', ز: 'z',
        س: 's', ش: 'c', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: '3', غ: 'g', ف: 'f', ق: 'q',
        ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ي: 'y', ڤ: 'v', ڭ: 'g',
      }
      const skeleton = (word: string) => {
        const x = word.toLowerCase().replace(/kh/g, 'x').replace(/[sc]h/g, 'c').replace(/gh/g, 'g')
        let out = ''
        for (const ch of x) {
          if (AR2LAT[ch]) out += AR2LAT[ch]
          else if ('اأإآٱءئؤةىٱ'.includes(ch)) continue // vowels + hamza + ta-marbuta
          else if ('aeiouy'.includes(ch)) continue
          else if (ch === '5') out += 'x' // arabizi خ
          else if (ch === '7') out += 'h' // arabizi ح
          else if (ch === '9') out += 'q' // arabizi ق
          else if (ch === '3') out += '3' // arabizi ع
          else if (/[a-z0-9]/.test(ch)) out += ch
        }
        return out
      }
      const skHit = (nd: string) => (w: string) => {
        const ns = skeleton(nd)
        if (ns.length < 2) return false
        const hs = skeleton(w)
        const variants = w.startsWith('ال') && hs.length >= 2 ? [hs, skeleton(w.slice(2))] : [hs]
        return variants.some((s) => {
          const p = lcpLen(s, ns)
          return p >= 2 && p / Math.min(s.length, ns.length) >= 0.7
        })
      }
      const fuzzy = (hay: string, nd: string) =>
        hay.includes(nd) ||
        hay.split(/\s+/).some((w) => {
          const p = lcpLen(w, nd)
          return p >= 4 && p / Math.min(w.length, nd.length) >= 0.6
        }) ||
        hay.split(/\s+/).some(skHit(nd))
      rows = rows.filter(
        (t) =>
          tokens.some((nd) => fuzzy((t.note ?? '').toLowerCase(), nd)) ||
          tokens.some((nd) => fuzzy(t.category.nameEn.toLowerCase(), nd)) ||
          tokens.some((nd) => fuzzy(t.category.nameFr.toLowerCase(), nd)) ||
          tokens.some((nd) => fuzzy(t.category.nameAr, nd) || t.category.nameAr.split(/\s+/).some(skHit(nd)))
      )
    }
    // smart-search extras — Casablanca weekday (+1h shift, same as client grouping)
    if (weekday !== '') {
      const wd = Number(weekday)
      if (Number.isInteger(wd) && wd >= 0 && wd <= 6) rows = rows.filter((t) => new Date(t.date.getTime() + 3_600_000).getUTCDay() === wd)
    }
    if (amount !== '') {
      const av = Number(amount)
      if (isFinite(av) && av > 0) rows = rows.filter((t) => Math.abs(t.amount - av) < 0.005)
    }
    if (sort === 'high') rows.sort((a, b) => b.amount - a.amount)
    if (sort === 'low') rows.sort((a, b) => a.amount - b.amount)

    const total = rows.length
    const page = rows.slice(offset, offset + limit)
    const cats = await getCategories(lang, user.id)

    // aggregate over the WHOLE filtered set → smart-search summary card
    const sum = rows.reduce((s, t) => s + t.amount, 0)
    const maxTx = rows.reduce<(typeof rows)[number] | null>((m, t) => (!m || t.amount > m.amount ? t : m), null)
    const wdCount = [0, 0, 0, 0, 0, 0, 0]
    let ess = 0
    for (const t of rows) {
      wdCount[new Date(t.date.getTime() + 3_600_000).getUTCDay()]++
      if ((t.necessary ?? t.category.essential) === true) ess++
    }
    let topDay: number | null = null
    let topDayN = 0
    wdCount.forEach((c, i) => {
      if (c > topDayN) {
        topDayN = c
        topDay = i
      }
    })
    const agg = {
      sum: Math.round(sum * 100) / 100,
      avg: rows.length ? Math.round((sum / rows.length) * 100) / 100 : 0,
      max: maxTx ? maxTx.amount : 0,
      maxNote: maxTx ? (maxTx.note ?? cats.find((c) => c.id === maxTx.categoryId)?.name ?? null) : null,
      maxDate: maxTx ? maxTx.date.toISOString() : null,
      essPct: rows.length ? Math.round((ess * 100) / rows.length) : 0,
      topDay: rows.length >= 5 ? topDay : null,
      topDayPct: rows.length ? Math.round((topDayN * 100) / rows.length) : 0,
    }

    // exact per-category sums over the WHOLE filtered set (not just the page)
    const sumMap = new Map<string, { count: number; total: number }>()
    for (const t of rows) {
      const s = sumMap.get(t.categoryId) ?? { count: 0, total: 0 }
      s.count += 1
      s.total += t.amount
      sumMap.set(t.categoryId, s)
    }
    const catSums = [...sumMap.entries()]
      .map(([id, s]) => {
        const c = cats.find((x) => x.id === id)
        return {
          id,
          name: c?.name ?? id,
          icon: c?.icon ?? 'Circle',
          color: c?.color ?? '#71717a',
          count: s.count,
          total: Math.round(s.total * 100) / 100,
        }
      })
      .sort((a, b) => b.total - a.total)

    return {
      total,
      agg,
      catSums,
      transactions: page.map((t) => ({
        id: t.id,
        amount: t.amount,
        note: t.note,
        date: t.date.toISOString(),
        necessary: t.necessary ?? t.category.essential,
        icon: t.icon,
        isRecurring: t.isRecurring,
        paymentMethod: t.paymentMethod,
        category: {
          id: t.category.id,
          slug: t.category.slug,
          name: cats.find((c) => c.id === t.category.id)?.name ?? t.category.nameEn,
          icon: t.category.icon,
          color: t.category.color,
          essential: t.category.essential,
        },
      })),
    }
  })

  return ok(payload)
}

interface TxInput {
  amount?: number
  note?: string
  categoryId?: string
  date?: string
  necessary?: boolean | null
  icon?: string | null
  isRecurring?: boolean
  paymentMethod?: string
}

const cleanIcon = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const body = await readJson<TxInput>(req)
  if (!body || typeof body.amount !== 'number' || !(body.amount > 0)) return bad('Invalid amount')
  if (!body.categoryId) return bad('Category required')

  const cat = await db.category.findFirst({ where: { id: body.categoryId, userId: user.id } })
  if (!cat) return bad('Category not found', 404)

  const created = await db.transaction.create({
    data: {
      userId: user.id,
      amount: Math.round(body.amount * 100) / 100,
      note: body.note?.trim() || null,
      categoryId: body.categoryId,
      date: body.date ? new Date(body.date) : new Date(),
      necessary: body.necessary === null || body.necessary === undefined ? null : body.necessary,
      icon: cleanIcon(body.icon),
      isRecurring: body.isRecurring ?? false,
      paymentMethod: body.paymentMethod ?? 'cash',
    },
  })
  void autoBackupIfHasData().catch(() => {}) // event-driven safety net — never blocks
  bustCache()
  return ok({ id: created.id })
}
