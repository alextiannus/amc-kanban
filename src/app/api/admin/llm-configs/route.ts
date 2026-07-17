import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { validateLLMConfig } from '@/lib/llmRouter'

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null
  if (key.length <= 8) return '••••••••'
  return `••••••${key.slice(-4)}`
}

const VIDEO_MODEL_PROVIDERS = new Set(['seedance', 'fal', 'kieai', 'volcengine'])

function normalizeTaskTag(tag: unknown): string {
  return String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function isVideoModelConfig(provider: unknown, taskTags: unknown): boolean {
  if (VIDEO_MODEL_PROVIDERS.has(String(provider).trim().toLowerCase())) return true
  if (!Array.isArray(taskTags)) return false
  const tags = new Set(taskTags.map(normalizeTaskTag))
  return tags.has('video_generation') || tags.has('image_to_video') || tags.has('video_provider')
}

// GET /api/admin/llm-configs - List all configurations
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const configs = await prisma.lLMConfig.findMany({
      orderBy: { updatedAt: 'desc' },
    })

    const maskedConfigs = configs.map((c: any) => ({
      ...c,
      apiKey: maskKey(c.apiKey),
    }))

    return NextResponse.json({ configs: maskedConfigs })
  } catch (error: any) {
    console.error('[GET llm-configs error]', error)
    return NextResponse.json({ error: 'Failed to retrieve configs' }, { status: 500 })
  }
}

// POST /api/admin/llm-configs - Create a new configuration
export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorId = typeof session.user.id === 'string' ? session.user.id : null
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      provider,
      displayName,
      modelName,
      apiKey,
      baseUrl,
      isEnabled = true,
      isDefault = false,
      taskTags = [],
    } = body

    if (!provider || !displayName || !modelName || !apiKey) {
      return NextResponse.json({ error: 'Missing required fields: provider, displayName, modelName, apiKey' }, { status: 400 })
    }

    const cleanApiKey = String(apiKey).trim()
    if (!cleanApiKey) {
      return NextResponse.json({ error: 'API key cannot be empty' }, { status: 400 })
    }

    const cleanTaskTags = Array.isArray(taskTags) ? taskTags.map(normalizeTaskTag).filter(Boolean) : []

    // Video generation providers are async job APIs, not chat-completion models.
    if (!isVideoModelConfig(provider, cleanTaskTags)) {
      const validation = await validateLLMConfig(
        String(provider).trim(),
        String(modelName).trim(),
        cleanApiKey,
        baseUrl ? String(baseUrl).trim() : null
      )
      if (!validation.success) {
        return NextResponse.json({ error: `大模型配置可用性验证失败: ${validation.error}` }, { status: 400 })
      }
    }

    // If marked as default, unset default on other configurations
    if (isDefault) {
      await prisma.lLMConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const created = await prisma.lLMConfig.create({
      data: {
        provider: String(provider).trim(),
        displayName: String(displayName).trim(),
        modelName: String(modelName).trim(),
        apiKey: cleanApiKey,
        baseUrl: baseUrl ? String(baseUrl).trim() : null,
        isEnabled: Boolean(isEnabled),
        isDefault: Boolean(isDefault),
        taskTags: cleanTaskTags,
      },
    })

    // Write to audit log
    const maskedNew = { ...created, apiKey: maskKey(created.apiKey) }
    await prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'LLM_CONFIG_CREATED',
        resourceId: created.id,
        resourceType: 'LLMConfig',
        newValue: maskedNew,
      },
    })

    return NextResponse.json({ config: maskedNew })
  } catch (error: any) {
    console.error('[POST llm-configs error]', error)
    return NextResponse.json({ error: error.message || 'Failed to create config' }, { status: 500 })
  }
}
