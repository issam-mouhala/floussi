import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { bustCache, cached } from '@/lib/cache'

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const goals = await cached(`goals:${user.id}`, 30_000, async () =>
    db.savingGoal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
  )
  return ok(
    goals.map((g) => ({
      id: g.id,
      title: g.title,
      emoji: g.emoji,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      deadline: g.deadline?.toISOString() ?? null,
      pct: g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0,
      completed: g.currentAmount >= g.targetAmount,
    }))
  )
}

interface GoalInput {
  title?: string
  emoji?: string
  targetAmount?: number
  currentAmount?: number
  deadline?: string | null
}

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (!user) return bad('Unauthorized', 401)
  const body = await readJson<GoalInput>(req)
  if (!body?.title?.trim() || typeof body.targetAmount !== 'number' || !(body.targetAmount > 0)) {
    return bad('title and positive targetAmount required')
  }
  const created = await db.savingGoal.create({
    data: {
      userId: user.id,
      title: body.title.trim(),
      emoji: body.emoji || '🎯',
      targetAmount: body.targetAmount,
      currentAmount: body.currentAmount && body.currentAmount > 0 ? body.currentAmount : 0,
      deadline: body.deadline ? new Date(body.deadline) : null,
    },
  })
  void autoBackupIfHasData().catch(() => {})
  bustCache()
  return ok({ id: created.id })
}
