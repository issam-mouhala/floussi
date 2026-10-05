import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { bustCache } from '@/lib/cache'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  const r = await db.budget.deleteMany({ where: { id, userId: user.id } })
  if (r.count === 0) return bad('Budget not found', 404)
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}
