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

/** Build a full JSON snapshot of the database. */
export async function buildBackup(): Promise<BackupFile> {
  const [settings, categories, transactions, budgets, goals] = await Promise.all([
    db.settings.findUnique({ where: { id: 'default' } }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.transaction.findMany({ include: { category: true }, orderBy: { date: 'asc' } }),
    db.budget.findMany({ include: { category: true } }),
    db.savingGoal.findMany({ orderBy: { createdAt: 'asc' } }),
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

/** Restore a Floussi JSON backup. Replaces transactions, budgets and goals;
 *  upserts categories by slug (keeps unknown ones); merges settings.
 *  Returns null if the object is not a valid backup. */
export async function restoreBackupFile(data: unknown): Promise<RestoreResult | null> {
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

  const cats = await db.category.findMany()
  const bySlug = new Map(cats.map((c) => [c.slug, c.id]))
  let skippedCategories = 0

  const result = await db.$transaction(async (tx) => {
    // restore categories first (covers a wiped/renamed Category table after schema change)
    for (const c of body.categories ?? []) {
      if (!c?.slug) continue
      try {
        await tx.category.upsert({
          where: { slug: c.slug },
          update: {
            ...(c.nameEn ? { nameEn: String(c.nameEn) } : {}),
            ...(c.nameFr ? { nameFr: String(c.nameFr) } : {}),
            ...(c.nameAr ? { nameAr: String(c.nameAr) } : {}),
            ...(c.icon ? { icon: String(c.icon) } : {}),
            ...(c.color ? { color: String(c.color) } : {}),
            ...(typeof c.essential === 'boolean' ? { essential: c.essential } : {}),
            ...(Number.isFinite(c.sortOrder) ? { sortOrder: c.sortOrder } : {}),
          },
          create: {
            slug: String(c.slug),
            nameEn: String(c.nameEn ?? c.slug),
            nameFr: String(c.nameFr ?? c.nameEn ?? c.slug),
            nameAr: String(c.nameAr ?? c.nameEn ?? c.slug),
            icon: String(c.icon ?? 'Wallet'),
            color: String(c.color ?? '#10b981'),
            essential: !!c.essential,
            sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : 999,
          },
        })
      } catch {
        skippedCategories++
      }
    }

    // refresh slug map after category upserts
    const allCats = await tx.category.findMany()
    const slugMap = new Map(allCats.map((c) => [c.slug, c.id]))

    // replace user data
    await tx.appNotification.deleteMany()
    await tx.transaction.deleteMany()
    await tx.budget.deleteMany()
    await tx.savingGoal.deleteMany()

    const invalid = body.transactions!.filter((t) => !slugMap.has(t.categorySlug)).length
    const txRows = body.transactions!
      .filter((t) => slugMap.has(t.categorySlug) && Number.isFinite(t.amount) && Number.isFinite(Date.parse(t.date)))
      .map((t) => ({
        amount: t.amount,
        note: t.note ?? null,
        categoryId: slugMap.get(t.categorySlug)!,
        date: new Date(t.date),
        necessary: t.necessary ?? null,
        icon: typeof t.icon === 'string' && t.icon.trim() ? t.icon.trim().slice(0, 40) : null,
        isRecurring: t.isRecurring ?? false,
        paymentMethod: t.paymentMethod ?? 'cash',
      }))
    for (let i = 0; i < txRows.length; i += 200) {
      await tx.transaction.createMany({ data: txRows.slice(i, i + 200) })
    }

    for (const b of body.budgets ?? []) {
      const categoryId = slugMap.get(b.categorySlug)
      if (categoryId && Number.isFinite(b.amount) && b.amount > 0) {
        await tx.budget.create({ data: { categoryId, amount: b.amount, period: b.period ?? 'monthly' } })
      }
    }

    for (const g of body.goals ?? []) {
      if (g.title && Number.isFinite(g.targetAmount) && g.targetAmount > 0) {
        await tx.savingGoal.create({
          data: {
            title: g.title.slice(0, 80),
            emoji: g.emoji ?? '🎯',
            targetAmount: g.targetAmount,
            currentAmount: Math.max(0, g.currentAmount ?? 0),
            deadline: g.deadline ? new Date(g.deadline) : null,
          },
        })
      }
    }

    if (body.settings) {
      const s = body.settings
      await tx.settings.upsert({
        where: { id: 'default' },
        update: {
          ...(s.displayName ? { displayName: String(s.displayName).slice(0, 40) } : {}),
          ...(s.language === 'en' || s.language === 'fr' || s.language === 'ary' ? { language: s.language } : {}),
          ...(Number.isFinite(s.monthlyBudget) && s.monthlyBudget! > 0 ? { monthlyBudget: s.monthlyBudget! } : {}),
          ...(Number.isFinite(s.dailyBudget) && s.dailyBudget! > 0 ? { dailyBudget: s.dailyBudget! } : {}),
          ...(Number.isFinite(s.weekendBudget) && s.weekendBudget! > 0 ? { weekendBudget: s.weekendBudget! } : {}),
          ...(Number.isFinite(s.savingsTarget) && s.savingsTarget! > 0 ? { savingsTarget: s.savingsTarget! } : {}),
        },
        create: { id: 'default' },
      })
    }

    return { transactions: txRows.length, budgets: 0, goals: 0, invalid }
  })

  // counts computed outside the closure for accuracy
  const [budgetCount, goalCount] = await Promise.all([db.budget.count(), db.savingGoal.count()])
  return { ...result, budgets: budgetCount, goals: goalCount, skippedCategories }
}
