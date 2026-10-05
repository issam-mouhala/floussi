import { db } from '@/lib/db'
import { bad, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { cached } from '@/lib/cache'

/** GET /api/data-state — live counts of the SESSION USER's data. Used by the
 *  browser DataGuard to detect "server came back empty" and self-heal. */
export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  try {
    const state = await cached(`data-state:${user.id}`, 4_000, async () => {
      const [transactions, budgets, goals] = await Promise.all([
        db.transaction.count({ where: { userId: user.id } }),
        db.budget.count({ where: { userId: user.id } }),
        db.savingGoal.count({ where: { userId: user.id } }),
      ])
      return { transactions, budgets, goals }
    })
    return ok(state)
  } catch (e) {
    console.error('data-state error', e)
    return bad('State failed', 500)
  }
}
