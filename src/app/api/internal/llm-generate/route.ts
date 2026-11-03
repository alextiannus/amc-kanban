import { NextResponse } from 'next/server'
import { callLLM } from '@/lib/llmRouter'
import { internalLLMFailure } from '@/lib/internal-llm-errors'

export const maxDuration = 120

export async function POST(request: Request) {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
    || (isLocal ? 'local-internal-token' : undefined)
  const suppliedToken = request.headers.get('x-content-service-token')?.trim()
  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const taskTag = typeof body.taskTag === 'string' && body.taskTag.trim()
    ? body.taskTag.trim()
    : 'copywriting'
  const tokenCeiling = ['growth_report_analysis', 'growth_report_analysis_json_repair'].includes(taskTag) ? 8192 : 4000
  const maxTokens = typeof body.maxTokens === 'number' && Number.isFinite(body.maxTokens)
    ? Math.max(1, Math.min(tokenCeiling, Math.round(body.maxTokens)))
    : 1200
  const responseFormat = body.responseFormat === 'json' ? 'json' : 'text'
  const temperature = typeof body.temperature === 'number' && Number.isFinite(body.temperature)
    ? Math.max(0, Math.min(2, body.temperature))
    : undefined
  const deadlineMs = typeof body.deadlineMs === 'number' && Number.isFinite(body.deadlineMs)
    ? Math.max(1000, Math.min(110_000, Math.round(body.deadlineMs)))
    : undefined
  const maxAttempts = typeof body.maxAttempts === 'number' && Number.isFinite(body.maxAttempts)
    ? Math.max(1, Math.min(4, Math.round(body.maxAttempts)))
    : undefined
  const rawAttemptTimeouts: unknown[] = Array.isArray(body.attemptTimeoutMs)
    ? body.attemptTimeoutMs
    : typeof body.attemptTimeoutMs === 'number'
      ? [body.attemptTimeoutMs]
      : []
  const attemptTimeoutMs = rawAttemptTimeouts
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .slice(0, 4)
    .map((value) => Math.max(1000, Math.min(110_000, Math.round(value))))

  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  try {
    const result = await callLLM(taskTag, prompt, maxTokens, {
      jsonMode: responseFormat === 'json',
      temperature,
      signal: request.signal,
      deadlineMs,
      attemptTimeoutMs: attemptTimeoutMs.length ? attemptTimeoutMs : undefined,
      maxAttempts,
    })
    if (!result.text) {
      return NextResponse.json({
        error: 'LLM generation failed',
        provider: result.provider,
        modelName: result.modelName,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        timedOut: result.timedOut,
      }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      text: result.text,
      provider: result.provider,
      modelName: result.modelName,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      timedOut: result.timedOut,
    })
  } catch (error) {
    const failure = internalLLMFailure(error)
    console.error(JSON.stringify({ event: 'internal_llm_failed', task: /^[a-z0-9_]{1,100}$/i.test(taskTag) ? taskTag : 'other', ...failure }))
    return NextResponse.json(failure, { status: 502 })
  }
}
