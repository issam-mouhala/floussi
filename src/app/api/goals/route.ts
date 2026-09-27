import { db } from '@/lib/db'
import { autoBackupIfHasData } from '@/lib/persistence'
import { bad, ok, readJson } from '@/lib/api-helpers'
import { bustCache, cached } from '@/lib/cache'

export async function GET() {
  const goals = await cached('goals', 30_000, async () => db.savingGoal.findMany({ orderBy: { createdAt: 'asc' } }))
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
  const body = await readJson<GoalInput>(req)
  if (!body?.title?.trim() || typeof body.targetAmount !== 'number' || !(body.targetAmount > 0)) {
    return bad('title and positive targetAmount required')
  }
  const created = await db.savingGoal.create({
    data: {
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
