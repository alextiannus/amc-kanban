import { NextResponse } from 'next/server'
import { callLLM } from '@/lib/llmRouter'

export const maxDuration = 120

export async function POST(request: Request) {
  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
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
  const maxTokens = typeof body.maxTokens === 'number'
    ? Math.max(1, Math.min(4000, Math.round(body.maxTokens)))
    : 1200

  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  const result = await callLLM(taskTag, prompt, maxTokens)
  if (!result.text) {
    return NextResponse.json({
      error: result.error || 'LLM generation failed',
      provider: result.provider,
      modelName: result.modelName,
    }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    text: result.text,
    provider: result.provider,
    modelName: result.modelName,
  })
}
