import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGeminiApiKey } from '@/lib/systemConfig'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/client-config
 *
 * Returns client-side configuration for authenticated users.
 * Exposes LLM credentials so the browser can call LLMs directly
 * for ultra-low-latency streaming chat (no server round-trip).
 *
 * Priority:
 *   1. First enabled GLM / OpenAI-compat LLMConfig from DB (custom_shim / openai / deepseek)
 *   2. Gemini API key from SystemConfig (fallback)
 *
 * ⚠️  Keys are visible in browser DevTools/sessionStorage.
 *     Acceptable for internal operator tools. Not for public consumer apps.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Look for best OpenAI-compat LLM (GLM, DeepSeek, etc.) from LLMConfig table
  let llmConfig: { provider: string; modelName: string; apiKey: string; baseUrl: string | null } | null = null
  try {
    const configs = await prisma.lLMConfig.findMany({
      where: {
        isEnabled: true,
        provider: { in: ['custom_shim', 'openai', 'deepseek'] },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 1,
    })
    if (configs.length > 0) {
      const c = configs[0]
      llmConfig = {
        provider: c.provider,
        modelName: c.modelName,
        apiKey: c.apiKey || '',
        baseUrl: c.baseUrl || null,
      }
    }
  } catch (err) {
    console.warn('[client-config] LLMConfig query failed:', err)
  }

  if (llmConfig?.apiKey) {
    return NextResponse.json(
      { llmConfig },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // 2. Fallback: Gemini key
  const geminiApiKey = await getGeminiApiKey()
  if (geminiApiKey) {
    return NextResponse.json(
      { geminiApiKey, llmConfig: null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
}
