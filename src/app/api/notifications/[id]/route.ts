import { db } from '@/lib/db'
import { bad, ok } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { bustCache } from '@/lib/cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  const r = await db.appNotification.updateMany({ where: { id, userId: user.id }, data: { read: true } })
  if (r.count === 0) return bad('Notification not found', 404)
  bustCache()
  return ok({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  const r = await db.appNotification.deleteMany({ where: { id, userId: user.id } })
  if (r.count === 0) return bad('Notification not found', 404)
  bustCache()
  return ok({ ok: true })
}
