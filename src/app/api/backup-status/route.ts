import { readAutoBackupStatus } from '@/lib/persistence'
import { dbMode } from '@/lib/db'
import { bad, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'

/** GET /api/backup-status — info about the automatic safety backup shown in Settings. */
export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  try {
    const status = await readAutoBackupStatus()
    return ok({ ...status, mode: dbMode() })
  } catch (e) {
    console.error('backup-status error', e)
    return bad('Status failed', 500)
  }
}
