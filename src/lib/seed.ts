import { db } from '@/lib/db'

// Deterministic RNG so the demo is reproducible
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Morocco = UTC+1 year-round. Anchor "today" to the CASABLANCA calendar day.
const TZ_OFFSET_MS = 1 * 3600000

const CATEGORIES = [
  { slug: 'groceries', nameEn: 'Groceries', nameFr: 'Courses', nameAr: 'السوق', icon: 'ShoppingCart', color: '#10b981', essential: true, sortOrder: 1 },
  { slug: 'housing', nameEn: 'Housing & Rent', nameFr: 'Logement & Loyer', nameAr: 'السكن', icon: 'Home', color: '#0d9488', essential: true, sortOrder: 2 },
  { slug: 'transport', nameEn: 'Transport', nameFr: 'Transport', nameAr: 'النقل', icon: 'CarFront', color: '#f59e0b', essential: true, sortOrder: 3 },
  { slug: 'bills', nameEn: 'Bills & Internet', nameFr: 'Factures & Internet', nameAr: 'الفاتورات', icon: 'PlugZap', color: '#84cc16', essential: true, sortOrder: 4 },
  { slug: 'health', nameEn: 'Health & Pharmacy', nameFr: 'Santé & Pharmacie', nameAr: 'الصحة', icon: 'HeartPulse', color: '#ef4444', essential: true, sortOrder: 5 },
  { slug: 'education', nameEn: 'Education', nameFr: 'Éducation', nameAr: 'القراية', icon: 'GraduationCap', color: '#a855f7', essential: true, sortOrder: 6 },
  { slug: 'coffee', nameEn: 'Coffee & Snacks', nameFr: 'Café & Snacks', nameAr: 'قهوة و سناك', icon: 'Coffee', color: '#f97316', essential: false, sortOrder: 7 },
  { slug: 'delivery', nameEn: 'Food Delivery', nameFr: 'Livraison', nameAr: 'الديليفري', icon: 'Bike', color: '#ec4899', essential: false, sortOrder: 8 },
  { slug: 'restaurants', nameEn: 'Restaurants', nameFr: 'Restaurants', nameAr: 'الريستو', icon: 'UtensilsCrossed', color: '#f43f5e', essential: false, sortOrder: 9 },
  { slug: 'shopping', nameEn: 'Shopping', nameFr: 'Shopping', nameAr: 'التسوق', icon: 'ShoppingBag', color: '#d946ef', essential: false, sortOrder: 10 },
  { slug: 'entertainment', nameEn: 'Entertainment', nameFr: 'Loisirs', nameAr: 'الترفيه', icon: 'PartyPopper', color: '#8b5cf6', essential: false, sortOrder: 11 },
  { slug: 'subscriptions', nameEn: 'Subscriptions', nameFr: 'Abonnements', nameAr: 'الاشتراكات', icon: 'Repeat', color: '#64748b', essential: false, sortOrder: 12 },
  { slug: 'other', nameEn: 'Other', nameFr: 'Autres', nameAr: 'أخرى', icon: 'Package', color: '#78716c', essential: false, sortOrder: 13 },
]

const NOTES: Record<string, string[]> = {
  coffee: ['Café WeGo', 'Café Rita', 'Espresso – bureau', 'Café Casablanca', 'Tea + msemen', 'Starbucks Anfa', 'Café Maure'],
  snack: ['Snack hanout', 'Croissant + juice', 'Biscuits', 'Chips & soda', 'Ice cream', 'Msemen & chebakia'],
  taxi: ['Petit taxi', 'InDrive', 'Careem', 'Taxi – centre ville', 'Taxi retour maison'],
  tram: ['Tram ticket', 'Bus Casa', 'Tramway recharge'],
  delivery: ['Glovo – KFC', 'Glovo – Pizza e Pasta', 'Glovo – Burger King', 'Glovo – Sushi Kadomi', 'Glovo – Tacos King', 'Kaala food – shawarma', 'Glovo – breakfast'],
  groceries: ['Marjane Californie', 'Carrefour Market', 'Atacadao', 'Asswak Assalam', 'Marché quartier', 'Bim & Qmart'],
  topup: ['Fruits & légumes', 'Pain & lait', 'Hanout week-end', 'Épices & herbes', 'Oeufs & fromage'],
  restaurants: ['Resto Annapurna', 'Le Cabestan', 'Alex Burger', 'La Sqala', 'Korean House', 'Le Rouget – family lunch', 'Pizzeria triangulaire'],
  entertainment: ['Cinéma Megarama', 'Bowling & games', 'Concert – Wallet', 'Foot entre amis', 'Escape game', 'Karting'],
  shopping: ['Zara Morocco Mall', 'Decathlon', 'Souk Semmarine – babouche', 'H&M', 'Sneakers', 'Cadeau anniversaire'],
  health: ['Pharmacie – vitamines', 'Pharmacie – médicaments', 'Médecin – consultation', 'Pharmacie – crème solaire'],
  other: ['Frais de dossier', 'Coiffeur', 'Impression photos', 'Don association', 'Clé copiée'],
}

/** Wipe ALL user data (transactions, budgets, goals, notifications) and reset settings to factory defaults.
 *  Keeps the 13 default categories so the app stays fully usable from a zero-data state. */
export async function runReset(): Promise<{ transactions: number }> {
  await db.appNotification.deleteMany()
  await db.transaction.deleteMany()
  await db.budget.deleteMany()
  await db.savingGoal.deleteMany()
  await db.settings.deleteMany()

  // Restore default categories only if the table is empty (never touch user-created ones otherwise)
  const catCount = await db.category.count()
  if (catCount === 0) {
    await db.category.createMany({ data: CATEGORIES })
  }

  await db.settings.create({
    data: {
      id: 'default',
      displayName: 'Yassine',
      language: 'en',
      currency: 'MAD',
      theme: 'system',
      monthlyBudget: 6000,
      dailyBudget: 200,
      weekendBudget: 350,
      savingsTarget: 600,
    },
  })

  const transactions = await db.transaction.count()
  return { transactions }
}

/** Wipe everything and regenerate a coherent 3-month Moroccan spending story. */
export async function runSeed(): Promise<{ transactions: number; total: number }> {
  const rand = mulberry32(172642)
  const R = (min: number, max: number) => min + rand() * (max - min)
  const RI = (min: number, max: number) => Math.floor(R(min, max + 1))
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]

  const NOW = new Date()
  const CASA_NOW = new Date(NOW.getTime() + TZ_OFFSET_MS)
  const TODAY_LOCAL = Date.UTC(CASA_NOW.getUTCFullYear(), CASA_NOW.getUTCMonth(), CASA_NOW.getUTCDate())
  const dayTs = (daysAgo: number) => TODAY_LOCAL - daysAgo * 86400000
  const at = (daysAgo: number, hour: number, minute = 0) =>
    new Date(dayTs(daysAgo) + hour * 3600000 + minute * 60000 - TZ_OFFSET_MS)
  const dowOf = (ts: number) => new Date(ts + TZ_OFFSET_MS).getUTCDay()
  const isWeekend = (ts: number) => dowOf(ts) === 0 || dowOf(ts) === 6

  await db.appNotification.deleteMany()
  await db.transaction.deleteMany()
  await db.budget.deleteMany()
  await db.savingGoal.deleteMany()
  await db.category.deleteMany()
  await db.settings.deleteMany()

  const catMap = new Map<string, string>()
  for (const c of CATEGORIES) {
    const created = await db.category.create({ data: c })
    catMap.set(c.slug, created.id)
  }

  await db.settings.create({
    data: {
      id: 'default',
      displayName: 'Yassine',
      language: 'en',
      currency: 'MAD',
      theme: 'system',
      monthlyBudget: 10500,
      dailyBudget: 350,
      weekendBudget: 550,
      savingsTarget: 800,
    },
  })

  await db.savingGoal.createMany({
    data: [
      { title: 'Emergency Fund', emoji: '🛟', targetAmount: 10000, currentAmount: 2400, deadline: new Date(TODAY_LOCAL + 150 * 86400000) },
      { title: 'New iPhone', emoji: '📱', targetAmount: 8500, currentAmount: 1850, deadline: new Date(TODAY_LOCAL + 210 * 86400000) },
      { title: 'Summer Trip – Agadir', emoji: '🏖️', targetAmount: 5000, currentAmount: 3150, deadline: new Date(TODAY_LOCAL + 90 * 86400000) },
    ],
  })

  const budgetDefs = [
    { slug: 'coffee', amount: 400 },
    { slug: 'delivery', amount: 800 },
    { slug: 'restaurants', amount: 700 },
    { slug: 'groceries', amount: 1600 },
    { slug: 'transport', amount: 500 },
    { slug: 'entertainment', amount: 350 },
    { slug: 'shopping', amount: 600 },
  ]
  for (const b of budgetDefs) {
    await db.budget.create({ data: { categoryId: catMap.get(b.slug)!, amount: b.amount } })
  }

  type SeedTx = { amount: number; note: string; slug: string; date: Date; isRecurring?: boolean; paymentMethod?: string }
  const txs: SeedTx[] = []
  const DAYS = 95

  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    const ts = dayTs(daysAgo)
    const weekend = isWeekend(ts)
    const dow = dowOf(ts)

    if (rand() < 0.6) txs.push({ amount: RI(12, 26), note: pick(NOTES.coffee), slug: 'coffee', date: at(daysAgo, RI(8, 11), RI(0, 55)) })
    if (weekend && rand() < 0.5) txs.push({ amount: RI(14, 34), note: pick(NOTES.coffee), slug: 'coffee', date: at(daysAgo, RI(16, 19), RI(0, 55)) })
    if (rand() < 0.4) txs.push({ amount: RI(8, 24), note: pick(NOTES.snack), slug: 'coffee', date: at(daysAgo, RI(15, 19), RI(0, 55)) })

    if (rand() < 0.76) txs.push({ amount: RI(14, 42), note: pick(NOTES.taxi), slug: 'transport', date: at(daysAgo, RI(8, 10), RI(0, 55)) })
    if (rand() < 0.32) txs.push({ amount: RI(5, 9), note: pick(NOTES.tram), slug: 'transport', date: at(daysAgo, RI(12, 18), RI(0, 55)) })
    if (rand() < 0.42) txs.push({ amount: RI(14, 40), note: pick(NOTES.taxi), slug: 'transport', date: at(daysAgo, RI(18, 21), RI(0, 55)) })

    if (dow === 6 || rand() < 0.08) txs.push({ amount: RI(150, 360), note: pick(NOTES.groceries), slug: 'groceries', date: at(daysAgo, RI(11, 13), RI(0, 55)), paymentMethod: 'card' })
    else if (rand() < 0.24) txs.push({ amount: RI(20, 85), note: pick(NOTES.topup), slug: 'groceries', date: at(daysAgo, RI(17, 20), RI(0, 55)) })

    if (rand() < (weekend ? 0.5 : 0.35)) txs.push({ amount: weekend ? RI(60, 130) : RI(45, 105), note: pick(NOTES.delivery), slug: 'delivery', date: at(daysAgo, rand() < 0.6 ? RI(19, 21) : RI(12, 14), RI(0, 55)), paymentMethod: 'card' })
    if (rand() < (weekend ? 0.5 : 0.15)) txs.push({ amount: weekend ? RI(90, 260) : RI(75, 190), note: pick(NOTES.restaurants), slug: 'restaurants', date: at(daysAgo, RI(19, 22), RI(0, 55)), paymentMethod: 'card' })
    if (rand() < 0.1) txs.push({ amount: RI(55, 180), note: pick(NOTES.entertainment), slug: 'entertainment', date: at(daysAgo, RI(16, 21), RI(0, 55)) })
    if (rand() < 0.07) txs.push({ amount: RI(120, 560), note: pick(NOTES.shopping), slug: 'shopping', date: at(daysAgo, RI(14, 19), RI(0, 55)), paymentMethod: 'card' })
    if (rand() < 0.035) txs.push({ amount: RI(25, 170), note: pick(NOTES.health), slug: 'health', date: at(daysAgo, RI(10, 18), RI(0, 55)) })
    if (rand() < 0.06) txs.push({ amount: RI(20, 130), note: pick(NOTES.other), slug: 'other', date: at(daysAgo, RI(10, 20), RI(0, 55)) })
  }

  // today — deliberately rich so dashboard & smart notifications light up (~74% of daily budget)
  txs.push(
    { amount: 18, note: 'Café WeGo', slug: 'coffee', date: at(0, 9, 10) },
    { amount: 22, note: 'Petit taxi', slug: 'transport', date: at(0, 8, 25) },
    { amount: 25, note: 'Croissant + juice', slug: 'coffee', date: at(0, 10, 40) },
    { amount: 110, note: 'Glovo – Pizza e Pasta', slug: 'delivery', date: at(0, 13, 15), paymentMethod: 'card' },
    { amount: 50, note: 'Fruits & légumes', slug: 'groceries', date: at(0, 17, 30) },
    { amount: 20, note: 'Pharmacie – vitamines', slug: 'health', date: at(0, 11, 30) },
    { amount: 15, note: 'Snack hanout', slug: 'coffee', date: at(0, 16, 20) },
  )

  // recurring monthly: rent, electricity, internet, netflix, spotify, phone
  const base = new Date(TODAY_LOCAL)
  for (let mOffset = 3; mOffset >= 0; mOffset--) {
    const m0 = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - mOffset, 1))
    const y = m0.getUTCFullYear()
    const m = m0.getUTCMonth()
    const mk = (day: number, hour: number) => {
      const ts = Date.UTC(y, m, day, hour, RI(0, 50)) - TZ_OFFSET_MS
      return ts <= NOW.getTime() ? new Date(ts) : null
    }
    const rec: Array<[number, number, number, string, string, string]> = [
      [2, 10, 2500, 'housing', 'Loyer – appartement Maarif', 'transfer'],
      [5, 20, 65, 'subscriptions', 'Netflix', 'card'],
      [6, 9, RI(150, 265), 'bills', 'Facture Lydec – électricité', 'card'],
      [8, 9, 299, 'bills', 'Internet – Orange ADSL', 'card'],
      [12, 20, 53, 'subscriptions', 'Spotify Premium', 'card'],
      [15, 12, RI(55, 99), 'bills', 'Recharge téléphone – Inwi', 'card'],
    ]
    for (const [day, hour, amount, slug, note, payment] of rec) {
      const d = mk(day, hour)
      if (d) txs.push({ amount, note, slug, date: d, isRecurring: true, paymentMethod: payment })
    }
  }

  const data = txs.map((t) => ({
    amount: t.amount,
    note: t.note,
    categoryId: catMap.get(t.slug)!,
    date: t.date,
    isRecurring: t.isRecurring ?? false,
    paymentMethod: t.paymentMethod ?? (t.amount >= 200 ? 'card' : rand() < 0.6 ? 'cash' : 'card'),
  }))

  for (let i = 0; i < data.length; i += 200) {
    await db.transaction.createMany({ data: data.slice(i, i + 200) })
  }

  const transactions = await db.transaction.count()
  const sum = await db.transaction.aggregate({ _sum: { amount: true } })
  return { transactions, total: Math.round(sum._sum.amount ?? 0) }
}
