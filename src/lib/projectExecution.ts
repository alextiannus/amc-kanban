type StatusChangeEvent = {
  taskId: string
  timestamp: Date
  oldStatus: string | null
  newStatus: string | null
  actorType?: string | null
  changedRequiredInput?: boolean
}

type TaskLike = {
  id: string
  status: string
  weight?: number | null
  priority?: string | null
  estimatedHours?: number | null
  createdAt: Date
  updatedAt: Date
}

export type WeeklyMetrics = {
  windowStart: Date
  windowEnd: Date
  executedTasksCount: number
  completedTasksCount: number
  completionRate: number
  averageCycleHours: number
  pendingInputHours: number
  supporterInterventionsCount: number
  weightContribution: number
}

const TZ_OFFSET_MINUTES = 8 * 60

function toTzDate(date: Date, tzOffsetMinutes = TZ_OFFSET_MINUTES) {
  return new Date(date.getTime() + tzOffsetMinutes * 60 * 1000)
}

function fromTzDate(date: Date, tzOffsetMinutes = TZ_OFFSET_MINUTES) {
  return new Date(date.getTime() - tzOffsetMinutes * 60 * 1000)
}

export function getNaturalWeekWindow(now = new Date(), tzOffsetMinutes = TZ_OFFSET_MINUTES) {
  const local = toTzDate(now, tzOffsetMinutes)
  const day = local.getUTCDay()
  const distanceToMonday = day === 0 ? 6 : day - 1
  const startLocal = new Date(Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - distanceToMonday,
    0,
    0,
    0,
    0
  ))
  const endLocal = new Date(startLocal.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

  return {
    start: fromTzDate(startLocal, tzOffsetMinutes),
    end: fromTzDate(endLocal, tzOffsetMinutes),
  }
}

function safeHours(ms: number) {
  return ms > 0 ? ms / (1000 * 60 * 60) : 0
}

// Temporary mapping before dedicated task weight field is introduced.
export function inferTaskWeight(task: TaskLike): number {
  if (typeof task.weight === 'number' && [1, 3, 5].includes(task.weight)) {
    return task.weight
  }

  if (typeof task.estimatedHours === 'number' && task.estimatedHours > 0) {
    if (task.estimatedHours >= 16) return 5
    if (task.estimatedHours >= 4) return 3
    return 1
  }

  if (task.priority === 'high') return 5
  if (task.priority === 'low') return 1
  return 3
}

export function calculatePendingInputHours(
  tasks: TaskLike[],
  statusEvents: StatusChangeEvent[],
  windowStart: Date,
  windowEnd: Date
) {
  const byTask = new Map<string, StatusChangeEvent[]>()
  for (const e of statusEvents) {
    if (!byTask.has(e.taskId)) byTask.set(e.taskId, [])
    byTask.get(e.taskId)!.push(e)
  }

  let totalHours = 0

  for (const task of tasks) {
    const events = (byTask.get(task.id) || []).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    let pendingSince: Date | null = null

    for (const event of events) {
      if (event.oldStatus === 'pending' && pendingSince === null) {
        pendingSince = windowStart
      }

      if (event.newStatus === 'pending') {
        pendingSince = event.timestamp
      }

      if (event.oldStatus === 'pending' && event.newStatus !== 'pending') {
        const start = pendingSince || windowStart
        totalHours += safeHours(event.timestamp.getTime() - start.getTime())
        pendingSince = null
      }
    }

    if (pendingSince) {
      totalHours += safeHours(windowEnd.getTime() - pendingSince.getTime())
    }
  }

  return Number(totalHours.toFixed(2))
}

export function buildWeeklyMetrics(
  tasks: TaskLike[],
  statusEvents: StatusChangeEvent[],
  windowStart: Date,
  windowEnd: Date
): WeeklyMetrics {
  const activeStatuses = new Set(['todo', 'in_progress', 'pending', 'done', 'void'])

  const executedTasks = tasks.filter(t => activeStatuses.has(t.status))
  const completedTasks = tasks.filter(t => t.status === 'done' && t.updatedAt >= windowStart && t.updatedAt <= windowEnd)

  const completionRate = executedTasks.length > 0
    ? Number(((completedTasks.length / executedTasks.length) * 100).toFixed(2))
    : 0

  const averageCycleHours = completedTasks.length > 0
    ? Number((
      completedTasks.reduce((sum, t) => sum + safeHours(t.updatedAt.getTime() - t.createdAt.getTime()), 0) /
      completedTasks.length
    ).toFixed(2))
    : 0

  const supporterInterventionsCount = statusEvents.filter(e => e.actorType === 'HUMAN' && e.changedRequiredInput).length
  const weightContribution = completedTasks.reduce((sum, t) => sum + inferTaskWeight(t), 0)

  return {
    windowStart,
    windowEnd,
    executedTasksCount: executedTasks.length,
    completedTasksCount: completedTasks.length,
    completionRate,
    averageCycleHours,
    pendingInputHours: calculatePendingInputHours(tasks, statusEvents, windowStart, windowEnd),
    supporterInterventionsCount,
    weightContribution,
  }
}
