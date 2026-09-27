import { bad, ok } from '@/lib/api-helpers'
import { runReset } from '@/lib/seed'
import { bustCache } from '@/lib/cache'

export async function POST() {
  try {
    // SAFETY NET: escape hatch even for an intentional wipe — the user can
    // still change their mind later (pre-wipe-*.json survives deleteAutoBackups).
    const { snapshotBeforeDestructive, deleteAutoBackups } = await import('@/lib/persistence')
    await snapshotBeforeDestructive('pre-wipe')
    const result = await runReset()
    // intentional wipe → drop the auto-backups so the empty state is NOT
    // undone by the boot-time auto-restore on next restart
    await deleteAutoBackups()
    bustCache()
    return ok(result)
  } catch (e) {
    console.error('reset error', e)
    return bad('Reset failed', 500)
  }
}
