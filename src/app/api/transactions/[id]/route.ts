import { db } from '@/lib/db'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bustCache } from '@/lib/cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  const body = await readJson<{
    amount?: number
    note?: string | null
    categoryId?: string
    date?: string
    necessary?: boolean | null
    icon?: string | null
    isRecurring?: boolean
    paymentMethod?: string
  }>(req)
  if (!body) return bad('Invalid body')

  // ownership: the row must belong to the session user
  const tx = await db.transaction.findFirst({ where: { id, userId: user.id }, select: { id: true } })
  if (!tx) return bad('Transaction not found', 404)

  const data: Record<string, unknown> = {}
  if (typeof body.amount === 'number' && body.amount > 0) data.amount = Math.round(body.amount * 100) / 100
  if (body.note !== undefined) data.note = body.note?.trim() || null
  if (body.categoryId) data.categoryId = body.categoryId
  if (body.date) data.date = new Date(body.date)
  if (body.necessary !== undefined) data.necessary = body.necessary
  if (body.icon !== undefined) data.icon = typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 40) : null
  if (body.isRecurring !== undefined) data.isRecurring = body.isRecurring
  if (body.paymentMethod) data.paymentMethod = body.paymentMethod

  await db.transaction.update({ where: { id }, data })
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  const r = await db.transaction.deleteMany({ where: { id, userId: user.id } })
  if (r.count === 0) return bad('Transaction not found', 404)
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}
