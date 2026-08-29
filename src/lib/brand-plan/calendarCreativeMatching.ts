export type CalendarCreativeMatchStatus = 'matched' | 'no_candidate_after_retry'

export type CalendarCreativeMatchResult<TPool, TCandidate> = {
  pool: TPool
  candidate: TCandidate | null
  status: CalendarCreativeMatchStatus
  attempts: number
}

export async function resolveCalendarCreativeCandidateWithRetry<TPool, TCandidate>(input: {
  requestPool: (refreshPublicationId: string) => Promise<TPool>
  selectCandidate: (pool: TPool) => TCandidate | null
  initialRefreshPublicationId: string
  retryRefreshPublicationId: string
}): Promise<CalendarCreativeMatchResult<TPool, TCandidate>> {
  const firstPool = await input.requestPool(input.initialRefreshPublicationId)
  const firstCandidate = input.selectCandidate(firstPool)
  if (firstCandidate) {
    return {
      pool: firstPool,
      candidate: firstCandidate,
      status: 'matched',
      attempts: 1,
    }
  }

  const retryPool = await input.requestPool(input.retryRefreshPublicationId)
  const retryCandidate = input.selectCandidate(retryPool)
  return {
    pool: retryPool,
    candidate: retryCandidate,
    status: retryCandidate ? 'matched' : 'no_candidate_after_retry',
    attempts: 2,
  }
}
