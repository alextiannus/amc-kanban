import assert from 'node:assert/strict'
import { buildWeeklyMetrics, getNaturalWeekWindow } from '../src/lib/projectExecution.ts'

function testNaturalWeekWindow() {
  const base = new Date('2026-05-13T12:00:00Z')
  const { start, end } = getNaturalWeekWindow(base)
  assert.equal(start.toISOString(), '2026-05-10T16:00:00.000Z')
  assert.equal(end.toISOString(), '2026-05-17T15:59:59.999Z')
}

function testWeeklyMetrics() {
  const windowStart = new Date('2026-05-11T00:00:00Z')
  const windowEnd = new Date('2026-05-17T23:59:59Z')

  const tasks = [
    {
      id: 't1',
      status: 'done',
      weight: 5,
      priority: 'low',
      estimatedHours: 1,
      createdAt: new Date('2026-05-11T00:00:00Z'),
      updatedAt: new Date('2026-05-12T00:00:00Z')
    },
    {
      id: 't2',
      status: 'in_progress',
      weight: 3,
      priority: 'medium',
      estimatedHours: 4,
      createdAt: new Date('2026-05-11T02:00:00Z'),
      updatedAt: new Date('2026-05-13T02:00:00Z')
    }
  ]

  const events = [
    {
      taskId: 't2',
      timestamp: new Date('2026-05-11T03:00:00Z'),
      oldStatus: 'in_progress',
      newStatus: 'pending',
      actorType: 'AI_AGENT',
      changedRequiredInput: false,
    },
    {
      taskId: 't2',
      timestamp: new Date('2026-05-11T06:00:00Z'),
      oldStatus: 'pending',
      newStatus: 'in_progress',
      actorType: 'HUMAN',
      changedRequiredInput: true,
    }
  ]

  const result = buildWeeklyMetrics(tasks, events, windowStart, windowEnd)
  assert.equal(result.executedTasksCount, 2)
  assert.equal(result.completedTasksCount, 1)
  assert.equal(result.completionRate, 50)
  assert.equal(result.pendingInputHours, 3)
  assert.equal(result.supporterInterventionsCount, 1)
  assert.equal(result.weightContribution, 5)
}

function main() {
  testNaturalWeekWindow()
  testWeeklyMetrics()
  console.log('Project execution analytics tests passed')
}

main()
