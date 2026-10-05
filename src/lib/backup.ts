import { db } from './db'

/** Canonical backup shape — shared by /api/export, /api/import, auto-backup and safe-db-push. */
export interface BackupFile {
  app: 'floussi'
  version: number
  exportedAt: string
  settings: {
    displayName: string
    language: string
    currency: string
    theme: string
    monthlyBudget: number
    dailyBudget: number
    weekendBudget: number
    savingsTarget: number
  } | null
  categories: Array<{
    slug: string
    nameEn: string
    nameFr: string
    nameAr: string
    nameAry?: string | null
    icon: string
    color: string
    essential: boolean
    sortOrder: number
  }>
  transactions: Array<{
    amount: number
    note: string | null
    categorySlug: string
    date: string
    necessary: boolean | null
    icon?: string | null
    isRecurring: boolean
    paymentMethod: string
  }>
  budgets: Array<{ categorySlug: string; amount: number; period: string }>
  goals: Array<{
    title: string
    emoji: string
    targetAmount: number
    currentAmount: number
    deadline: string | null
  }>
}

/**
 * Build a full JSON snapshot.
 *  - with userId   → that user's data (settings + scoped rows) — /api/export
 *  - without       → the whole database — auto-backup engine & pre-push safety
 */
export async function buildBackup(userId?: string): Promise<BackupFile> {
  const scope = userId ? { userId } : {}
  const [settings, categories, transactions, budgets, goals] = await Promise.all([
    userId ? db.settings.findUnique({ where: { userId } }) : db.settings.findFirst({ orderBy: { updatedAt: 'asc' } }),
    db.category.findMany({ where: scope, orderBy: { sortOrder: 'asc' } }),
    db.transaction.findMany({ where: scope, include: { category: true }, orderBy: { date: 'asc' } }),
    db.budget.findMany({ where: scope, include: { category: true } }),
    db.savingGoal.findMany({ where: scope, orderBy: { createdAt: 'asc' } }),
  ])

  return {
    app: 'floussi',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: settings
      ? {
          displayName: settings.displayName,
          language: settings.language,
          currency: settings.currency,
          theme: settings.theme,
          monthlyBudget: settings.monthlyBudget,
          dailyBudget: settings.dailyBudget,
          weekendBudget: settings.weekendBudget,
          savingsTarget: settings.savingsTarget,
        }
      : null,
    categories: categories.map((c) => ({
      slug: c.slug,
      nameEn: c.nameEn,
      nameFr: c.nameFr,
      nameAr: c.nameAr,
      nameAry: c.nameAry,
      icon: c.icon,
      color: c.color,
      essential: c.essential,
      sortOrder: c.sortOrder,
    })),
    transactions: transactions.map((t) => ({
      amount: t.amount,
      note: t.note,
      categorySlug: t.category.slug,
      date: t.date.toISOString(),
      necessary: t.necessary,
      icon: t.icon,
      isRecurring: t.isRecurring,
      paymentMethod: t.paymentMethod,
    })),
    budgets: budgets.filter((b) => b.category).map((b) => ({ categorySlug: b.category!.slug, amount: b.amount, period: b.period })),
    goals: goals.map((g) => ({
      title: g.title,
      emoji: g.emoji,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      deadline: g.deadline?.toISOString() ?? null,
    })),
  }
}

export interface RestoreResult {
  transactions: number
  budgets: number
  goals: number
  invalid: number
  skippedCategories: number
}

/**
 * The id of the account that owns this installation — the first user created.
 * Used by server-side self-healing paths that have no session (auto-restore
 * after a wipe, pre-push snapshot restore).
 */
export async function getOwnerUserId(): Promise<string | null> {
  const u = await db.user.findFirst({ orderBy: { createdAt: 'asc' } })
  return u?.id ?? null
}

/**
 * Restore a Floussi JSON backup into ONE user's space.
 *
 * SAFETY NOTE (learned the hard way): this used to wrap delete+create in an
 * interactive $transaction — but on the libsql/Turso driver adapter the
 * rollback is NOT reliable, so a mid-restore failure left the tables EMPTY.
 * The restore now VALIDATES AND PREPARES EVERYTHING FIRST (all rows mapped to
 * real category ids, userId attached), and only then replaces the data
 * without a fake safety net: a failure can at worst leave a partial restore
 * that the next auto-restore completes — never an empty database.
 */
export async function restoreBackupFile(
  data: unknown,
  opts: { ownerId: string },
): Promise<RestoreResult | null> {
  const body = data as {
    app?: string
    transactions?: Array<{
      amount: number
      note?: string | null
      categorySlug: string
      date: string
      necessary?: boolean | null
      icon?: string | null
      isRecurring?: boolean
      paymentMethod?: string
    }>
    categories?: BackupFile['categories']
    budgets?: Array<{ categorySlug: string; amount: number; period?: string }>
    goals?: Array<{ title: string; emoji?: string; targetAmount: number; currentAmount?: number; deadline?: string | null }>
    settings?: Partial<NonNullable<BackupFile['settings']>>
  }
  if (!body || !Array.isArray(body.transactions)) return null
  const ownerId = opts.ownerId

  // ---- 1. ensure categories exist for this user, build the slug map --------
  let skippedCategories = 0
  for (const c of body.categories ?? []) {
    if (!c?.slug) continue
    try {
      const existing = await db.category.findUnique({
        where: { userId_slug: { userId: ownerId, slug: String(c.slug) } },
      })
      const patch = {
        ...(c.nameEn ? { nameEn: String(c.nameEn) } : {}),
        ...(c.nameFr ? { nameFr: String(c.nameFr) } : {}),
        ...(c.nameAr ? { nameAr: String(c.nameAr) } : {}),
        ...(c.nameAry !== undefined ? { nameAry: c.nameAry ?? null } : {}),
        ...(c.icon ? { icon: String(c.icon) } : {}),
        ...(c.color ? { color: String(c.color) } : {}),
        ...(typeof c.essential === 'boolean' ? { essential: c.essential } : {}),
        ...(Number.isFinite(c.sortOrder) ? { sortOrder: c.sortOrder } : {}),
      }
      if (existing) {
        await db.category.update({ where: { id: existing.id }, data: patch })
      } else {
        await db.category.create({
          data: {
            userId: ownerId,
            slug: String(c.slug),
            nameEn: String(c.nameEn ?? c.slug),
            nameFr: String(c.nameFr ?? c.nameEn ?? c.slug),
            nameAr: String(c.nameAr ?? c.nameEn ?? c.slug),
            nameAry: c.nameAry ?? null,
            icon: String(c.icon ?? 'Wallet'),
            color: String(c.color ?? '#10b981'),
            essential: !!c.essential,
            sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : 999,
          },
        })
      }
    } catch {
      skippedCategories++
    }
  }

  const allCats = await db.category.findMany({ where: { userId: ownerId } })
  const slugMap = new Map(allCats.map((c) => [c.slug, c.id]))

  // ---- 2. prepare every row BEFORE touching existing data -------------------
  const invalid = body.transactions.filter((t) => !slugMap.has(t.categorySlug)).length
  const txRows = body.transactions
    .filter((t) => slugMap.has(t.categorySlug) && Number.isFinite(t.amount) && Number.isFinite(Date.parse(t.date)))
    .map((t) => ({
      userId: ownerId,
      amount: t.amount,
      note: t.note ?? null,
      categoryId: slugMap.get(t.categorySlug)!,
      date: new Date(t.date),
      necessary: t.necessary ?? null,
      icon: typeof t.icon === 'string' && t.icon.trim() ? t.icon.trim().slice(0, 40) : null,
      isRecurring: t.isRecurring ?? false,
      paymentMethod: t.paymentMethod ?? 'cash',
    }))
  const budgetRows = (body.budgets ?? [])
    .filter((b) => slugMap.has(b.categorySlug) && Number.isFinite(b.amount) && b.amount > 0)
    .map((b) => ({ userId: ownerId, categoryId: slugMap.get(b.categorySlug)!, amount: b.amount, period: b.period ?? 'monthly' }))
  const goalRows = (body.goals ?? [])
    .filter((g) => g.title && Number.isFinite(g.targetAmount) && g.targetAmount > 0)
    .map((g) => ({
      userId: ownerId,
      title: g.title.slice(0, 80),
      emoji: g.emoji ?? '🎯',
      targetAmount: g.targetAmount,
      currentAmount: Math.max(0, g.currentAmount ?? 0),
      deadline: g.deadline ? new Date(g.deadline) : null,
    }))

  // ---- 3. replace the user's data (validated rows only) ----------------------
  await db.appNotification.deleteMany({ where: { userId: ownerId } })
  await db.transaction.deleteMany({ where: { userId: ownerId } })
  await db.budget.deleteMany({ where: { userId: ownerId } })
  await db.savingGoal.deleteMany({ where: { userId: ownerId } })

  for (let i = 0; i < txRows.length; i += 200) {
    await db.transaction.createMany({ data: txRows.slice(i, i + 200) })
  }
  if (budgetRows.length) {
    // one budget per (user, category) — skip duplicates from hand-edited files
    const seen = new Set<string>()
    for (const b of budgetRows) {
      const key = b.categoryId
      if (seen.has(key)) continue
      seen.add(key)
      await db.budget.create({ data: b })
    }
  }
  if (goalRows.length) await db.savingGoal.createMany({ data: goalRows })

  // ---- 4. merge settings ------------------------------------------------------
  if (body.settings) {
    const s = body.settings
    const current = await db.settings.findUnique({ where: { userId: ownerId } })
    if (!current) await db.settings.create({ data: { userId: ownerId } })
    await db.settings.update({
      where: { userId: ownerId },
      data: {
        ...(s.displayName ? { displayName: String(s.displayName).slice(0, 40) } : {}),
        ...(s.language === 'en' || s.language === 'fr' || s.language === 'ary' ? { language: s.language } : {}),
        ...(Number.isFinite(s.monthlyBudget) && s.monthlyBudget! > 0 ? { monthlyBudget: s.monthlyBudget! } : {}),
        ...(Number.isFinite(s.dailyBudget) && s.dailyBudget! > 0 ? { dailyBudget: s.dailyBudget! } : {}),
        ...(Number.isFinite(s.weekendBudget) && s.weekendBudget! > 0 ? { weekendBudget: s.weekendBudget! } : {}),
        ...(Number.isFinite(s.savingsTarget) && s.savingsTarget! > 0 ? { savingsTarget: s.savingsTarget! } : {}),
      },
    })
  }

  const [budgetCount, goalCount] = await Promise.all([
    db.budget.count({ where: { userId: ownerId } }),
    db.savingGoal.count({ where: { userId: ownerId } }),
  ])
  return { transactions: txRows.length, budgets: budgetCount, goals: goalCount, invalid, skippedCategories }
}

