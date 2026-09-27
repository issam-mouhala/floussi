import { db } from '@/lib/db'
import { bad, ok } from '@/lib/api-helpers'
import { cached } from '@/lib/cache'

/** GET /api/data-state — live counts of user data. Used by the browser
 *  DataGuard to detect "server came back empty" and self-heal. */
export async function GET() {
  try {
    const state = await cached('data-state', 4_000, async () => {
      const [transactions, budgets, goals] = await Promise.all([
        db.transaction.count(),
        db.budget.count(),
        db.savingGoal.count(),
      ])
      return { transactions, budgets, goals }
    })
    return ok(state)
  } catch (e) {
    console.error('data-state error', e)
    return bad('State failed', 500)
  }
}
