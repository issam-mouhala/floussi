import { bad, ok, readJson } from '@/lib/api-helpers'
import { isAdminReq } from '@/lib/admin-auth'
import { mainDb } from '@/lib/db'
import { bustOverrideCache } from '@/lib/text-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOCALES = new Set(['en', 'fr', 'ary'])
const KEY_RE = /^[a-zA-Z0-9_.-]{1,150}$/

/**
 * Admin write access to site-text overrides (Task 31).
 *
 *  PUT  { locale, key, value } — upsert one correction. An EMPTY value means
 *       "back to the shipped default" and deletes the row instead.
 *  DELETE ?locale=&key=          — remove one override (reset button).
 *  Both require the admin cookie; both ALWAYS target mainDb (never demo data).
 */
export async function PUT(req: Request) {
  if (!isAdminReq(req)) return bad('Admin sign-in required', 401)
  const body = await readJson<{ locale?: string; key?: string; value?: string }>(req)
  const locale = body?.locale ?? ''
  const key = body?.key ?? ''
  const value = typeof body?.value === 'string' ? body.value.trim() : null
  if (!LOCALES.has(locale)) return bad('Invalid locale', 422)
  if (!KEY_RE.test(key)) return bad('Invalid key', 422)
  if (value === null) return bad('value (string) required', 422)

  try {
    if (value === '') {
      await mainDb.textOverride.deleteMany({ where: { locale, key } })
      bustOverrideCache()
      return ok({ ok: true, reset: true })
    }
    await mainDb.textOverride.upsert({
      where: { locale_key: { locale, key } },
      create: { locale, key, value },
      update: { value },
    })
    bustOverrideCache()
    return ok({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'storage error'
    return bad(`Could not save the text — ${msg}`, 503)
  }
}

export async function DELETE(req: Request) {
  if (!isAdminReq(req)) return bad('Admin sign-in required', 401)
  const url = new URL(req.url)
  const locale = url.searchParams.get('locale') ?? ''
  const key = url.searchParams.get('key') ?? ''
  if (!LOCALES.has(locale) || !KEY_RE.test(key)) return bad('Invalid locale or key', 422)
  try {
    await mainDb.textOverride.deleteMany({ where: { locale, key } })
    bustOverrideCache()
    return ok({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'storage error'
    return bad(`Could not reset the text — ${msg}`, 503)
  }
}
