import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { suggestDarijaName } from '@/lib/darija'
import { bustCache } from '@/lib/cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
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

  const cur = await db.category.findFirst({ where: { id, userId: user.id } })
  if (!cur) return bad('Category not found', 404)

  const data: Record<string, unknown> = {}
  if (body.nameEn?.trim()) data.nameEn = body.nameEn.trim()
  if (body.nameFr?.trim()) data.nameFr = body.nameFr.trim()
  if (body.nameAr?.trim()) data.nameAr = body.nameAr.trim()
  // nameAry: explicit string sets it, explicit null clears it, absent = keep;
  // when renaming En/Ar without touching nameAry, re-run the smart translation
  if (body.nameAry !== undefined) {
    data.nameAry = body.nameAry?.trim() ? body.nameAry.trim() : null
  } else if (data.nameEn || data.nameAr) {
    data.nameAry = suggestDarijaName((data.nameEn as string) ?? cur.nameEn, (data.nameAr as string) ?? cur.nameAr)
  }
  if (body.icon) data.icon = body.icon
  if (body.color) data.color = body.color
  if (body.essential !== undefined) data.essential = body.essential

  await db.category.update({ where: { id }, data })
  bustCache()
  return ok({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { id } = await params
  // ownership check + in-use guard, scoped to this user's transactions
  const cat = await db.category.findFirst({ where: { id, userId: user.id }, select: { id: true } })
  if (!cat) return bad('Category not found', 404)
  const count = await db.transaction.count({ where: { categoryId: id, userId: user.id } })
  if (count > 0) return bad('Category has transactions', 409)
  await db.category.delete({ where: { id } })
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ ok: true })
}
