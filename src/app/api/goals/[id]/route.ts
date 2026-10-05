import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { bustCache } from '@/lib/cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  const body = await readJson<{ addAmount?: number; title?: string; targetAmount?: number; deadline?: string | null }>(req)
  if (!body) return bad('Invalid body')

  const goal = await db.savingGoal.findFirst({ where: { id, userId: user.id } })
  if (!goal) return bad('Goal not found', 404)

  const data: Record<string, unknown> = {}
  if (typeof body.addAmount === 'number' && body.addAmount !== 0) {
    data.currentAmount = Math.max(0, Math.round((goal.currentAmount + body.addAmount) * 100) / 100)
  }
  if (body.title?.trim()) data.title = body.title.trim()
  if (typeof body.targetAmount === 'number' && body.targetAmount > 0) data.targetAmount = body.targetAmount
  if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null

  await db.savingGoal.update({ where: { id }, data })
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  const r = await db.savingGoal.deleteMany({ where: { id, userId: user.id } })
  if (r.count === 0) return bad('Goal not found', 404)
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}
