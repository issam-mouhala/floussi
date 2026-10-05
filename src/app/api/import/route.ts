import { restoreBackupFile } from '@/lib/backup'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { bustCache } from '@/lib/cache'

/** POST /api/import — restore a Floussi JSON backup INTO THE SESSION USER'S
 *  space. Replaces their transactions, budgets and goals; upserts their
 *  categories by slug; merges their settings. */
export async function POST(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const body = await readJson<unknown>(req)

  try {
    const result = await restoreBackupFile(body, { ownerId: user.id })
    if (!result) return bad('Invalid backup file')
    void autoBackupIfHasData().catch(() => {})
    bustCache()
    return ok(result)
  } catch (e) {
    console.error('import error', e)
    return bad('Import failed', 500)
  }
}
