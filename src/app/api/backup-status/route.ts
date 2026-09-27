import { readAutoBackupStatus } from '@/lib/persistence'
import { dbMode } from '@/lib/db'
import { bad, ok } from '@/lib/api-helpers'

/** GET /api/backup-status — info about the automatic safety backup shown in Settings. */
export async function GET() {
  try {
    const status = await readAutoBackupStatus()
    return ok({ ...status, mode: dbMode() })
  } catch (e) {
    console.error('backup-status error', e)
    return bad('Status failed', 500)
  }
}
