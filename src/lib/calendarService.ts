import { runBrandPlanAction } from '@/lib/brand-plan/service'

export async function generateContentPublicationCalendar(input: {
  brandId: string
  body?: Record<string, unknown>
}) {
  return runBrandPlanAction({
    brandId: input.brandId,
    action: 'generate_publishing_calendar',
    body: input.body || {},
  })
}

export async function regenerateContentPublicationCalendarItem(input: {
  brandId: string
  body?: Record<string, unknown>
}) {
  return runBrandPlanAction({
    brandId: input.brandId,
    action: 'regenerate_calendar_item',
    body: input.body || {},
  })
}
