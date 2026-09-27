import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { suggestDarijaName } from '@/lib/darija'
import { bustCache } from '@/lib/cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await readJson<{
    nameEn?: string
    nameFr?: string
    nameAr?: string
    nameAry?: string | null
    icon?: string
    color?: string
    essential?: boolean
  }>(req)
  if (!body) return bad('Invalid body')

  const data: Record<string, unknown> = {}
  if (body.nameEn?.trim()) data.nameEn = body.nameEn.trim()
  if (body.nameFr?.trim()) data.nameFr = body.nameFr.trim()
  if (body.nameAr?.trim()) data.nameAr = body.nameAr.trim()
  // nameAry: explicit string sets it, explicit null clears it, absent = keep;
  // when renaming En/Ar without touching nameAry, re-run the smart translation
  if (body.nameAry !== undefined) {
    data.nameAry = body.nameAry?.trim() ? body.nameAry.trim() : null
  } else if (data.nameEn || data.nameAr) {
    const cur = await db.category.findUnique({ where: { id }, select: { nameEn: true, nameAr: true } })
    if (cur) data.nameAry = suggestDarijaName((data.nameEn as string) ?? cur.nameEn, (data.nameAr as string) ?? cur.nameAr)
  }
  if (body.icon) data.icon = body.icon
  if (body.color) data.color = body.color
  if (body.essential !== undefined) data.essential = body.essential

  try {
    await db.category.update({ where: { id }, data })
  } catch {
    return bad('Category not found', 404)
  }
  bustCache()
  return ok({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const count = await db.transaction.count({ where: { categoryId: id } })
  if (count > 0) return bad('Category has transactions', 409)
  try {
    await db.category.delete({ where: { id } })
  } catch {
    return bad('Category not found', 404)
  }
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}
