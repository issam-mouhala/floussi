import type { PrismaClient } from '@prisma/client'
import { mainDb } from '@/lib/db'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '@/lib/auth'
import { CATEGORIES } from '@/lib/seed'
import { DEMO_EMAIL } from '@/lib/types'

/**
 * Floussi demo account (Task 23; storage moved out of the cloud DB in Task 26).
 *
 * A dedicated user (demo@floussi.app) owns a realistic, clearly fake dataset.
 * Anyone can enter it without credentials; every demo login wipes and re-seeds
 * it, so each visitor explores the FULL product (IQ, analytics, budgets, coach)
 * on fresh data while the demo space stays isolated from every real account.
 *
 * Storage (Task 26): ALL demo data lives in the EPHEMERAL demo database
 * (src/lib/demo-db.ts — a per-instance local file, /tmp/floussi-demo.db on
 * Vercel). NOTHING demo-related is written to Turso — the cloud DB only ever
 * stores real accounts. purgeLegacyDemoUser() removes the demo account that
 * used to live in the main DB before Task 26, freeing that storage.
 *
 * Data safety:
 *  - Every function takes an explicit PrismaClient: the demo dataset functions
 *    are always called with the demo client, purgeLegacyDemoUser always with
 *    the main client — there is no ambient-sensitive path here.
 *  - Real accounts are never touched (the owner's transactions are off-limits
 *    by construction; the purge targets ONLY the reserved demo email).
 *  - The RNG is deterministic (fixed seed) so resets always rebuild the same
 *    dataset — screenshots and demos stay reproducible.
 *  - The demo password is a random hash nobody knows: the account is only
 *    reachable through POST /api/auth/demo.
 */

const DEMO_NAME = 'Démo'
/** Fixed id so sessions, caches and browser mirrors stay stable across
 *  rebuilds of the ephemeral demo DB (cuid() would change on every recreate). */
export const DEMO_USER_ID = 'demo'

const DEMO_SETTINGS = {
  displayName: DEMO_NAME,
  language: 'fr', // French first — testers can switch to EN / الدارجة in settings
  currency: 'MAD',
  theme: 'system',
  monthlyBudget: 12000,
  dailyBudget: 400,
  weekendBudget: 700,
  savingsTarget: 1500,
}

// --------------------------------------------------------------- demo account

/** Find (or create) the demo user in the EPHEMERAL demo DB, repairing its
 *  categories/settings if a previous tester deleted or mutated them. */
export async function ensureDemoUser(client: PrismaClient): Promise<string> {
  const existing = await client.user.findUnique({ where: { id: DEMO_USER_ID }, select: { id: true } })
  if (!existing) {
    try {
      await client.user.create({
        data: {
          id: DEMO_USER_ID,
          name: DEMO_NAME,
          email: DEMO_EMAIL,
          // unusable password — the demo is entered exclusively via /api/auth/demo
          passwordHash: hashPassword(randomBytes(24).toString('base64url')),
          categories: { create: CATEGORIES.map((c) => ({ ...c })) },
          settings: { create: { ...DEMO_SETTINGS } },
        },
        select: { id: true },
      })
    } catch {
      // lost a create race against a concurrent demo login — verify it exists
      const raced = await client.user.findUnique({ where: { id: DEMO_USER_ID }, select: { id: true } })
      if (!raced) throw new Error('demo-user-unavailable')
    }
  }
  const userId = DEMO_USER_ID

  const cats = await client.category.findMany({ where: { userId }, select: { slug: true } })
  const have = new Set(cats.map((c) => c.slug))
  const missing = CATEGORIES.filter((c) => !have.has(c.slug))
  if (missing.length)
    await client.category.createMany({ data: missing.map((c) => ({ ...c, userId })) })

  const settings = await client.settings.findUnique({ where: { userId }, select: { id: true } })
  if (!settings) await client.settings.create({ data: { ...DEMO_SETTINGS, userId } })

  return userId
}

/** Wipe the demo user's activity (transactions, budgets, goals, notifications)
 *  and restore factory demo settings. Categories are preserved. */
export async function resetDemoData(client: PrismaClient, userId: string): Promise<void> {
  await client.appNotification.deleteMany({ where: { userId } })
  await client.transaction.deleteMany({ where: { userId } })
  await client.budget.deleteMany({ where: { userId } })
  await client.savingGoal.deleteMany({ where: { userId } })
  await client.settings.update({ where: { userId }, data: { ...DEMO_SETTINGS } })
}

// ------------------------------------------------------------ legacy migration

let legacyPurgeDone: boolean | undefined

/** One-time migration (Task 26): the demo account USED to live in the main
 *  cloud DB — find-or-create + wipe + re-seed on every login permanently kept
 *  ~232 fake transactions in Turso. Remove it entirely so the cloud DB stores
 *  real accounts ONLY. Targets the reserved demo email exclusively (a real
 *  account cannot own it: registration rejects it with 409).
 *  Never throws — a transient main-DB failure must not block the demo. */
export async function purgeLegacyDemoUser(): Promise<{ purged: boolean; error?: string }> {
  if (legacyPurgeDone) return { purged: false }
  try {
    const legacy = await mainDb.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } })
    if (legacy) {
      // children first — explicit deletes, independent of FK-cascade pragmas
      await mainDb.session.deleteMany({ where: { userId: legacy.id } })
      await mainDb.appNotification.deleteMany({ where: { userId: legacy.id } })
      await mainDb.transaction.deleteMany({ where: { userId: legacy.id } })
      await mainDb.budget.deleteMany({ where: { userId: legacy.id } })
      await mainDb.savingGoal.deleteMany({ where: { userId: legacy.id } })
      await mainDb.category.deleteMany({ where: { userId: legacy.id } })
      await mainDb.settings.deleteMany({ where: { userId: legacy.id } })
      await mainDb.user.delete({ where: { id: legacy.id } }).catch(() => {
        // P2025 = a concurrent purge already removed it — success either way
      })
      console.warn(
        `[demo] legacy demo account removed from the main DB (Task 26) — cloud storage now holds real accounts only`,
      )
    }
    legacyPurgeDone = true
    return { purged: true }
  } catch (e) {
    // not marking done → retried on the next demo login
    return { purged: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ------------------------------------------------------------- demo dataset

const DEMO_BUDGETS: { slug: string; amount: number }[] = [
  { slug: 'groceries', amount: 2200 },
  { slug: 'transport', amount: 700 },
  { slug: 'coffee', amount: 800 },
  { slug: 'restaurants', amount: 1100 },
  { slug: 'delivery', amount: 900 },
  { slug: 'shopping', amount: 700 },
  { slug: 'entertainment', amount: 400 },
]

const DEMO_GOALS: { title: string; emoji: string; targetAmount: number; currentAmount: number; deadlineOffsetDays: number | null }[] = [
  { title: "Fonds d'urgence", emoji: '🛟', targetAmount: 15000, currentAmount: 4750, deadlineOffsetDays: 85 },
  { title: 'Vacances — Agadir', emoji: '🏖️', targetAmount: 5000, currentAmount: 1800, deadlineOffsetDays: 74 },
  { title: 'Nouveau téléphone', emoji: '📱', targetAmount: 8000, currentAmount: 6200, deadlineOffsetDays: null },
]

/** Deterministic RNG (mulberry32) — same dataset on every reset. */
function mulberry32(seed: number): () => number {
  let t = seed
  return () => {
    t += 0x6d2b79f5
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

interface DemoTx {
  amount: number
  note: string
  categorySlug: string
  date: Date
  isRecurring?: boolean
  paymentMethod?: 'cash' | 'card'
}

/** ~70 days of Casablanca-flavored spending ending today: daily coffees /
 *  hanout / taxis, souk twice a week, Glovo, weekend restaurants, monthly
 *  rent + bills + subscriptions. ≈ 220 transactions, ≈ 9 000 MAD/month —
 *  comfortably under the 12 000 demo budget with a realistic category mix. */
function buildDemoTransactions(): DemoTx[] {
  const rnd = mulberry32(20261007)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
  const money = (min: number, max: number, step = 1): number => {
    const v = min + rnd() * (max - min)
    return Math.round(v / step) * step
  }
  const chance = (p: number): boolean => rnd() < p

  const DAY_MS = 86_400_000
  const now = new Date()
  const endUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const DAYS = 70
  const at = (dayUtc: number, hour: number): Date =>
    new Date(dayUtc + hour * 3_600_000 + Math.floor(rnd() * 60) * 60_000)

  const txs: DemoTx[] = []
  const push = (dayUtc: number, hour: number, categorySlug: string, note: string, amount: number, opts?: { isRecurring?: boolean; paymentMethod?: 'cash' | 'card' }) =>
    txs.push({ amount: Math.round(amount * 100) / 100, note, categorySlug, date: at(dayUtc, hour), ...opts })

  for (let i = DAYS - 1; i >= 0; i--) {
    const dayUtc = endUtc - i * DAY_MS
    const d = new Date(dayUtc)
    const dow = d.getUTCDay() // 0 = Sunday
    const dom = d.getUTCDate()
    const weekend = dow === 0 || dow === 6

    // ── monthly recurring (card) ──
    if (dom === 1) push(dayUtc, 10, 'housing', 'Loyer — appartement', 2800, { isRecurring: true, paymentMethod: 'card' })
    if (dom === 5) push(dayUtc, 10, 'bills', 'Facture inwi — internet & mobile', 299, { isRecurring: true, paymentMethod: 'card' })
    if (dom === 7) push(dayUtc, 10, 'bills', 'Facture ONE — électricité', money(150, 330, 5), { isRecurring: true, paymentMethod: 'card' })
    if (dom === 8) push(dayUtc, 11, 'subscriptions', 'Netflix', 65, { isRecurring: true, paymentMethod: 'card' })
    if (dom === 12) push(dayUtc, 11, 'subscriptions', 'Spotify Premium', 53, { isRecurring: true, paymentMethod: 'card' })

    // ── daily habits ──
    if (chance(weekend ? 0.55 : 0.78)) {
      const n = chance(0.25) ? 2 : 1
      for (let k = 0; k < n; k++) {
        const hour = k === 0 ? 9 : 16
        push(dayUtc, hour, 'coffee', pick(['Café du matin', 'Café — pause', 'Thé à la menthe', 'Café + jus']), money(8, 32))
      }
    }
    if (chance(0.55)) push(dayUtc, 12, 'groceries', pick(['Hanout', 'Épicerie du quartier', 'Pain et lait', 'Courses rapides']), money(12, 65))
    if (chance(weekend ? 0.45 : 0.72)) {
      if (chance(0.6)) push(dayUtc, 18, 'transport', pick(['Taxi — petit', 'Taxi vers bureau', 'Taxi Casa']), money(14, 38))
      else push(dayUtc, 18, 'transport', pick(['Tramway', 'Tramway — aller-retour']), money(6, 11))
    }

    // ── weekly / occasional ──
    if ((dow === 2 || dow === 6) && chance(0.85))
      push(dayUtc, 11, 'groceries', pick(['Souk — légumes', 'Souk — fruits', 'Marché hebdo']), money(85, 235, 5))
    if (chance(0.05)) push(dayUtc, 15, 'groceries', pick(['Marjane', 'Carrefour — courses du mois']), money(230, 430, 5), { paymentMethod: 'card' })
    if ([4, 5, 6, 0].includes(dow) && chance(0.38))
      push(dayUtc, 20, 'delivery', pick(['Glovo — burger', 'Glovo — chawarma', 'Glovo — pizza', 'Glovo — tacos']), money(45, 130))
    if ([5, 6, 0].includes(dow) && chance(0.5))
      push(dayUtc, 21, 'restaurants', pick(['Restaurant — poisson', 'Pizzeria', 'Snack — sandwich', 'Restaurant en famille']), money(85, 240, 5))
    if (chance(0.055)) push(dayUtc, 17, 'shopping', pick(['Shopping — vêtements', 'Decathlon', 'Cadeau d’anniversaire']), money(90, 420, 10), { paymentMethod: 'card' })
    if (chance(0.05)) push(dayUtc, 19, 'entertainment', pick(['Cinéma', 'Bowling', 'Billard', 'Sortie entre amis']), money(40, 180, 5))
    if (chance(0.03)) push(dayUtc, 16, 'health', pick(['Pharmacie', 'Pharmacie — vitamines']), money(35, 220, 5))
    if (chance(0.015)) push(dayUtc, 14, 'education', pick(['Livres', 'Fournitures']), money(60, 160, 5))
    if (chance(0.02)) push(dayUtc, 15, 'other', pick(['Divers', 'Petit bricolage']), money(20, 120, 5))
  }

  // guaranteed recent activity — the dashboard never opens on an empty "today"
  push(endUtc, 9, 'coffee', 'Café du matin', money(8, 20))
  push(endUtc, 12, 'groceries', 'Hanout', money(15, 40))
  push(endUtc - DAY_MS, 18, 'transport', 'Taxi Casa', money(14, 38))
  push(endUtc - DAY_MS, 9, 'coffee', 'Café — pause', money(8, 25))

  return txs
}

/** Rebuild the demo user's full dataset: transactions, budgets, goals.
 *  Returns the number of transactions seeded. */
export async function seedDemoData(client: PrismaClient, userId: string): Promise<{ transactions: number }> {
  const cats = await client.category.findMany({ where: { userId }, select: { id: true, slug: true } })
  const catId = new Map(cats.map((c) => [c.slug, c.id]))
  const cat = (slug: string): string => {
    const id = catId.get(slug)
    if (!id) throw new Error(`demo-category-missing:${slug}`)
    return id
  }

  const txs = buildDemoTransactions()
  await client.transaction.createMany({
    data: txs.map((t) => ({
      amount: t.amount,
      note: t.note,
      categoryId: cat(t.categorySlug),
      date: t.date,
      isRecurring: t.isRecurring ?? false,
      paymentMethod: t.paymentMethod ?? 'cash',
      userId,
    })),
  })

  await client.budget.createMany({
    data: DEMO_BUDGETS.map((b) => ({ categoryId: cat(b.slug), amount: b.amount, userId })),
  })

  await client.savingGoal.createMany({
    data: DEMO_GOALS.map((g) => ({
      title: g.title,
      emoji: g.emoji,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      deadline: g.deadlineOffsetDays == null ? null : new Date(Date.now() + g.deadlineOffsetDays * 86_400_000),
      userId,
    })),
  })

  return { transactions: txs.length }
}
