import { db } from '@/lib/db'
import { bad, ok } from '@/lib/api-helpers'
import { bustCache } from '@/lib/cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await db.appNotification.update({ where: { id }, data: { read: true } })
  } catch {
    return bad('Notification not found', 404)
  }
  bustCache()
  return ok({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await db.appNotification.delete({ where: { id } })
  } catch {
    return bad('Notification not found', 404)
  }
  bustCache()
  return ok({ ok: true })
}
