/**
 * Browser-side data mirror — the last line of defense against server-side
 * data loss (sandbox resets, container restarts, wiped db files).
 *
 * The full Floussi backup (/api/export shape) is kept in localStorage on
 * every device the user touches (phone + PC = 2 independent copies).
 * DataGuard restores it automatically when the server comes back empty.
 *
 * NOTE: intentionally kept free of React so both hooks and plain modules
 * can import it. All functions are no-ops on the server.
 */

export const MIRROR_KEY = 'floussi.mirror.v1'

function hasLS(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

interface MirrorShape {
  transactions?: unknown[]
  budgets?: unknown[]
  goals?: unknown[]
  /** id of the account this snapshot belongs to — a mirror must NEVER be
   *  restored into a different account (multi-user safety, Task 21). */
  userId?: string
}

/** Save the canonical backup JSON to this device. Empty data CLEARS the mirror
 *  so an intentional wipe is never resurrected — but only the CURRENT user's
 *  empty export (a foreign mirror on a shared device is left untouched). */
export function writeMirror(backupJson: MirrorShape): void {
  if (!hasLS()) return
  try {
    const count =
      (backupJson.transactions?.length ?? 0) +
      (backupJson.budgets?.length ?? 0) +
      (backupJson.goals?.length ?? 0)
    if (count > 0) {
      window.localStorage.setItem(MIRROR_KEY, JSON.stringify(backupJson))
    } else {
      const cur = readMirror()
      if (!cur || cur.userId === backupJson.userId) {
        window.localStorage.removeItem(MIRROR_KEY)
      }
    }
  } catch {
    /* quota or privacy mode — mirror is best-effort */
  }
}

/** Read the device mirror, or null when absent/invalid/empty. */
export function readMirror(): MirrorShape | null {
  if (!hasLS()) return null
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as MirrorShape
    const count =
      (j.transactions?.length ?? 0) +
      (j.budgets?.length ?? 0) +
      (j.goals?.length ?? 0)
    if (count === 0) return null
    return j
  } catch {
    return null
  }
}

/** Remove the device mirror — called after an intentional wipe so the empty
 *  state is respected on this device too. */
export function clearMirror(): void {
  if (!hasLS()) return
  try {
    window.localStorage.removeItem(MIRROR_KEY)
  } catch {
    /* ignore */
  }
}

/** Fetch the current server backup and store it on this device.
 *  userId stamps the snapshot owner; when the server export is empty but the
 *  device holds ANOTHER user's mirror, that mirror is preserved. */
export async function refreshMirrorFromServer(userId?: string): Promise<void> {
  try {
    const res = await fetch('/api/export', { cache: 'no-store' })
    if (!res.ok) return
    const j = (await res.json()) as MirrorShape
    writeMirror({ ...j, userId })
  } catch {
    /* offline — keep whatever mirror exists */
  }
}
