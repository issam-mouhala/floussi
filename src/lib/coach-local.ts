import { db } from '@/lib/db'
import { getSettings } from '@/lib/analytics'
import {
  startOfDay, startOfWeek, startOfMonth, addDays, addMonths,
  daysInMonth, TZ_OFFSET_MS,
} from '@/lib/dates'
import type { Lang } from '@/lib/i18n'

/**
 * Deterministic local coach (Task 30) — the « very intelligent, 100 % correct
 * precision » answer engine.
 *
 * Why: the AI coach depends on a configured gateway (ZAI_BASE_URL/ZAI_API_KEY
 * on Vercel). When that is missing, mis-typed, rate-limited or simply down,
 * the user used to see «ما قدرناش نوصلو للكوتش» forever. This engine answers
 * the most common money questions DIRECTLY from the user's real transactions:
 *
 *   - zero external dependency, zero configuration, <100 ms, never down;
 *   - every number is computed from the database — NEVER invented, which is
 *     exactly the «précisions correctes à 100 %» guarantee;
 *   - understands Moroccan Darija in BOTH scripts (Arabic + Latin/Arabizi:
 *     "ch7al sraft had simana?"), French and English;
 *
 * /api/chat tries the AI first and falls back to this engine on ANY failure,
 * so the coach NEVER leaves the user without an answer.
 */

type Script = 'ar' | 'lat' | 'fr' | 'en'

interface Facts {
  empty: boolean
  today: number; todayCount: number; todayNec: number
  yesterday: number
  week: number; weekCount: number; prevWeek: number
  week0: Date
  month: number; monthCount: number; monthNec: number; monthVar: number
  month0: Date
  prevMonth: number; prevMonth0: Date
  dom: number; dim: number
  top: { name: string; amount: number; count: number; nec: boolean }[]
  biggest: { note: string; cat: string; amount: number; date: Date } | null
  smallCount: number; smallSum: number
  monthlyBudget: number; dailyBudget: number; savingsTarget: number
  remaining: number; projected: number; projectedSaving: number
  recent: { note: string; cat: string; amount: number; date: Date }[]
  goals: { title: string; emoji: string; pct: number }[]
  txTotal: number
}

type Intent =
  | 'greeting' | 'thanks' | 'today' | 'yesterday' | 'week' | 'month'
  | 'biggest' | 'topcat' | 'budget' | 'save' | 'recent' | 'count'
  | 'split' | 'advice' | 'summary'

// --------------------------------------------------------------- detection

const AR_RX = /[\u0600-\u06FF]/

const RX: Record<Intent, RegExp> = {
  greeting: /(السلام|سلام|صباح|مسا|أهلا|اهلا|\b(salam|salut|slt|hello|hi|bonjour|bonsoir|ahlan|cv)\b)/i,
  thanks: /(شكرا|\b(merci|chokran|shokran|thanks|thank you)\b)/i,
  today: /(اليوم|ليوم|\b(lyoum|lyuma|al youm|today|aujourd'?hui)\b)/i,
  yesterday: /(لبارح|البارح|أمس|امس|\b(lbarh|lbareh|hier|yesterday)\b)/i,
  week: /(سيمان|أسبوع|اسبوع|\b(simana|simane|semaine|week)\b)/i,
  month: /(الشهر|شهر|\b(chhar|chahar|mois|month)\b)/i,
  biggest: /(أكبر|اكبر|\b(biggest|largest|plus grosses?|plus grand\w*)\b)/i,
  topcat: /(فين كيمشي|فين ماشي|أكثر فئة|اكثر فئة|\b(top|où va|ou va|where does|which categ|quelle categ|plus gros poste)\b)/i,
  budget: /(ميزانية|باقي ليك|باقي ليا|\b(budget|mizaniya|remaining|restant|combien il me reste)\b)/i,
  save: /(توفير|نجمدي|نجمِد|توفّر|نهاية الشهر|آخر الشهر|اخر الشهر|\b(save|saving|tawfir|écono|econo|projection|fin du mois|end of (the )?month)\b)/i,
  recent: /(شنو شريت|اش شريت|آخر عمليات|اخر عمليات|شنو كلت|\b(what did i (buy|spend)|last (purchases?|transactions?)|derni[èe]res?|recent)\b)/i,
  count: /(شحال ديال العمليات|شحال من عملية|\b(how many|combien de (transactions?|dépenses?|opérations?))\b)/i,
  split: /(ضروري و|يمكن تجنبو|\b(essential|necessary|avoidable|inutile|utile)\b)/i,
  advice: /(نصيحة|نصائح|شنو نساوي|\b(advice|conseil|nasiha|astuce|tip(s)?|how (can|do) i save)\b)/i,
  summary: /(ملخص|خلاصة|\b(résumé|resume|summary|overview|situation)\b)/i,
}

const SPENT_RX = /(صرفت|\b(ch7al|chhal|sraft|sreft|japt|combien j|how much|dépens|depens|spent)\b)/i

function detectIntent(q: string): Intent {
  const s = q.trim()
  if (RX.greeting.test(s) && s.length < 40) return 'greeting'
  if (RX.thanks.test(s) && s.length < 30) return 'thanks'
  if (RX.recent.test(s)) return 'recent'
  if (RX.biggest.test(s)) return 'biggest'
  if (RX.topcat.test(s)) return 'topcat'
  if (RX.save.test(s)) return 'save'
  if (RX.budget.test(s)) return 'budget'
  if (RX.advice.test(s)) return 'advice'
  if (RX.count.test(s)) return 'count'
  if (RX.split.test(s)) return 'split'
  // period + «spent» (or a bare period question) → amount answer
  if (RX.yesterday.test(s)) return 'yesterday'
  if (RX.today.test(s)) return 'today'
  if (RX.week.test(s)) return 'week'
  if (RX.month.test(s)) return 'month'
  if (SPENT_RX.test(s)) return 'month' // «ch7al sraft?» without period → this month
  if (RX.summary.test(s)) return 'summary'
  return 'summary'
}

// ------------------------------------------------------------- facts (real)

/** Aggregates everything the engine answers with — all values come straight
 *  from the user's database. Same window conventions as the AI briefing. */
async function buildFacts(lang: Lang, userId: string): Promise<Facts> {
  const now = new Date()
  const day0 = startOfDay(now)
  const week0 = startOfWeek(now)
  const month0 = startOfMonth(now)
  const prevMonth0 = addMonths(month0, -1)
  const settings = await getSettings(userId)

  const [cats, goals, txs] = await Promise.all([
    db.category.findMany({ where: { userId }, select: { id: true, nameEn: true, nameFr: true, nameAr: true } }),
    db.savingGoal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    db.transaction.findMany({
      where: { userId, date: { gte: prevMonth0 } },
      include: { category: true },
      orderBy: { date: 'desc' },
    }),
  ])
  const catName = (c: { nameEn: string; nameFr: string; nameAr: string }) =>
    lang === 'fr' ? c.nameFr : lang === 'ary' ? c.nameAr : c.nameEn
  const catById = new Map(cats.map((c) => [c.id, c]))

  const f: Facts = {
    empty: txs.length === 0,
    today: 0, todayCount: 0, todayNec: 0,
    yesterday: 0,
    week: 0, weekCount: 0, prevWeek: 0,
    week0, month: 0, monthCount: 0, monthNec: 0, monthVar: 0,
    month0, prevMonth: 0, prevMonth0,
    dom: Number(dayKeyOf(now)), dim: daysInMonth(now),
    top: [], biggest: null, smallCount: 0, smallSum: 0,
    monthlyBudget: settings.monthlyBudget, dailyBudget: settings.dailyBudget,
    savingsTarget: settings.savingsTarget,
    remaining: 0, projected: 0, projectedSaving: 0,
    recent: [], goals: [], txTotal: txs.length,
  }

  const catMonth = new Map<string, { name: string; amount: number; count: number; nec: boolean; slug: string }>()
  let biggest: Facts['biggest'] = null

  for (const t of txs) {
    const amt = t.amount
    const nec = t.necessary ?? t.category.essential
    const cn = catName(t.category)

    if (t.date >= day0) {
      f.today += amt; f.todayCount++
      if (nec) f.todayNec += amt
    } else if (t.date >= addDays(day0, -1)) f.yesterday += amt

    if (t.date >= week0) { f.week += amt; f.weekCount++ }
    else if (t.date >= addDays(week0, -7)) f.prevWeek += amt

    if (t.date >= month0) {
      f.month += amt; f.monthCount++
      if (nec) f.monthNec += amt
      if (!t.isRecurring) f.monthVar += amt
      const agg = catMonth.get(t.category.slug)
        ?? { name: cn, amount: 0, count: 0, nec, slug: t.category.slug }
      agg.amount += amt; agg.count++
      catMonth.set(t.category.slug, agg)
      if (!biggest || amt > biggest.amount)
        biggest = { note: t.note ?? cn, cat: cn, amount: amt, date: t.date }
      if (!t.isRecurring && amt < 40) { f.smallCount++; f.smallSum += amt }
    } else if (t.date >= prevMonth0) {
      f.prevMonth += amt
    }

    if (f.recent.length < 6) f.recent.push({ note: t.note ?? cn, cat: cn, amount: amt, date: t.date })
  }

  f.biggest = biggest
  f.top = [...catMonth.values()].sort((a, b) => b.amount - a.amount).map(({ name, amount, count, nec }) => ({ name, amount, count, nec }))
  f.remaining = Math.max(0, f.monthlyBudget - f.month)
  const remainingDays = Math.max(0, f.dim - f.dom)
  const dailyVar = f.dom > 0 ? f.monthVar / f.dom : 0
  f.projected = Math.round(f.month + dailyVar * remainingDays)
  f.projectedSaving = Math.max(0, f.monthlyBudget - f.projected)
  f.goals = goals.map((g) => ({
    title: g.title, emoji: g.emoji,
    pct: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
  }))
  return f
}

function dayKeyOf(d: Date): string {
  const s = new Date(d.getTime() + TZ_OFFSET_MS)
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`
}

// ------------------------------------------------------------- formatting

const loc = (s: Script) => (s === 'fr' ? 'fr-FR' : s === 'ar' ? 'ar-MA' : 'en-GB')
const wd = (d: Date, s: Script) =>
  new Intl.DateTimeFormat(loc(s), { weekday: 'short' }).format(new Date(d.getTime() + TZ_OFFSET_MS))
const dd = (d: Date, s: Script) =>
  new Intl.DateTimeFormat(loc(s), { day: 'numeric', month: 'short' }).format(new Date(d.getTime() + TZ_OFFSET_MS))
const money = (n: number, s: Script) => `${Math.round(n).toLocaleString('en-US')} ${s === 'ar' ? 'درهم' : 'DH'}`
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

// --------------------------------------------------------------- answers

function answer(intent: Intent, s: Script, f: Facts): string {
  const m = (n: number) => money(n, s)
  const todayAvoid = f.today - f.todayNec
  const monthAvoid = f.month - f.monthNec

  if (f.empty) {
    // No numbers exist — guide instead (same protocol as the AI briefing).
    if (s === 'ar')
      return 'السلام! 👋 الحساب ديالك خاوي دابا. بدا زيد أول مصروف بـ «+ زيد مصروف» — قهوة ولا تاكسي — و من بعد أسبوع عندك أرقام حقيقية، سولني «شحال صرفت هاد السيمانة؟» و نجاوبك بالضبط.'
    if (s === 'lat')
      return 'Salam! 👋 Le compte est vide pour le moment. Commence par ajouter ta première dépense avec « + Ajouter » — même un café ou un taxi. Après quelques jours, demande-moi « ch7al sraft had simana? » et je réponds avec tes vrais chiffres.'
    if (s === 'fr')
      return `Bonjour ! 👋 Votre compte est encore vide. Commencez par ajouter une première dépense avec « + Ajouter » — même un café ou un taxi. Après quelques jours, demandez-moi « combien j'ai dépensé cette semaine ? » et je répondrai avec vos vrais chiffres.`
    return 'Hi! 👋 Your account is empty for now. Start by adding your first expense with « + Add » — even a coffee or a taxi. After a few days, ask me « how much did I spend this week? » and I will answer with your real numbers.'
  }

  const top1 = f.top[0]
  const top2 = f.top[1]
  const weekDelta = f.prevWeek > 0 ? Math.round(((f.week - f.prevWeek) / f.prevWeek) * 100) : null
  const cmp = weekDelta === null ? '' : s === 'ar' ? ` (${weekDelta >= 0 ? '+' : ''}${weekDelta}% مقابل السيمانة لي فاتت)` : s === 'fr' ? ` (${weekDelta >= 0 ? '+' : ''}${weekDelta}% vs semaine dernière)` : s === 'lat' ? ` (${weekDelta >= 0 ? '+' : ''}${weekDelta}% vs simana li fatat)` : ` (${weekDelta >= 0 ? '+' : ''}${weekDelta}% vs last week)`

  switch (intent) {
    case 'greeting':
      if (s === 'ar')
        return `السلام! 👋 أنا الكوتش ديالك. كنشوف {n} عملية ديالك. سولني مثلا «شحال صرفت هاد السيمانة؟» ولا «فين كيمشي الفلوس؟» — الجواب ديما بأرقام حقيقية من الحساب ديالك.`
          .replace('{n}', String(f.txTotal))
      if (s === 'lat')
        return `Salam! 👋 Ana l-coach dyalek. Kanchouf ${f.txTotal} opérations dyalek. Sowelni « ch7al sraft had simana? » wla « fin kaymchi l-flous? » — l-jawab dima b-arqam s7i7.`
      if (s === 'fr')
        return `Bonjour ! 👋 Je suis votre coach et je vois vos ${f.txTotal} opérations. Demandez par exemple « combien j'ai dépensé cette semaine ? » ou « où va mon argent ? » — toujours avec vos vrais chiffres.`
      return `Hi! 👋 I'm your coach and I can see your ${f.txTotal} transactions. Ask me things like « how much did I spend this week? » or « where does my money go? » — always answered with your real numbers.`

    case 'thanks':
      if (s === 'ar') return 'بلا جميل! 😊 إلا بغيتي شي حاجة أخرى — سولني على الصرف، الميزانية ولا نصائح التوفير.'
      if (s === 'lat') return 'Bla djamil! 😊 Ila bghiti chi haja okhra — sowelni 3la l-sarf, l-budget wla nasaih t-tawfir.'
      if (s === 'fr') return 'Avec plaisir ! 😊 Besoin d\'autre chose ? Interrogez-moi sur vos dépenses, votre budget ou des conseils d\'économie.'
      return 'My pleasure! 😊 Anything else? Ask me about your spending, budget or saving tips.'

    case 'today':
      if (s === 'ar')
        return `صرفتي اليوم ${m(f.today)} على ${f.todayCount} عمليات (ضروري ${m(f.todayNec)} · يمكن تجنبو ${m(todayAvoid)}).${f.yesterday > 0 ? ` لبارح: ${m(f.yesterday)}.` : ''}`
      if (s === 'lat')
        return `Srafti lyoum ${m(f.today)} f ${f.todayCount} opérations (essentiel ${m(f.todayNec)} · avoidable ${m(todayAvoid)}).${f.yesterday > 0 ? ` Lbarh: ${m(f.yesterday)}.` : ''}`
      if (s === 'fr')
        return `Aujourd'hui : ${m(f.today)} dépensés en ${f.todayCount} opération${f.todayCount === 1 ? '' : 's'} (essentiel ${m(f.todayNec)} · évitable ${m(todayAvoid)}).${f.yesterday > 0 ? ` Hier : ${m(f.yesterday)}.` : ''}`
      return `Today so far: ${m(f.today)} across ${f.todayCount} transaction${f.todayCount === 1 ? '' : 's'} (essential ${m(f.todayNec)} · avoidable ${m(todayAvoid)}).${f.yesterday > 0 ? ` Yesterday: ${m(f.yesterday)}.` : ''}`

    case 'yesterday':
      if (s === 'ar')
        return `لبارح صرفتي ${m(f.yesterday)}. اليوم حتى دابا: ${m(f.today)} على ${f.todayCount} عمليات.`
      if (s === 'lat')
        return `Lbarh srafti ${m(f.yesterday)}. Lyoum hta daba: ${m(f.today)} f ${f.todayCount} opérations.`
      if (s === 'fr')
        return `Hier : ${m(f.yesterday)}. Aujourd'hui jusqu'ici : ${m(f.today)} en ${f.todayCount} opérations.`
      return `Yesterday: ${m(f.yesterday)}. Today so far: ${m(f.today)} across ${f.todayCount} transactions.`

    case 'week':
      if (s === 'ar')
        return `هاد السيمانة (من ${dd(f.week0, s)}): صرفتي ${m(f.week)} على ${f.weekCount} عمليات${cmp}. أكبر فئة: ${top1 ? `${top1.name} ${m(top1.amount)}` : 'والو'}.`
      if (s === 'lat')
        return `Had simana (mn ${dd(f.week0, s)}): srafti ${m(f.week)} f ${f.weekCount} opérations${cmp}. Akbar catégorie: ${top1 ? `${top1.name} ${m(top1.amount)}` : 'walou'}.`
      if (s === 'fr')
        return `Cette semaine (depuis ${dd(f.week0, s)}) : ${m(f.week)} en ${f.weekCount} opérations${cmp}. Plus grosse catégorie : ${top1 ? `${top1.name} ${m(top1.amount)}` : 'aucune'}.`
      return `This week (since ${dd(f.week0, s)}): ${m(f.week)} across ${f.weekCount} transactions${cmp}. Biggest category: ${top1 ? `${top1.name} ${m(top1.amount)}` : 'none'}.`

    case 'month':
      if (s === 'ar')
        return `هاد الشهر (من ${dd(f.month0, s)}): ${m(f.month)} ف ${f.monthCount} عمليات. ضروري ${m(f.monthNec)} · يمكن تجنبو ${m(monthAvoid)}. أكبر فئة: ${top1 ? `${top1.name} بـ ${m(top1.amount)}` : 'والو'}.`
      if (s === 'lat')
        return `Had chhar (mn ${dd(f.month0, s)}): ${m(f.month)} f ${f.monthCount} opérations. Essentiel ${m(f.monthNec)} · avoidable ${m(monthAvoid)}. Akbar catégorie: ${top1 ? `${top1.name} b-${m(top1.amount)}` : 'walou'}.`
      if (s === 'fr')
        return `Ce mois-ci (depuis ${dd(f.month0, s)}) : ${m(f.month)} en ${f.monthCount} opérations. Essentiel ${m(f.monthNec)} · évitable ${m(monthAvoid)}. Plus grosse catégorie : ${top1 ? `${top1.name} avec ${m(top1.amount)}` : 'aucune'}.`
      return `This month (since ${dd(f.month0, s)}): ${m(f.month)} across ${f.monthCount} transactions. Essential ${m(f.monthNec)} · avoidable ${m(monthAvoid)}. Biggest category: ${top1 ? `${top1.name} at ${m(top1.amount)}` : 'none'}.`

    case 'biggest': {
      if (!f.biggest)
        return s === 'ar' ? 'ما كاين حتى عملية هاد الشهر.' : s === 'fr' ? 'Aucune dépense ce mois-ci.' : s === 'lat' ? 'Makayn hta opération had chhar.' : 'No transactions this month yet.'
      const b = f.biggest
      if (s === 'ar')
        return `أكبر عملية هاد الشهر: ${b.note} — ${m(b.amount)} (${b.cat}، ${dd(b.date, s)}).`
      if (s === 'lat')
        return `Akbar opération had chhar: ${b.note} — ${m(b.amount)} (${b.cat}, ${dd(b.date, s)}).`
      if (s === 'fr')
        return `Votre plus grosse dépense ce mois-ci : ${b.note} — ${m(b.amount)} (${b.cat}, ${dd(b.date, s)}).`
      return `Your biggest expense this month: ${b.note} — ${m(b.amount)} (${b.cat}, ${dd(b.date, s)}).`
    }

    case 'topcat': {
      if (!top1)
        return s === 'ar' ? 'ما كاين حتى مصروف هاد الشهر.' : s === 'fr' ? 'Aucune dépense ce mois-ci.' : s === 'lat' ? 'Makayn hta sarf had chhar.' : 'No spending this month yet.'
      const second = top2 ? ` ${s === 'ar' ? '· من بعد' : s === 'fr' ? '· puis' : s === 'lat' ? '· mn ba3d' : '· then'} ${top2.name} ${m(top2.amount)}` : ''
      if (s === 'ar')
        return `أكبر فئة هاد الشهر: ${top1.name} — ${m(top1.amount)} (${pctOf(top1.amount, f.month)}% من الصرف، ${top1.count} مرات).${second}`
      if (s === 'lat')
        return `Akbar catégorie had chhar: ${top1.name} — ${m(top1.amount)} (${pctOf(top1.amount, f.month)}% dyal s-sarf, ${top1.count} mrat).${second}`
      if (s === 'fr')
        return `Votre plus gros poste ce mois-ci : ${top1.name} — ${m(top1.amount)} (${pctOf(top1.amount, f.month)}% des dépenses, ${top1.count} fois).${second}`
      return `Your biggest category this month: ${top1.name} — ${m(top1.amount)} (${pctOf(top1.amount, f.month)}% of spending, ${top1.count}×).${second}`
    }

    case 'budget': {
      const usedPct = pctOf(f.month, f.monthlyBudget)
      if (s === 'ar')
        return `الميزانية الشهرية: ${m(f.monthlyBudget)} → صرفتي ${m(f.month)} (${usedPct}%)، باقي ليك ${m(f.remaining)}. اليومي: ${m(f.dailyBudget)}. بهاد الوتيرة نهاية الشهر ≈ ${m(f.projected)}.`
      if (s === 'lat')
        return `Budget chhri: ${m(f.monthlyBudget)} → srafti ${m(f.month)} (${usedPct}%), baqi lik ${m(f.remaining)}. Youmi: ${m(f.dailyBudget)}. B-had l-wotira nihayat chhar ≈ ${m(f.projected)}.`
      if (s === 'fr')
        return `Budget mensuel : ${m(f.monthlyBudget)} → dépensé ${m(f.month)} (${usedPct}%), il reste ${m(f.remaining)}. Quotidien : ${m(f.dailyBudget)}. À ce rythme, fin de mois ≈ ${m(f.projected)}.`
      return `Monthly budget: ${m(f.monthlyBudget)} → spent ${m(f.month)} (${usedPct}%), ${m(f.remaining)} left. Daily: ${m(f.dailyBudget)}. At this pace, month-end ≈ ${m(f.projected)}.`
    }

    case 'save': {
      const avoidTop = f.top.find((c) => !c.nec) ?? top1
      const cut = avoidTop ? Math.round(avoidTop.amount * 0.3) : 0
      if (s === 'ar')
        return `بهاد الوتيرة نهاية الشهر ≈ ${m(f.projected)} → توفير متوقع ${m(f.projectedSaving)} (الهدف: ${m(f.savingsTarget)}). ${avoidTop ? `${avoidTop.name}: ${m(avoidTop.amount)} يمكن تقلاصهم — نقص 30% يعني ≈ ${m(cut)} فالشهر إضافيين.` : ''}`
      if (s === 'lat')
        return `B-had l-wotira nihayat chhar ≈ ${m(f.projected)} → tawfir montabar ${m(f.projectedSaving)} (l-hadaf: ${m(f.savingsTarget)}). ${avoidTop ? `${avoidTop.name}: ${m(avoidTop.amount)} yimkn t-qallesohom — naqs 30% ya3ni ≈ ${m(cut)} f chhar zyada.` : ''}`
      if (s === 'fr')
        return `À ce rythme, fin de mois ≈ ${m(f.projected)} → économies prévues ${m(f.projectedSaving)} (objectif : ${m(f.savingsTarget)}). ${avoidTop ? `${avoidTop.name} : ${m(avoidTop.amount)} d'évitable — une baisse de 30 % libère ≈ ${m(cut)} par mois.` : ''}`
      return `At this pace, month-end ≈ ${m(f.projected)} → projected saving ${m(f.projectedSaving)} (target: ${m(f.savingsTarget)}). ${avoidTop ? `${avoidTop.name}: ${m(avoidTop.amount)} avoidable — cutting 30% frees ≈ ${m(cut)}/month.` : ''}`
    }

    case 'recent': {
      const lines = f.recent
        .map((r) => `- ${wd(r.date, s)} ${dd(r.date, s)} — ${r.note} — ${m(r.amount)}`)
        .join('\n')
      if (s === 'ar') return `آخر العمليات ديالك (من الجديد للقديم):\n${lines}`
      if (s === 'lat') return `Akhir opérations dyalek (mn jdid l-qdim):\n${lines}`
      if (s === 'fr') return `Vos dernières opérations (de la plus récente) :\n${lines}`
      return `Your latest transactions (newest first):\n${lines}`
    }

    case 'count':
      if (s === 'ar')
        return `هاد الشهر: ${f.monthCount} عمليات (${m(f.month)}). المجموع من ${dd(f.prevMonth0, s)}: ${f.txTotal} عملية.`
      if (s === 'lat')
        return `Had chhar: ${f.monthCount} opérations (${m(f.month)}). Total mn ${dd(f.prevMonth0, s)}: ${f.txTotal}.`
      if (s === 'fr')
        return `Ce mois-ci : ${f.monthCount} opérations (${m(f.month)}). Total depuis ${dd(f.prevMonth0, s)} : ${f.txTotal}.`
      return `This month: ${f.monthCount} transactions (${m(f.month)}). Total since ${dd(f.prevMonth0, s)}: ${f.txTotal}.`

    case 'split': {
      const ess = pctOf(f.monthNec, f.month)
      if (s === 'ar')
        return `هاد الشهر: ضروري ${m(f.monthNec)} (${ess}%) · يمكن تجنبو ${m(monthAvoid)} (${100 - ess}%). أكبر فئة يمكن تجنبها: ${f.top.find((c) => !c.nec)?.name ?? 'والو'}.`
      if (s === 'lat')
        return `Had chhar: essentiel ${m(f.monthNec)} (${ess}%) · avoidable ${m(monthAvoid)} (${100 - ess}%). Akbar catégorie avoidable: ${f.top.find((c) => !c.nec)?.name ?? 'walou'}.`
      if (s === 'fr')
        return `Ce mois-ci : essentiel ${m(f.monthNec)} (${ess}%) · évitable ${m(monthAvoid)} (${100 - ess}%). Plus gros poste évitable : ${f.top.find((c) => !c.nec)?.name ?? 'aucun'}.`
      return `This month: essential ${m(f.monthNec)} (${ess}%) · avoidable ${m(monthAvoid)} (${100 - ess}%). Biggest avoidable category: ${f.top.find((c) => !c.nec)?.name ?? 'none'}.`
    }

    case 'advice': {
      const avoidTop = f.top.find((c) => !c.nec) ?? top1
      const cut = avoidTop ? Math.round(avoidTop.amount * 0.3) : 0
      if (s === 'ar')
        return `حسب أرقامك الحقيقية: ${avoidTop ? `${avoidTop.name} كتكلف ${m(avoidTop.amount)} هاد الشهر` : 'ما كافيش المعطيات'}${avoidTop ? ` — نقص 30% = ≈ ${m(cut)} توفير فالشهر` : ''}.${f.smallCount > 0 ? ` وعندك ${f.smallCount} مشتريات صغيرة (<40 درهم) بمجموع ${m(f.smallSum)} — تقليل النص ديالهم كيزيد فالتوفير. ` : ''}${f.goals[0] ? `وضعية الهدف «${f.goals[0].emoji} ${f.goals[0].title}»: ${f.goals[0].pct}%.` : ''}`
      if (s === 'lat')
        return `3la arqamk s7i7: ${avoidTop ? `${avoidTop.name} katsawi ${m(avoidTop.amount)} had chhar` : 'ma kafich data'}${avoidTop ? ` — naqs 30% = ≈ ${m(cut)} tawfir f chhar` : ''}.${f.smallCount > 0 ? ` W 3ndek ${f.smallCount} achriyat sghar (<40 DH) b-majmou3 ${m(f.smallSum)} — tanqis nos dyalhom kayzid f t-tawfir. ` : ''}${f.goals[0] ? `L-hadaf «${f.goals[0].emoji} ${f.goals[0].title}»: ${f.goals[0].pct}%.` : ''}`
      if (s === 'fr')
        return `D'après vos vrais chiffres : ${avoidTop ? `${avoidTop.name} vous coûte ${m(avoidTop.amount)} ce mois-ci` : 'pas assez de données'}${avoidTop ? ` — une baisse de 30 % = ≈ ${m(cut)} d'économies par mois` : ''}.${f.smallCount > 0 ? ` Vous avez aussi ${f.smallCount} petits achats (<40 DH) totalisant ${m(f.smallSum)} — en réduire la moitié booste l'épargne. ` : ''}${f.goals[0] ? `Objectif « ${f.goals[0].emoji} ${f.goals[0].title} » : ${f.goals[0].pct}%.` : ''}`
      return `Based on your real numbers: ${avoidTop ? `${avoidTop.name} costs you ${m(f.top.find((c) => !c.nec)?.amount ?? 0)} this month` : 'not enough data yet'}${avoidTop ? ` — cutting 30% = ≈ ${m(cut)} saved per month` : ''}.${f.smallCount > 0 ? ` You also have ${f.smallCount} small purchases (<40 DH) totalling ${m(f.smallSum)} — halving those boosts savings. ` : ''}${f.goals[0] ? `Goal « ${f.goals[0].emoji} ${f.goals[0].title} »: ${f.goals[0].pct}%.` : ''}`
    }

    case 'summary':
    default:
      if (s === 'ar')
        return `ملخص سريع: اليوم ${m(f.today)} · هاد السيمانة ${m(f.week)}${cmp} · هاد الشهر ${m(f.month)} ف ${f.monthCount} عمليات (ضروري ${m(f.monthNec)}). أكبر فئة: ${top1 ? `${top1.name} ${m(top1.amount)}` : 'والو'}. سولني على الميزانية، التوفير ولا نصائح.`
      if (s === 'lat')
        return `Résumé: lyoum ${m(f.today)} · had simana ${m(f.week)}${cmp} · had chhar ${m(f.month)} f ${f.monthCount} opérations (essentiel ${m(f.monthNec)}). Akbar catégorie: ${top1 ? `${top1.name} ${m(top1.amount)}` : 'walou'}. Sowelni 3la budget, tawfir wla nasaih.`
      if (s === 'fr')
        return `Résumé rapide : aujourd'hui ${m(f.today)} · cette semaine ${m(f.week)}${cmp} · ce mois ${m(f.month)} en ${f.monthCount} opérations (essentiel ${m(f.monthNec)}). Plus grosse catégorie : ${top1 ? `${top1.name} ${m(top1.amount)}` : 'aucune'}. Demandez-moi budget, économies ou conseils.`
      return `Quick summary: today ${m(f.today)} · this week ${m(f.week)}${cmp} · this month ${m(f.month)} across ${f.monthCount} transactions (essential ${m(f.monthNec)}). Biggest category: ${top1 ? `${top1.name} ${m(top1.amount)}` : 'none'}. Ask me about budget, savings or tips.`
  }
}

/** Pick the answer script: Arabic-script Darija when the question contains
 *  Arabic letters; otherwise the UI language (Latin-Darija phrasing when the
 *  UI language is Darija). */
function scriptOf(lang: Lang, question: string): Script {
  if (AR_RX.test(question)) return 'ar'
  if (lang === 'ary') return 'lat'
  return lang === 'fr' ? 'fr' : 'en'
}

/** The guaranteed answer: exact figures from the user's real data, in the
 *  script the user is typing. `userId` comes from the already-resolved session
 *  (the ambient storage routes every query to the right database — demo or
 *  real). Errors propagate to the caller, which decides the final fallback. */
export async function answerLocally(lang: Lang, question: string, userId: string): Promise<string> {
  const s = scriptOf(lang, question)
  const intent = detectIntent(question)
  const f = await buildFacts(lang, userId)
  return answer(intent, s, f)
}
