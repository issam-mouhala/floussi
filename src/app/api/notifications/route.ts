import { db } from '@/lib/db'
import { bad, langFromRequest, ok, readJson } from '@/lib/api-helpers'
import { generateNotifications, listNotifications } from '@/lib/notifications'
import { bustCache, cached } from '@/lib/cache'

export async function GET(req: Request) {
  const lang = langFromRequest(req)
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  try {
    const data = await cached(`notif:${lang}:${force ? 'f' : 'n'}`, 30_000, async () => {
      try {
        await generateNotifications(force)
      } catch (e) {
        console.error('notification generation error', e)
      }
      const notifications = await listNotifications(lang)
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
  const url = new URL(req.url)
  if (url.searchParams.get('scope') === 'all') {
    await db.appNotification.deleteMany()
    bustCache()
    return ok({ ok: true })
  }
  return bad('Missing scope')
}

export async function PATCH(req: Request) {
  const body = await readJson<{ markAllRead?: boolean }>(req)
  if (body?.markAllRead) {
    await db.appNotification.updateMany({ data: { read: true } })
    bustCache()
    return ok({ ok: true })
  }
  return bad('Nothing to do')
}
