import { restoreBackupFile } from '@/lib/backup'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { bustCache } from '@/lib/cache'

/** POST /api/import — restore a Floussi JSON backup. Replaces transactions,
 *  budgets and goals; upserts categories by slug; merges settings. */
export async function POST(req: Request) {
  const body = await readJson<unknown>(req)

  try {
    const result = await restoreBackupFile(body)
    if (!result) return bad('Invalid backup file')
    void autoBackupIfHasData().catch(() => {})
    bustCache()
    return ok(result)
  } catch (e) {
    console.error('import error', e)
    return bad('Import failed', 500)
  }
}
