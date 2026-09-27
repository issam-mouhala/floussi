import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok } from '@/lib/api-helpers'
import { bustCache } from '@/lib/cache'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await db.budget.delete({ where: { id } })
  } catch {
    return bad('Budget not found', 404)
  }
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}
