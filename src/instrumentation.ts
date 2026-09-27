/**
 * Runs once when the Next.js server boots (dev or production).
 *
 * This is the safety net that makes user data survive app updates:
 *   1. if the database lost its data (update / schema push / crash wiped it)
 *      but a previous auto-backup exists → restore it silently
 *   2. otherwise, if the database holds data → refresh the auto-backup
 *   3. while the server runs, refresh the auto-backup every 5 minutes
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const g = globalThis as unknown as { __floussiPersistBooted?: boolean }
  if (g.__floussiPersistBooted) return
  g.__floussiPersistBooted = true

  // small delay so the server is fully up before touching the database
  setTimeout(() => {
    void (async () => {
      try {
        const p = await import('@/lib/persistence')
        // 0) self-healing: if the DB got demo-seeded, remove ONLY demo rows
        const purge = await p.purgeDemoData()
        if (purge.purged) {
          console.log(
            `[floussi] ✓ demo purge: removed ${purge.transactions} demo transactions, ${purge.goals} goals, ${purge.budgets} budgets (${purge.distinctSignatures} demo signatures)`,
          )
        }
        const r = await p.autoRestoreIfEmpty()
        if (r.restored) {
          console.log(`[floussi] ✓ data protection: restored ${r.transactions} transactions after update/restart`)
        }
        const b = await p.autoBackupIfHasData()
        if (b.backed) {
          console.log(`[floussi] ✓ data protection: auto-backup saved (${b.transactions} transactions)`)
        }
        // keep the safety copy fresh while the server runs
        const iv = setInterval(() => {
          void p.autoBackupIfHasData()
        }, 5 * 60_000) as unknown as { unref?: () => void }
        iv.unref?.()
      } catch (e) {
        console.warn('[floussi] data protection check skipped:', e instanceof Error ? e.message : e)
      }
    })()
  }, 2500)
}
