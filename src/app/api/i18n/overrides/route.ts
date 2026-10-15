import { ok } from '@/lib/api-helpers'
import { getAllOverrides } from '@/lib/text-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/i18n/overrides — PUBLIC. All site-text corrections written by the
 *  admin, grouped per locale: { overrides: { en: {key:value}, fr: {}, ary: {} } }. */
export async function GET() {
  const overrides = await getAllOverrides()
  return ok({ overrides })
}
