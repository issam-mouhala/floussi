import { db } from '@/lib/db'

// The 13 base categories — cloned into EVERY new account at signup (see
// /api/auth/register). Exported so the registration flow and scripts share
// the exact same taxonomy.
export const CATEGORIES = [
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

/** Wipe ONE user's data (transactions, budgets, goals, notifications) and reset
 *  their settings to factory defaults. Keeps their 13 default categories so
 *  the app stays fully usable from a zero-data state. */
export async function runReset(userId: string): Promise<{ transactions: number }> {
  await db.appNotification.deleteMany({ where: { userId } })
  await db.transaction.deleteMany({ where: { userId } })
  await db.budget.deleteMany({ where: { userId } })
  await db.savingGoal.deleteMany({ where: { userId } })

  const s = await db.settings.findUnique({ where: { userId } })
  if (s) {
    await db.settings.update({
      where: { userId },
      data: {
        monthlyBudget: 6000,
        dailyBudget: 200,
        weekendBudget: 350,
        savingsTarget: 600,
      },
    })
  }

  // Restore default categories only if the user has none (never touch their own ones otherwise)
  const catCount = await db.category.count({ where: { userId } })
  if (catCount === 0) {
    await db.category.createMany({ data: CATEGORIES.map((c) => ({ ...c, userId })) })
  }

  const transactions = await db.transaction.count({ where: { userId } })
  return { transactions }
}
