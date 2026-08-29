import assert from 'node:assert/strict'
import { resolveCalendarCreativeCandidateWithRetry } from '../src/lib/brand-plan/calendarCreativeMatching.ts'

type MockPool = {
  id: string
  candidates: string[]
}

{
  let calls = 0
  await assert.rejects(
    resolveCalendarCreativeCandidateWithRetry<MockPool, string>({
      requestPool: async () => {
        calls += 1
        throw new Error('amc-content unavailable')
      },
      selectCandidate: (pool) => pool.candidates[0] || null,
      initialRefreshPublicationId: 'pub-1',
      retryRefreshPublicationId: 'pub-1:retry',
    }),
    /amc-content unavailable/
  )
  assert.equal(calls, 1)
}

{
  const requestedIds: string[] = []
  const result = await resolveCalendarCreativeCandidateWithRetry<MockPool, string>({
    requestPool: async (refreshPublicationId) => {
      requestedIds.push(refreshPublicationId)
      return refreshPublicationId.endsWith(':retry')
        ? { id: refreshPublicationId, candidates: ['cre_retry_match'] }
        : { id: refreshPublicationId, candidates: [] }
    },
    selectCandidate: (pool) => pool.candidates[0] || null,
    initialRefreshPublicationId: 'pub-2',
    retryRefreshPublicationId: 'pub-2:retry',
  })
  assert.deepEqual(requestedIds, ['pub-2', 'pub-2:retry'])
  assert.equal(result.candidate, 'cre_retry_match')
  assert.equal(result.status, 'matched')
  assert.equal(result.attempts, 2)
}

{
  const requestedIds: string[] = []
  const result = await resolveCalendarCreativeCandidateWithRetry<MockPool, string>({
    requestPool: async (refreshPublicationId) => {
      requestedIds.push(refreshPublicationId)
      return { id: refreshPublicationId, candidates: [] }
    },
    selectCandidate: (pool) => pool.candidates[0] || null,
    initialRefreshPublicationId: 'pub-3',
    retryRefreshPublicationId: 'pub-3:retry',
  })
  assert.deepEqual(requestedIds, ['pub-3', 'pub-3:retry'])
  assert.equal(result.candidate, null)
  assert.equal(result.status, 'no_candidate_after_retry')
  assert.equal(result.attempts, 2)
}

console.log('Brand plan calendar matcher retry tests passed.')
