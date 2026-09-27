import { bad, ok } from '@/lib/api-helpers'
import { runSeed } from '@/lib/seed'
import { generateNotifications } from '@/lib/notifications'
import { bustCache } from '@/lib/cache'

/**
 * Demo-data generator — LOCKED by default.
 *
 * The UI has NO demo button anymore (it was removed from Settings for good:
 * one accidental tap used to replace all real data with 412 demo transactions).
 * The only way to seed now is an explicit dev call with ?force=1, and even then
 * a snapshot of the real data is written to db/backups/pre-seed-latest.json first.
 */
export async function POST(req: Request) {
  try {
    // GUARD: refuse when real user data exists, unless explicitly forced.
    const { db } = await import('@/lib/db')
    const [tx, b, g] = await Promise.all([
      db.transaction.count(),
      db.budget.count(),
      db.savingGoal.count(),
    ])
    const hasUserData = tx + b + g > 0
    const force = new URL(req.url).searchParams.get('force') === '1'
    if (hasUserData && !force) {
      console.warn(
        `[seed] REFUSED — real user data present (${tx} transactions, ${b} budgets, ${g} goals). Pass ?force=1 to override.`,
      )
      return bad('Refusing to seed: real user data exists. Pass ?force=1 to override (a snapshot is saved first).', 409)
    }

    // SAFETY NET: snapshot the user's real data BEFORE the demo generator
    // wipes it, so it can always be re-imported from Settings → Import.
    const { snapshotBeforeDestructive } = await import('@/lib/persistence')
    const snap = await snapshotBeforeDestructive('pre-seed')
    if (snap.saved) {
      console.log(
        `[seed] user data snapshot saved first (${snap.transactions} transactions) — recoverable via db/backups/pre-seed-latest.json`,
      )
    }
    const result = await runSeed()
    await generateNotifications(true)
    bustCache()
    return ok(result)
  } catch (e) {
    console.error('seed error', e)
    return bad('Seed failed', 500)
  }
}
