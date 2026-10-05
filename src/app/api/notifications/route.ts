import { db } from '@/lib/db'
import { bad, langFromRequest, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { generateNotifications, listNotifications } from '@/lib/notifications'
import { bustCache, cached } from '@/lib/cache'

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const lang = langFromRequest(req)
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  try {
    const data = await cached(`notif:${user.id}:${lang}:${force ? 'f' : 'n'}`, 30_000, async () => {
      try {
        await generateNotifications(user.id, force)
      } catch (e) {
        console.error('notification generation error', e)
      }
      const notifications = await listNotifications(lang, user.id)
      const unread = notifications.filter((n) => !n.read).length
      return { notifications, unread }
    })
    return ok(data)
  } catch (e) {
    console.error('notifications error', e)
    return bad('Notifications failed', 500)
  }
}

export async function DELETE(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const url = new URL(req.url)
  if (url.searchParams.get('scope') === 'all') {
    await db.appNotification.deleteMany({ where: { userId: user.id } })
    bustCache()
    return ok({ ok: true })
  }
  return bad('Missing scope')
}

export async function PATCH(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const body = await readJson<{ markAllRead?: boolean }>(req)
  if (body?.markAllRead) {
    await db.appNotification.updateMany({ where: { userId: user.id }, data: { read: true } })
    bustCache()
    return ok({ ok: true })
  }
  return bad('Nothing to do')
}
