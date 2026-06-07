import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postfastPublish } from '@/lib/integrations/postfast'

type SessionUser = {
  id: string
  email?: string | null
  nickname?: string | null
}

// POST /api/tasks/[id]/retry-publish
// Human-triggered retry for a task that failed auto-publishing.
// Task must be in 'pending' status with a publish-error requiredInput.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as SessionUser

  const { id } = await params
  const task = await prisma.workUnit.findFirst({
    where: { id, status: 'pending' },
  })

  if (!task) return NextResponse.json({ error: 'Task not found or not in pending status' }, { status: 404 })

  // Derive brand from agent → BrandAgent → Brand
  const brandAgentLink = task.assigneeId
    ? await prisma.brandAgent.findFirst({
        where: { agentId: task.assigneeId, active: true },
        include: { brand: { select: { id: true, name: true, postfastApiKey: true } } },
      })
    : null

  const brand = brandAgentLink?.brand ?? null
  if (!brand) return NextResponse.json({ error: '无法从任务推导出关联品牌，请确认任务已分配给品牌 AI' }, { status: 400 })

  if (!brand.postfastApiKey) {
    return NextResponse.json({ error: '品牌未配置 PostFast API Key' }, { status: 400 })
  }

  // Extract draftId from materials (auto-pilot writes "草稿链接: ...draftId...")
  const draftIdMatch = task.materials?.match(/草稿链接:[^\n]*?([a-z0-9]{20,})/i)
  const draftIdFromMaterials = draftIdMatch?.[1] ?? null

  // Find the most recent content draft for this brand
  const draft = await prisma.contentDraft.findFirst({
    where: draftIdFromMaterials
      ? { id: draftIdFromMaterials, brandId: brand.id }
      : { brandId: brand.id, status: { in: ['draft', 'publishing'] } },
    include: { account: { select: { platformId: true, handle: true } } },
    orderBy: { createdAt: 'desc' },
  })

  if (!draft) {
    return NextResponse.json({ error: '没有找到关联的草稿内容，无法重试发布' }, { status: 400 })
  }

  const platformName = draft.account?.platformId
  if (!platformName) {
    return NextResponse.json({ error: '草稿未关联发布平台账号' }, { status: 400 })
  }

  // Write audit log — retry attempt
  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorType: 'HUMAN',
      actorName: sessionUser.nickname ?? sessionUser.email,
      action: 'RETRY_PUBLISH',
      resourceId: task.id,
      resourceType: 'WorkUnit',
      reason: '人工触发重试发布',
      metadata: { platform: platformName, draftId: draft.id, brandId: brand.id },
    },
  })

  // Mark draft as publishing
  await prisma.contentDraft.update({
    where: { id: draft.id },
    data: { status: 'publishing', agentNote: null },
  })

  // Attempt publish
  const publish = await postfastPublish({
    apiKey: brand.postfastApiKey,
    platform: platformName,
    caption: draft.caption,
    mediaUrls: draft.mediaUrls,
    hashtags: draft.hashtags,
    scheduledAt: draft.scheduledAt?.toISOString(),
  })

  if (publish.success) {
    await prisma.contentDraft.update({
      where: { id: draft.id },
      data: { status: 'published', publishedAt: new Date(), platformPostId: publish.postId ?? null },
    })

    const materials = task.materials
      ? `${task.materials}\n重试发布成功: ${publish.url ?? ''}`.trim()
      : `重试发布成功: ${publish.url ?? ''}`

    await prisma.workUnit.update({
      where: { id: task.id },
      data: { status: 'done', requiredInput: null, materials },
    })

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: sessionUser.nickname ?? sessionUser.email,
        action: 'PUBLISH_SUCCESS',
        resourceId: task.id,
        resourceType: 'WorkUnit',
        newValue: { postUrl: publish.url, postId: publish.postId, platform: platformName },
        metadata: { draftId: draft.id, brandId: brand.id },
      },
    })

    return NextResponse.json({ success: true, postUrl: publish.url, postId: publish.postId })
  } else {
    const errorMsg = `重试发布失败：${publish.error ?? 'unknown error'}`

    await prisma.contentDraft.update({
      where: { id: draft.id },
      data: { status: 'draft', agentNote: errorMsg },
    })

    await prisma.workUnit.update({
      where: { id: task.id },
      data: { requiredInput: `${errorMsg}。请检查发布配置后再次重试。` },
    })

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: sessionUser.nickname ?? sessionUser.email,
        action: 'PUBLISH_FAILED',
        resourceId: task.id,
        resourceType: 'WorkUnit',
        reason: errorMsg,
        metadata: { platform: platformName, draftId: draft.id, error: publish.error },
      },
    })

    return NextResponse.json({ success: false, error: errorMsg }, { status: 422 })
  }
}
