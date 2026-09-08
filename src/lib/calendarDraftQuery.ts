// Match the date priority used by MM's month grid, including historical imports.
export function calendarDraftQuery(params: URLSearchParams) {
  const start = params.get('calendarStart')
  const end = params.get('calendarEnd')
  if (start === null && end === null) return null
  const from = new Date(start || '')
  const to = new Date(end || '')
  const pageValue = params.get('page') ?? '1'
  const page = Number(pageValue)
  if (!start || !end || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())
    || to <= from || to.getTime() - from.getTime() > 32 * 86400_000
    || !/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(page) || page > 1_000_000) {
    throw new Error('Invalid calendar range or page')
  }
  const range = { gte: from, lt: to }
  return {
    page,
    pageSize: 100,
    where: {
      OR: [
        { publishedAt: range },
        { publishedAt: null, scheduledAt: range },
        { publishedAt: null, scheduledAt: null, createdAt: range },
      ],
    },
  }
}
