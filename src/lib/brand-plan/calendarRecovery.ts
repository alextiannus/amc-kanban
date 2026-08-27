import { resolveInspirationCreativeId } from './inspirationCreativeLink.ts'

export type CalendarRecoveryItem = {
  id?: string
  date?: string
  status?: string
  inspirationCreativeId?: string
  sampleVideoUrl?: string
  sampleThumbnailUrl?: string
  [key: string]: unknown
}

export type CalendarRecoveryBrand = {
  brandId: string
  brandName: string
  publishingFreq?: unknown
  marketingSolution?: {
    publishingCalendar?: {
      generatedAt?: string
      months?: Record<string, CalendarRecoveryItem[]>
    }
    [key: string]: unknown
  }
}

export type CalendarRecoveryTarget = {
  key: string
  brandId: string
  brandName: string
  month: string
  publishingFreq?: unknown
  generatedAt?: string
  items: CalendarRecoveryItem[]
  inspection: CalendarRecoveryInspection
}

export type CalendarRecoveryIssue = {
  code: 'missing_item_id' | 'duplicate_item_id' | 'missing_creative_id' | 'invalid_creative_id' | 'media_creative_mismatch'
  itemId: string
  expectedCreativeId?: string
  actualCreativeId?: string
}

export type CalendarRecoveryInspection = {
  itemCount: number
  validItemCount: number
  issues: CalendarRecoveryIssue[]
}

export type CalendarRecoveryCheckpointEntry = {
  status: 'completed' | 'failed'
  target: CalendarRecoveryTarget
  attempts: number
  backup?: unknown
  verified?: unknown
  error?: string
  finishedAt: string
}

export type CalendarRecoveryExecutionOperations = {
  prepare(target: CalendarRecoveryTarget): Promise<{ target: CalendarRecoveryTarget; backup: unknown }>
  generate(target: CalendarRecoveryTarget, attempt: number): Promise<CalendarRecoveryItem[]>
  verify(target: CalendarRecoveryTarget, generatedItems: CalendarRecoveryItem[]): Promise<unknown>
  checkpoint(entry: CalendarRecoveryCheckpointEntry): Promise<void>
}

function datePartsInSingapore(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function minimumContentPlanDateValue(base = new Date()) {
  const parts = datePartsInSingapore(base)
  const minimum = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 7))
  const next = datePartsInSingapore(minimum)
  return `${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`
}

export function minimumCompleteCalendarMonthValue(base = new Date()) {
  const parts = datePartsInSingapore(base)
  const monthOffset = parts.day <= 1 ? 0 : 1
  const fullMonthStart = new Date(Date.UTC(parts.year, parts.month - 1 + monthOffset, 1))
  const fullMonth = datePartsInSingapore(fullMonthStart)
  const fullMonthValue = `${fullMonth.year}-${String(fullMonth.month).padStart(2, '0')}`
  const leadMonthValue = minimumContentPlanDateValue(base).slice(0, 7)
  return fullMonthValue < leadMonthValue ? leadMonthValue : fullMonthValue
}

export function calendarRecoveryTargetKey(brandId: string, month: string) {
  return `${brandId}:${month}`
}

export function inspectCalendarInspirationIdentity(items: CalendarRecoveryItem[]): CalendarRecoveryInspection {
  const issues: CalendarRecoveryIssue[] = []
  const itemIds = new Map<string, number>()

  for (const item of items) {
    const itemId = String(item.id || '').trim()
    if (!itemId) {
      issues.push({ code: 'missing_item_id', itemId: '' })
    } else {
      itemIds.set(itemId, (itemIds.get(itemId) || 0) + 1)
    }

    const actualCreativeId = String(item.inspirationCreativeId || '').trim()
    if (!actualCreativeId) {
      issues.push({ code: 'missing_creative_id', itemId })
      continue
    }
    if (!/^cre_[A-Za-z0-9_-]+$/.test(actualCreativeId)) {
      issues.push({ code: 'invalid_creative_id', itemId, actualCreativeId })
      continue
    }

    const expectedCreativeId = resolveInspirationCreativeId(item)
    if (expectedCreativeId && expectedCreativeId !== actualCreativeId) {
      issues.push({
        code: 'media_creative_mismatch',
        itemId,
        expectedCreativeId,
        actualCreativeId,
      })
    }
  }

  for (const [itemId, count] of itemIds) {
    if (count > 1) issues.push({ code: 'duplicate_item_id', itemId })
  }

  const invalidItemIds = new Set(issues.map((issue) => issue.itemId))
  return {
    itemCount: items.length,
    validItemCount: items.filter((item) => !invalidItemIds.has(String(item.id || '').trim())).length,
    issues,
  }
}

export function selectCalendarRecoveryTargets(input: {
  brands: CalendarRecoveryBrand[]
  minimumMonth?: string
  brandId?: string
  brandName?: string
  month?: string
}) {
  const minimumMonth = input.minimumMonth || minimumCompleteCalendarMonthValue()
  const targets: CalendarRecoveryTarget[] = []

  for (const brand of input.brands) {
    if (input.brandId && brand.brandId !== input.brandId) continue
    if (input.brandName && brand.brandName !== input.brandName) continue
    const calendar = brand.marketingSolution?.publishingCalendar
    for (const [month, rawItems] of Object.entries(calendar?.months || {})) {
      if (!/^\d{4}-\d{2}$/.test(month) || month < minimumMonth) continue
      if (input.month && month !== input.month) continue
      const items = Array.isArray(rawItems) ? rawItems : []
      targets.push({
        key: calendarRecoveryTargetKey(brand.brandId, month),
        brandId: brand.brandId,
        brandName: brand.brandName,
        month,
        publishingFreq: brand.publishingFreq,
        generatedAt: calendar?.generatedAt,
        items,
        inspection: inspectCalendarInspirationIdentity(items),
      })
    }
  }

  return targets.sort((left, right) =>
    left.brandName.localeCompare(right.brandName, 'zh-CN') || left.month.localeCompare(right.month)
  )
}

class CalendarRecoveryValidationError extends Error {}

export async function executeCalendarRecoveryTargets(input: {
  targets: CalendarRecoveryTarget[]
  apply: boolean
  completedKeys?: Iterable<string>
  maxAttempts?: number
  operations: CalendarRecoveryExecutionOperations
}) {
  const completedKeys = new Set(input.completedKeys || [])
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts || 2))
  const result = { planned: input.targets.length, completed: 0, skipped: 0, failed: 0 }

  if (!input.apply) return result

  for (const initialTarget of input.targets) {
    if (completedKeys.has(initialTarget.key)) {
      result.skipped += 1
      continue
    }

    let target = initialTarget
    let backup: unknown
    let attempts = 0
    try {
      const prepared = await input.operations.prepare(initialTarget)
      target = prepared.target
      backup = prepared.backup

      let generatedItems: CalendarRecoveryItem[] | undefined
      let generationError: unknown
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attempts = attempt
        try {
          generatedItems = await input.operations.generate(target, attempt)
          generationError = undefined
          break
        } catch (error) {
          generationError = error
        }
      }
      if (!generatedItems) throw generationError || new Error('calendar_regeneration_failed')

      const inspection = inspectCalendarInspirationIdentity(generatedItems)
      if (inspection.issues.length) {
        throw new CalendarRecoveryValidationError(`calendar_inspiration_identity_invalid:${JSON.stringify(inspection.issues)}`)
      }
      const unexpectedStatuses = generatedItems
        .filter((item) => item.status !== '待确认')
        .map((item) => String(item.id || ''))
      if (unexpectedStatuses.length) {
        throw new CalendarRecoveryValidationError(`calendar_status_not_reset:${JSON.stringify(unexpectedStatuses)}`)
      }

      const verified = await input.operations.verify(target, generatedItems)
      await input.operations.checkpoint({
        status: 'completed',
        target: { ...target, items: generatedItems, inspection },
        attempts,
        backup,
        verified,
        finishedAt: new Date().toISOString(),
      })
      completedKeys.add(target.key)
      result.completed += 1
    } catch (error) {
      result.failed += 1
      await input.operations.checkpoint({
        status: 'failed',
        target,
        attempts,
        backup,
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      })
      throw error
    }
  }

  return result
}
