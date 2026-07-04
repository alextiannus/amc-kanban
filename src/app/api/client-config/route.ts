import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/client-config
 *
 * Returns client-side configuration for authenticated users.
 * Previously exposed Gemini API keys to the browser; now only returns
 * LLMConfig metadata for OpenAI-compatible providers if needed by any
 * client-side tool. AI keys are no longer sent to the browser.
 *
 * Note: callGeminiDirect() now routes through /api/llm/chat server-side,
 * so this endpoint is no longer required for AI calls.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Return best enabled LLMConfig for any client-side metadata needs
  // (e.g. showing which AI model is active in UI). Keys are NOT included.
  try {
    const configs = await prisma.lLMConfig.findMany({
      where: { isEnabled: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 1,
      select: { provider: true, modelName: true, displayName: true },
    })

    if (configs.length > 0) {
      const c = configs[0]
      return NextResponse.json(
        { llmConfig: { provider: c.provider, modelName: c.modelName, displayName: c.displayName } },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
  } catch (err) {
    console.warn('[client-config] LLMConfig query failed:', err)
  }

  return NextResponse.json({ llmConfig: null }, { headers: { 'Cache-Control': 'no-store' } })
}
