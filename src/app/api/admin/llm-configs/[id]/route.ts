import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { validateLLMConfig } from '@/lib/llmRouter'
import { validateVideoProviderConfig } from '@/lib/videoGeneration'

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

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/llm-configs/[id] - Update a configuration
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
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

    const current = await prisma.lLMConfig.findUnique({
      where: { id },
    })

    if (!current) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    const {
      provider,
      displayName,
      modelName,
      apiKey,
      baseUrl,
      isEnabled,
      isDefault,
      taskTags,
    } = body

    let nextApiKey = current.apiKey
    if (apiKey !== undefined) {
      const trimmedKey = String(apiKey).trim()
      if (trimmedKey.startsWith('••••••')) {
        // Retain original key if masked placeholder is sent
        nextApiKey = current.apiKey
      } else if (!trimmedKey) {
        return NextResponse.json({ error: 'API key cannot be empty' }, { status: 400 })
      } else {
        nextApiKey = trimmedKey
      }
    }

    const testProvider = provider !== undefined ? String(provider).trim() : current.provider
    const testModelName = modelName !== undefined ? String(modelName).trim() : current.modelName
    const testBaseUrl = baseUrl !== undefined ? (baseUrl ? String(baseUrl).trim() : null) : current.baseUrl
    const nextTaskTags = taskTags !== undefined
      ? Array.isArray(taskTags) ? taskTags.map(normalizeTaskTag).filter(Boolean) : []
      : current.taskTags

    if (isVideoModelConfig(testProvider, nextTaskTags)) {
      const validation = await validateVideoProviderConfig({
        provider: testProvider,
        modelName: testModelName,
        apiKey: nextApiKey,
        baseUrl: testBaseUrl,
      })
      if (!validation.success) {
        return NextResponse.json({ error: `视频模型配置可用性验证失败: ${validation.error}` }, { status: 400 })
      }
    } else {
      const validation = await validateLLMConfig(testProvider, testModelName, nextApiKey, testBaseUrl)
      if (!validation.success) {
        return NextResponse.json({ error: `大模型配置可用性验证失败: ${validation.error}` }, { status: 400 })
      }
    }

    const nextIsDefault = isDefault !== undefined ? Boolean(isDefault) : current.isDefault

    // If marked as default, unset default on other configurations
    if (nextIsDefault && !current.isDefault) {
      await prisma.lLMConfig.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      })
    }

    const updated = await prisma.lLMConfig.update({
      where: { id },
      data: {
        ...(provider !== undefined && { provider: String(provider).trim() }),
        ...(displayName !== undefined && { displayName: String(displayName).trim() }),
        ...(modelName !== undefined && { modelName: String(modelName).trim() }),
        apiKey: nextApiKey,
        ...(baseUrl !== undefined && { baseUrl: baseUrl ? String(baseUrl).trim() : null }),
        ...(isEnabled !== undefined && { isEnabled: Boolean(isEnabled) }),
        isDefault: nextIsDefault,
        ...(taskTags !== undefined && { taskTags: nextTaskTags }),
      },
    })

    // Write to audit log
    const maskedOld = { ...current, apiKey: maskKey(current.apiKey) }
    const maskedNew = { ...updated, apiKey: maskKey(updated.apiKey) }

    await prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'LLM_CONFIG_UPDATED',
        resourceId: updated.id,
        resourceType: 'LLMConfig',
        oldValue: maskedOld,
        newValue: maskedNew,
      },
    })

    return NextResponse.json({ config: maskedNew })
  } catch (error: any) {
    console.error('[PATCH llm-config error]', error)
    return NextResponse.json({ error: error.message || 'Failed to update config' }, { status: 500 })
  }
}

// DELETE /api/admin/llm-configs/[id] - Delete a configuration
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorId = typeof session.user.id === 'string' ? session.user.id : null
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const current = await prisma.lLMConfig.findUnique({
      where: { id },
    })

    if (!current) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    await prisma.lLMConfig.delete({
      where: { id },
    })

    // Write to audit log
    const maskedOld = { ...current, apiKey: maskKey(current.apiKey) }
    await prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'LLM_CONFIG_DELETED',
        resourceId: id,
        resourceType: 'LLMConfig',
        oldValue: maskedOld,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE llm-config error]', error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}
