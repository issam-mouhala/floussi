import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, langFromRequest, ok, readJson } from '@/lib/api-helpers'
import { getCategories } from '@/lib/analytics'
import { suggestDarijaName } from '@/lib/darija'
import { bustCache, cached } from '@/lib/cache'

export async function GET(req: Request) {
  const lang = langFromRequest(req)
  const cats = await cached(`cats:${lang}`, 60_000, async () => {
    const list = await getCategories(lang)
    // attach transaction counts
    const counts = await db.transaction.groupBy({ by: ['categoryId'], _count: true })
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
  const body = await readJson<CatInput>(req)
  if (!body?.nameEn?.trim()) return bad('nameEn required')

  const base = body.nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat'
  let slug = base
  let i = 2
  while (await db.category.findUnique({ where: { slug } })) slug = `${base}-${i++}`

  const maxOrder = await db.category.aggregate({ _max: { sortOrder: true } })
  const nameEnFinal = body.nameEn.trim()
  const nameArFinal = body.nameAr?.trim() || nameEnFinal
  // smart Darija naming: explicit field wins, else translate Arabizi/French/English
  const nameAryFinal = body.nameAry?.trim() || suggestDarijaName(nameEnFinal, nameArFinal)
  const created = await db.category.create({
    data: {
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
