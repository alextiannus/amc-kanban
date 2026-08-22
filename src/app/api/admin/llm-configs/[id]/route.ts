import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { validateLLMConfig } from '@/lib/llmRouter'
import { validateVideoProviderConfig } from '@/lib/videoGeneration'
import { isMiniMaxTtsConfig, validateMiniMaxTtsConfig } from '@/lib/minimaxTtsValidation'
import { incompatibleFallbackIds, inferExecutionCapabilities, normalizeCapabilities, unsupportedTasks } from '@/lib/modelCapabilities'

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null
  if (key.length <= 8) return '••••••••'
  return `••••••${key.slice(-4)}`
}

const VIDEO_MODEL_PROVIDERS = new Set(['seedance', 'fal', 'kieai', 'volcengine'])

function normalizeTaskTag(tag: unknown): string {
  return String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeContentGenerationType(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/[\s-]+/g, '_')
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
      contentGenerationTypes,
      capabilities,
      priority,
      timeoutMs,
      maxRetries,
      fallbackProfileIds,
      costMetadata,
      secretRef,
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
    const nextContentGenerationTypes = contentGenerationTypes !== undefined
      ? Array.isArray(contentGenerationTypes) ? contentGenerationTypes.map(normalizeContentGenerationType).filter(Boolean) : []
      : current.contentGenerationTypes
    const nextCapabilities = inferExecutionCapabilities(
      testProvider,
      nextTaskTags,
      capabilities !== undefined ? normalizeCapabilities(capabilities) : normalizeCapabilities(current.capabilities),
    )
    const unsupported = unsupportedTasks(nextTaskTags, nextCapabilities)
    if (unsupported.length) return NextResponse.json({ error: `Capabilities do not satisfy tasks: ${unsupported.join(', ')}` }, { status: 400 })
    const nextFallbackIds = fallbackProfileIds !== undefined
      ? Array.isArray(fallbackProfileIds) ? fallbackProfileIds.map(String).map((item) => item.trim()).filter(Boolean) : []
      : current.fallbackProfileIds
    if (nextFallbackIds.includes(id)) return NextResponse.json({ error: 'A profile cannot fall back to itself' }, { status: 400 })
    if (nextFallbackIds.length) {
      const fallbacks = await prisma.lLMConfig.findMany({ where: { id: { in: nextFallbackIds } }, select: { id: true, provider: true, taskTags: true, capabilities: true } })
      if (fallbacks.length !== new Set(nextFallbackIds).size) return NextResponse.json({ error: 'One or more fallback profiles do not exist' }, { status: 400 })
      const incompatible = incompatibleFallbackIds(nextTaskTags, fallbacks)
      if (incompatible.length) return NextResponse.json({ error: `Fallback profiles are not task/capability compatible: ${incompatible.join(', ')}` }, { status: 400 })
    }

    if (isMiniMaxTtsConfig(testProvider, testModelName, testBaseUrl, nextTaskTags)) {
      const validation = await validateMiniMaxTtsConfig({
        modelName: testModelName,
        apiKey: nextApiKey,
        baseUrl: testBaseUrl,
      })
      if (!validation.success) {
        return NextResponse.json({ error: `MiniMax TTS 配置可用性验证失败: ${validation.error}` }, { status: 400 })
      }
    } else if (isVideoModelConfig(testProvider, nextTaskTags)) {
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
        ...(contentGenerationTypes !== undefined && { contentGenerationTypes: nextContentGenerationTypes }),
        ...(capabilities !== undefined && { capabilities: nextCapabilities }),
        ...(priority !== undefined && { priority: Number.isInteger(priority) ? priority : current.priority }),
        ...(timeoutMs !== undefined && { timeoutMs: Math.max(1000, Math.min(600000, Number(timeoutMs) || current.timeoutMs)) }),
        ...(maxRetries !== undefined && { maxRetries: Math.max(0, Math.min(5, Number(maxRetries) || 0)) }),
        ...(fallbackProfileIds !== undefined && { fallbackProfileIds: nextFallbackIds }),
        ...(costMetadata !== undefined && { costMetadata: costMetadata && typeof costMetadata === 'object' ? costMetadata : null }),
        ...(secretRef !== undefined && { secretRef: secretRef ? String(secretRef).trim() : null }),
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

    const referencedBy = await prisma.lLMConfig.findFirst({
      where: { fallbackProfileIds: { has: id } },
      select: { id: true, displayName: true },
    })
    if (referencedBy) {
      return NextResponse.json({ error: `Config is used as fallback by ${referencedBy.displayName}` }, { status: 409 })
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
