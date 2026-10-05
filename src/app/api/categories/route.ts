import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, langFromRequest, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { getCategories } from '@/lib/analytics'
import { suggestDarijaName } from '@/lib/darija'
import { bustCache, cached } from '@/lib/cache'

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const lang = langFromRequest(req)
  const cats = await cached(`cats:${user.id}:${lang}`, 60_000, async () => {
    const list = await getCategories(lang, user.id)
    // attach transaction counts
    const counts = await db.transaction.groupBy({ by: ['categoryId'], where: { userId: user.id }, _count: true })
    const map = new Map(counts.map((c) => [c.categoryId, c._count]))
    return list.map((c) => ({ ...c, txCount: map.get(c.id) ?? 0 }))
  })
  return ok(cats)
}

interface CatInput {
  slug?: string
  nameEn?: string
  nameFr?: string
  nameAr?: string
  nameAry?: string
  icon?: string
  color?: string
  essential?: boolean
}

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const body = await readJson<CatInput>(req)
  if (!body?.nameEn?.trim()) return bad('nameEn required')

  const base = body.nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat'
  let slug = base
  let i = 2
  // slug uniqueness is scoped to the user's own category space
  while (await db.category.findUnique({ where: { userId_slug: { userId: user.id, slug } } })) slug = `${base}-${i++}`

  const maxOrder = await db.category.aggregate({ where: { userId: user.id }, _max: { sortOrder: true } })
  const nameEnFinal = body.nameEn.trim()
  const nameArFinal = body.nameAr?.trim() || nameEnFinal
  // smart Darija naming: explicit field wins, else translate Arabizi/French/English
  const nameAryFinal = body.nameAry?.trim() || suggestDarijaName(nameEnFinal, nameArFinal)
  const created = await db.category.create({
    data: {
      userId: user.id,
      slug,
      nameEn: nameEnFinal,
      nameFr: body.nameFr?.trim() || nameEnFinal,
      nameAr: nameArFinal,
      nameAry: nameAryFinal,
      icon: body.icon ?? 'Wallet',
      color: body.color ?? '#10b981',
      essential: body.essential ?? false,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  })
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ id: created.id })
}
