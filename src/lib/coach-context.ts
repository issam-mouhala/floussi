import { db } from '@/lib/db'
import { getSettings } from '@/lib/analytics'
import {
  startOfDay, addDays, startOfWeek, startOfMonth, addMonths,
  dayKey, daysInMonth, TZ_OFFSET_MS,
} from '@/lib/dates'
import type { Lang } from '@/lib/i18n'

// Human-readable date helpers (Casablanca wall clock)
const locOf = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : lang === 'ary' ? 'ar-MA' : 'en-GB')
const wd = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(locOf(lang), { weekday: 'short' })
    .format(new Date(d.getTime() + TZ_OFFSET_MS))
const dd = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(locOf(lang), { day: 'numeric', month: 'short' })
    .format(new Date(d.getTime() + TZ_OFFSET_MS))
const hhmm = (d: Date) => {
  const s = new Date(d.getTime() + TZ_OFFSET_MS)
  return `${String(s.getUTCHours()).padStart(2, '0')}:${String(s.getUTCMinutes()).padStart(2, '0')}`
}
const catNameOf = (lang: Lang, c: { nameEn: string; nameFr: string; nameAr: string }) =>
  lang === 'fr' ? c.nameFr : lang === 'ary' ? c.nameAr : c.nameEn

/** Currency rendered in the answer language: "درهم" inside Arabic-script Darija, "DH" otherwise. */
const money = (n: number, lang: Lang) => {
  const v = Math.round(n).toLocaleString('en-US')
  return lang === 'ary' ? `${v} درهم` : `${v} DH`
}

export interface CoachBriefing {
  text: string
  txCount: number
}

/**
 * Builds a rich, plain-text FACTS briefing for the AI coach.
 * Everything is pre-computed server-side so the model NEVER has to do
 * non-trivial math or guess: it can quote numbers verbatim.
 * For Darija users the labels themselves are written in clean Moroccan
 * Darija (Arabic script, currency درهم) — the model mirrors that vocabulary
 * instead of inventing garbled MSA/Arabizi mixes.
 */
export async function buildCoachBriefing(lang: Lang, userId: string): Promise<CoachBriefing> {
  const now = new Date()
  const day0 = startOfDay(now)
  const week0 = startOfWeek(now)
  const month0 = startOfMonth(now)
  const prevMonth0 = addMonths(month0, -1)
  const settings = await getSettings(userId)

  const [cats, goals, budgets, txs] = await Promise.all([
    db.category.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
    db.savingGoal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    db.budget.findMany({ where: { userId }, include: { category: true } }),
    db.transaction.findMany({
      where: { userId, date: { gte: prevMonth0 } },
      include: { category: true },
      orderBy: { date: 'desc' },
    }),
  ])
  const catById = new Map(cats.map((c) => [c.id, c]))

  const necOf = (t: (typeof txs)[number]) => t.necessary ?? t.category.essential

  // ---- localized labels (quotable vocabulary) ---------------------------
  const LBL = lang === 'ary'
    ? {
        spentToday: 'صرفتي اليوم حتى دابا',
        txsOf: 'ديال العمليات',
        necessary: 'ضروري',
        avoidable: 'يمكن تجنبو',
        other: 'آخر',
        yesterday: 'لبارح',
        thisWeek: 'هاد السيمانة',
        sinceDay: 'من نهار',
        lastWeekFull: 'السيمانة لي فاتت كاملة',
        vsLastWeek: 'مقارنة مع السيمانة لي فاتت',
        noCompareLastWeek: 'ما كاينش معطيات على السيمانة لي فاتت',
        thisMonth: 'هاد الشهر',
        in: 'ف',
        dayOf: 'النهار',
        of: 'من',
        dailyVarAvg: 'المعدل اليومي (بلا الثابت)',
        lastMonthFull: 'الشهر لي فات فكله',
        lastMonthNec: 'ضروري',
        pace: 'الوتيرة ديالك دابا',
        ofPaceLastMonth: 'من وتيرة الشهر لي فات',
        budgetMonthly: 'الميزانية: شهريا',
        remaining: 'باقي ليك',
        daily: 'يوميا',
        weekendB: 'الويكند',
        savingsTarget: 'هدف التوفير',
        perMonth: 'فالشهر',
        projection: 'التوقع: بهاد الوتيرة نهاية الشهر ≈',
        projectedSaving: '→ يمكن توفّر ≈',
        target: 'الهدف',
        biggestCat: 'أكبر فئة هاد الشهر',
        ofSpending: 'من الصرف',
        biggestTx: 'أكبر عملية هاد الشهر',
        weekendEffect: 'الويكند (28 نهار لي فاتو)',
        weAvg: 'متوسط نهار الويكند',
        vsWd: 'مقابل السيمانة',
        weResult: 'الويكند',
        notEnoughData: 'ما كافيش المعطيات',
        smallPurchases: 'المشتريات الصغيرة (أقل من 40 درهم) هاد الشهر',
        totalling: 'بالمجموع',
        nothingToday: 'مازال ما تسجل والو اليوم',
        none: 'والو',
        essential: 'ضروري',
        avoidableTag: 'يمكن تجنبو؟',
        recurringTag: '[ثابت]',
        vsLastMonth: 'الشهر لي فات',
        txUnit: 'عمليات',
        times: '×',
        exceeded: '— فاقت الحد',
        closeLimit: '— قريب من الحد',
        saved: 'توفّرو',
        deadline: 'آخر أجل',
        stillNeeds: 'باقي ليك',
        perMonthShort: '/فالشهر',
        fixedSoFar: 'المجموع الثابت حتى دابا',
      }
    : null
  const A = LBL !== null // shorthand: is Darija briefing
  const m = (n: number) => money(n, lang)

  // ---- aggregates -------------------------------------------------------
  let today = 0, todayNec = 0, todayCount = 0
  let yesterday = 0
  let week = 0, prevWeek = 0
  let month = 0, monthNec = 0, monthCount = 0, monthVar = 0
  let prevMonth = 0, prevMonthNec = 0
  const catMonth = new Map<string, { slug: string; name: string; amount: number; count: number; nec: boolean }>()
  const catPrevMonth = new Map<string, number>()
  const weekCats = new Map<string, number>()
  const prevWeekCats = new Map<string, number>()
  const todayLines: string[] = []
  const recentLines: string[] = []
  const merchants = new Map<string, { total: number; count: number }>()

  txs.forEach((t, idx) => {
    const amt = t.amount
    const nec = necOf(t)
    const cn = catNameOf(lang, t.category)

    if (t.date >= day0) {
      today += amt; todayCount++
      if (nec) todayNec += amt
      todayLines.push(`- ${hhmm(t.date)} — ${t.note ?? cn} (${cn}) — ${m(amt)}${t.isRecurring ? (A ? ' ' + LBL!.recurringTag : ' [recurring]') : ''}`)
    } else if (t.date >= addDays(day0, -1)) {
      yesterday += amt
    }
    if (t.date >= week0) {
      week += amt
      weekCats.set(t.category.slug, (weekCats.get(t.category.slug) ?? 0) + amt)
    } else if (t.date >= addDays(week0, -7)) {
      prevWeek += amt
      prevWeekCats.set(t.category.slug, (prevWeekCats.get(t.category.slug) ?? 0) + amt)
    }
    if (t.date >= month0) {
      month += amt; monthCount++
      if (nec) monthNec += amt
      if (!t.isRecurring) monthVar += amt
      const slug = t.category.slug
      const agg = catMonth.get(slug) ?? { slug, name: cn, amount: 0, count: 0, nec }
      agg.amount += amt; agg.count++
      catMonth.set(slug, agg)
      if (t.note) {
        const mk = merchants.get(t.note) ?? { total: 0, count: 0 }
        mk.total += amt; mk.count++
        merchants.set(t.note, mk)
      }
    } else if (t.date >= prevMonth0) {
      prevMonth += amt
      if (nec) prevMonthNec += amt
      catPrevMonth.set(t.category.slug, (catPrevMonth.get(t.category.slug) ?? 0) + amt)
    }
    if (idx < 25) {
      const avoidTag = nec ? '' : (A ? ` (${LBL!.avoidableTag})` : ' (avoidable?)')
      const recTag = t.isRecurring ? (A ? ' ' + LBL!.recurringTag : ' [recurring]') : ''
      recentLines.push(`- ${wd(t.date, lang)} ${dd(t.date, lang)}، ${hhmm(t.date)} — ${t.note ?? cn} — ${cn} — ${m(amt)}${avoidTag}${recTag}`)
    }
  })

  const dom = Number(dayKey(now).slice(-2))
  const biggestTx = txs.reduce<{ amount: number; note: string; cat: string; date: Date } | null>((acc, t) => {
    if (t.date >= month0 && (!acc || t.amount > acc.amount)) {
      return { amount: t.amount, note: t.note ?? catNameOf(lang, t.category), cat: catNameOf(lang, t.category), date: t.date }
    }
    return acc
  }, null)
  const dim = daysInMonth(now)
  const remainingDays = Math.max(0, dim - dom)
  const dailyAvgVar = dom > 0 ? monthVar / dom : 0
  const remaining = Math.max(0, settings.monthlyBudget - month)
  const projected = month + dailyAvgVar * remainingDays
  const projectedSaving = settings.monthlyBudget - projected

  // weekend vs weekday (last 28 days)
  const we: number[] = [], wdk: number[] = []
  const dayTotals = new Map<string, number>()
  for (const t of txs) {
    const k = dayKey(t.date)
    dayTotals.set(k, (dayTotals.get(k) ?? 0) + t.amount)
  }
  for (let i = 0; i < 28; i++) {
    const d = addDays(day0, -i)
    const v = dayTotals.get(dayKey(d)) ?? 0
    ;(d.getUTCDay() === 0 || d.getUTCDay() === 6 ? we : wdk).push(v)
  }
  const weAvg = we.length ? we.reduce((a, b) => a + b, 0) / we.length : 0
  const wdAvg = wdk.length ? wdk.reduce((a, b) => a + b, 0) / wdk.length : 0
  const weekendDelta = wdAvg > 0 && weAvg > 0 ? Math.round(((weAvg - wdAvg) / wdAvg) * 100) : null

  // small purchases (< 40 DH, this month, non-recurring)
  const smallMonth = txs.filter((t) => t.date >= month0 && !t.isRecurring && t.amount < 40)

  const L: string[] = []
  const humanToday = new Intl.DateTimeFormat(
    locOf(lang),
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  ).format(new Date(now.getTime() + TZ_OFFSET_MS))

  L.push(`=== TODAY === ${humanToday} (Casablanca)`)

  if (txs.length === 0) {
    L.push(`
=== STATUS: DATABASE IS EMPTY ===
The user has ZERO transactions, ZERO budgets, ZERO goals. The app was just reset.
PROTOCOL: warmly welcome them, do NOT quote any number (there is none), and guide them:
1) add their first expenses with "+ Add expense" (even small ones — coffee, taxi),
2) set a monthly budget in Budgets, 3) create a saving goal. Offer to build a first
budget plan once they have 3-7 days of data. Keep it short and motivating.`)
    return { text: L.join('\n'), txCount: 0 }
  }

  // ---- QUICK ANSWERS (verbatim-quotable) --------------------------------
  if (A) {
    const wkDelta = prevWeek > 0
      ? ` (${(week >= prevWeek ? '+' : '') + Math.round(((week - prevWeek) / prevWeek) * 100)}% ${LBL!.vsLastWeek})`
      : ` (${LBL!.noCompareLastWeek})`
    const pacePct = prevMonth > 0 ? Math.round((month / (prevMonth * (dom / dim))) * 100) : null
    const top = [...catMonth.values()].sort((a, b) => b.amount - a.amount)[0]
    L.push(`
=== QUICK ANSWERS (quote these numbers verbatim — already computed) ===
- ${LBL!.spentToday}: ${m(today)} (${todayCount} ${LBL!.txsOf}؛ ${LBL!.necessary} ${m(todayNec)} / ${LBL!.avoidable} ${m(today - todayNec)})
- ${LBL!.yesterday}: ${m(yesterday)}
- ${LBL!.thisWeek} (${LBL!.sinceDay} ${dd(week0, lang)}): ${m(week)} — ${LBL!.lastWeekFull}: ${m(prevWeek)}${wkDelta}
- ${LBL!.thisMonth} (${LBL!.sinceDay} ${dd(month0, lang)}): ${m(month)} ${LBL!.in} ${monthCount} ${LBL!.txsOf}
  - ${LBL!.necessary}: ${m(monthNec)} · ${LBL!.avoidable}: ${m(month - monthNec)}
  - ${LBL!.dayOf} ${dom} ${LBL!.of} ${dim} · ${LBL!.dailyVarAvg}: ${m(dailyAvgVar)}
- ${LBL!.lastMonthFull}: ${m(prevMonth)} (${LBL!.lastMonthNec} ${m(prevMonthNec)}، ${LBL!.other} ${m(prevMonth - prevMonthNec)})${pacePct !== null ? ` — ${LBL!.pace}: ${pacePct}% ${LBL!.ofPaceLastMonth}` : ''}
- ${LBL!.budgetMonthly} ${m(settings.monthlyBudget)} → ${LBL!.remaining} ${m(remaining)} (${Math.round((remaining / settings.monthlyBudget) * 100)}%) · ${LBL!.daily} ${m(settings.dailyBudget)} · ${LBL!.weekendB} ${m(settings.weekendBudget)} · ${LBL!.savingsTarget} ${m(settings.savingsTarget)}/${LBL!.perMonth}
- ${LBL!.projection} ${m(projected)} ${LBL!.projectedSaving} ${m(Math.max(0, projectedSaving))} (${LBL!.target} ${m(settings.savingsTarget)})
- ${LBL!.biggestCat}: ${top?.name ?? LBL!.none} — ${m(top?.amount ?? 0)} (${top ? Math.round((top.amount / month) * 100) : 0}% ${LBL!.ofSpending})
- ${LBL!.biggestTx}: ${biggestTx ? `${biggestTx.note} — ${m(biggestTx.amount)} (${biggestTx.cat}، ${dd(biggestTx.date, lang)})` : LBL!.none}
- ${LBL!.weekendEffect}: ${weekendDelta === null ? LBL!.notEnoughData : `${LBL!.weAvg} ${m(weAvg)} ${LBL!.vsWd} ${m(wdAvg)} → ${LBL!.weResult} ${weekendDelta >= 0 ? '+' : ''}${weekendDelta}%`}
- ${LBL!.smallPurchases}: ${smallMonth.length} ${LBL!.totalling} ${m(smallMonth.reduce((a, t) => a + t.amount, 0))}`)
  } else {
    L.push(`
=== QUICK ANSWERS (quote these numbers verbatim — already computed) ===
- Spent TODAY so far: ${m(today)} (${todayCount} transaction${todayCount === 1 ? '' : 's'}; necessary ${m(todayNec)} / other ${m(today - todayNec)})
- Spent YESTERDAY: ${m(yesterday)}
- Spent THIS WEEK (since ${dd(week0, lang)}): ${m(week)} — last week full total: ${m(prevWeek)} (${prevWeek > 0 ? (week >= prevWeek ? '+' : '') + Math.round(((week - prevWeek) / prevWeek) * 100) + '% vs last week' : 'no data last week'})
- Spent THIS MONTH (since ${dd(month0, lang)}): ${m(month)} in ${monthCount} transactions
  - necessary/essential: ${m(monthNec)} · potentially avoidable: ${m(month - monthNec)}
  - day ${dom} of ${dim} · variable daily average: ${m(dailyAvgVar)}
- LAST MONTH full total: ${m(prevMonth)} (necessary ${m(prevMonthNec)}, other ${m(prevMonth - prevMonthNec)})${prevMonth > 0 ? ` — this month's pace so far: ${Math.round((month / (prevMonth * (dom / dim))) * 100)}% of last month's pace` : ''}
- Budget: monthly ${m(settings.monthlyBudget)} → remaining ${m(remaining)} (${Math.round((remaining / settings.monthlyBudget) * 100)}%) · daily ${m(settings.dailyBudget)} · weekend ${m(settings.weekendBudget)} · savings target ${m(settings.savingsTarget)}/month
- Projection: at this pace month-end ≈ ${m(projected)} → projected saving ≈ ${m(Math.max(0, projectedSaving))} (target ${m(settings.savingsTarget)})
- Biggest category this month: ${[...catMonth.values()].sort((a, b) => b.amount - a.amount)[0]?.name ?? 'n/a'} — ${m([...catMonth.values()].sort((a, b) => b.amount - a.amount)[0]?.amount ?? 0)} (${[...catMonth.values()].sort((a, b) => b.amount - a.amount)[0] ? Math.round((([...catMonth.values()].sort((a, b) => b.amount - a.amount)[0]!.amount / month) * 100)) : 0}% of spending)
- Biggest single expense this month: ${biggestTx ? `${biggestTx.note} — ${m(biggestTx.amount)} (${biggestTx.cat}, ${dd(biggestTx.date, lang)})` : 'n/a'}
- Weekend effect (28d): ${weekendDelta === null ? 'not enough data' : `weekend days average ${m(weAvg)} vs weekday ${m(wdAvg)} → weekend ${weekendDelta >= 0 ? '+' : ''}${weekendDelta}%`}
- Small impulse purchases (<40 DH) this month: ${smallMonth.length} totalling ${m(smallMonth.reduce((a, t) => a + t.amount, 0))}`)
  }

  // ---- TODAY'S TRANSACTIONS --------------------------------------------
  L.push(`
=== TODAY'S TRANSACTIONS (${todayCount}) ===
${todayLines.length ? todayLines.join('\n') : (A ? `- ${LBL!.nothingToday}` : '- nothing recorded yet today')}`)

  // ---- CATEGORY TABLE ---------------------------------------------------
  const sortedCats = [...catMonth.values()].sort((a, b) => b.amount - a.amount)
  L.push(`
=== SPENDING BY CATEGORY THIS MONTH ===
${sortedCats.map((c) => {
  const prev = catPrevMonth.get(c.slug) ?? 0
  const delta = prev > 0
    ? (A
        ? ` · ${LBL!.vsLastMonth} ${m(prev)} (${c.amount >= prev ? '+' : ''}${Math.round(((c.amount - prev) / prev) * 100)}%)`
        : ` vs last month ${m(prev)} (${c.amount >= prev ? '+' : ''}${Math.round(((c.amount - prev) / prev) * 100)}%)`)
    : ''
  const necTag = A ? (c.nec ? LBL!.necessary : LBL!.avoidable) : (c.nec ? 'essential' : 'AVOIDABLE')
  const sep = A ? '، ' : ', '
  const txUnit = A ? ` ${LBL!.txsOf}` : ' tx'
  return `- ${c.name}: ${m(c.amount)} (${Math.round((c.amount / month) * 100)}%${sep}${c.count}${txUnit}${sep}${necTag})${delta}`
}).join('\n') || (A ? `- ${LBL!.none}` : '- none')}`)

  // ---- RECENT TRANSACTIONS ----------------------------------------------
  L.push(`
=== LAST ${recentLines.length} TRANSACTIONS (newest first — cite these when asked "what/when did I buy") ===
${recentLines.join('\n')}`)

  // ---- TOP MERCHANTS ----------------------------------------------------
  const topMerchants = [...merchants.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6)
  if (topMerchants.length) {
    L.push(`
=== MOST FREQUENT PLACES THIS MONTH ===
${topMerchants.map(([note, mk]) => `- ${note}: ${m(mk.total)} (${mk.count}${A ? LBL!.times : 'x'})`).join('\n')}`)
  }

  // ---- CATEGORY BUDGETS -------------------------------------------------
  if (budgets.length) {
    L.push(`
=== CATEGORY BUDGETS (spent this month / limit) ===
${budgets.filter((b) => b.category).map((b) => {
  const spent = catMonth.get(b.category!.slug)?.amount ?? 0
  const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0
  const status = A ? (pct >= 100 ? ' ' + LBL!.exceeded : pct >= 80 ? ' ' + LBL!.closeLimit : '') : (pct >= 100 ? ' — EXCEEDED' : pct >= 80 ? ' — close to limit' : '')
  return `- ${catNameOf(lang, b.category!)}: ${m(spent)} / ${m(b.amount)} (${pct}%${status})`
}).join('\n')}`)
  }

  // ---- GOALS -------------------------------------------------------------
  if (goals.length) {
    L.push(`
=== SAVING GOALS ===
${goals.map((g) => {
  const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
  const dl = g.deadline ? (A ? `، ${LBL!.deadline} ${dd(g.deadline, lang)}` : `, deadline ${dd(g.deadline, lang)}`) : ''
  const needs = A ? `${LBL!.stillNeeds} ${m(Math.max(0, g.targetAmount - g.currentAmount))}` : `still needs ${m(Math.max(0, g.targetAmount - g.currentAmount))}`
  const savedW = A ? LBL!.saved : 'saved of'
  const savedTxt = A ? `${m(g.currentAmount)} ${savedW} ${LBL!.of} ${m(g.targetAmount)}` : `${m(g.currentAmount)} ${savedW} ${m(g.targetAmount)}`
  return `- ${g.emoji} ${g.title}: ${savedTxt} (${pct}%)${dl} — ${needs}`
}).join('\n')}
If asked how to reach a goal faster, use the projected monthly saving (≈ ${m(Math.max(0, projectedSaving))}) to estimate time.`)
  }

  // ---- RECURRING ---------------------------------------------------------
  const recurring = txs.filter((t) => t.isRecurring && t.date >= month0)
  if (recurring.length) {
    const seen = new Set<string>()
    const perMonth = A ? LBL!.perMonthShort : '/month'
    const lines = recurring
      .sort((a, b) => b.amount - a.amount)
      .filter((t) => { const k = t.note ?? t.category.slug; if (seen.has(k)) return false; seen.add(k); return true })
      .map((t) => `- ${t.note}: ${m(t.amount)}${perMonth} (${catNameOf(lang, t.category)})`)
    const fixed = A ? `${LBL!.fixedSoFar}: ${m(recurring.reduce((a, t) => a + t.amount, 0))}` : `Total fixed so far: ${m(recurring.reduce((a, t) => a + t.amount, 0))}`
    L.push(`
=== FIXED RECURRING CHARGES THIS MONTH ===
${lines.join('\n')}
${fixed}`)
  }

  return { text: L.join('\n'), txCount: txs.length }
}
