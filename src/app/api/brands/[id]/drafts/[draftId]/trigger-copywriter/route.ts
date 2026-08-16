import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { cleanupDisposableAiPlaceholderDraft, isAiDraftPlaceholder } from '@/lib/draftCleanup'
import { assignRemoteCopyScriptExperiment } from '@/lib/amc-content/remoteContentService'
import { normalizeContentPlatform } from '@/lib/amc-content/platforms'

type Params = { params: Promise<{ id: string; draftId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function POST(request: Request, { params }: Params) {
  const { id: brandId, draftId } = await params
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  let requireAmcContent = body?.requireAmcContent === true

  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 1. Retrieve draft by ID
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, brandId },
    include: {
      account: true
    }
  })
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  const accountPlatform = draft.account?.platformId || 'instagram'
  const platform = normalizeContentPlatform(accountPlatform)
  requireAmcContent = requireAmcContent || Boolean(draft.viralCopyScriptId)

  // 2. Find or create an associated Kanban task (WorkUnit)
  // Look for any existing task that references this draftId in description or materials
  let task = await prisma.workUnit.findFirst({
    where: {
      brandId,
      status: { in: ['todo', 'in_progress', 'pending'] },
      OR: [
        { description: { contains: `Draft ID: ${draftId}` } },
        { materials: { contains: `Draft ID: ${draftId}` } }
      ]
    }
  })

  // Find the active AI Agent assigned to this brand to set as assignee
  const brandAgent = await prisma.brandAgent.findFirst({
    where: { brandId, active: true },
    select: { agentId: true }
  })
  const assigneeId = brandAgent?.agentId || null

  if (!task) {
    console.log(`No active task found for Draft ${draftId}. Creating a new one...`)
    
    // Determine platform name
    task = await prisma.workUnit.create({
      data: {
        title: `AI Copywriting: Complete post creation for draft`,
        description: `This task is automatically generated to complete content creation.\nDraft ID: ${draftId}\nOriginal Caption: ${draft.caption}`,
        status: 'todo',
        brandId,
        assigneeId,
        tags: [platform, 'ai_draft_trigger']
      }
    })
  } else {
    console.log(`Found active task ${task.id} for Draft ${draftId}. Ensuring status is 'todo'.`)
    // Move to 'todo' status to trigger the agent if it was paused/pending
    task = await prisma.workUnit.update({
      where: { id: task.id },
      data: {
        status: 'todo',
        assigneeId: task.assigneeId || assigneeId
      }
    })
  }

  let experimentAssignment: Awaited<ReturnType<typeof assignRemoteCopyScriptExperiment>> | null = null
  let effectiveCopyScriptId = draft.viralCopyScriptId || ''
  let effectiveCopyScriptVersionId = draft.viralCopyScriptVersionId || ''
  let effectiveScriptSelection = draft.viralCopyScriptSelection || ''
  if (effectiveCopyScriptId && effectiveCopyScriptVersionId) {
    try {
      const overrideArm = body?.experimentArm === 'treatment' || body?.experimentArm === 'control'
        ? body.experimentArm as 'treatment' | 'control'
        : undefined
      experimentAssignment = await assignRemoteCopyScriptExperiment({
        scriptId: effectiveCopyScriptId,
        scriptVersionId: effectiveCopyScriptVersionId,
        brandId,
        draftId,
        accountId: draft.accountId || undefined,
        platform,
        overrideArm,
      })
      if (!experimentAssignment.useScript) {
        effectiveCopyScriptId = ''
        effectiveCopyScriptVersionId = ''
      }
      effectiveScriptSelection = 'experiment'
      await prisma.contentDraft.update({
        where: { id: draftId },
        data: {
          viralCopyExperimentId: experimentAssignment.experiment.id,
          viralCopyExperimentAssignmentId: experimentAssignment.assignment.id,
          viralCopyExperimentArm: experimentAssignment.assignment.arm,
          viralCopyExperimentOverridden: experimentAssignment.assignment.overridden,
          viralCopyExperimentExcluded: experimentAssignment.assignment.excluded,
        },
      })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '爆品脚本实验分组失败' }, { status: 409 })
    }
  }

  // 3. Update draft caption in database to indicate AI is writing
  const originalCaption = draft.caption || ''
  const originalStatus = draft.status || 'draft'
  const canDeleteOnFailure = isAiDraftPlaceholder(originalCaption) && !draft.platformPostId && !draft.postUrl && !draft.publishedAt
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: { caption: '【AI 正在创作中...】' }
  })

  // 4. Invoke marketingGraph workflow and wait until it writes the draft.
  // Production runtimes may stop background promises once the response is sent,
  // so this endpoint must not fire-and-forget the actual copywriting job.
  // Use a draft-scoped thread_id so each draft gets its own isolated checkpoint.
  // This prevents stale state (error, status, aiFailed) from previous runs on the
  // same brand from polluting this draft's copywriting run.
  const config = { configurable: { thread_id: `draft_${draftId}` } }
  const { marketingGraph } = await import('@/agents/graph/marketingGraph.ts')
  let result: any = null
  try {
    result = await marketingGraph.invoke({
      taskId: task.id,
      brandId,
      draftId,
      platform,
      caption: originalCaption,
      copywriteOnly: true,
      // Explicitly reset fields that could be stale from a previous checkpoint
      status: 'in_progress',
      error: '',
      aiFailed: false,
      requireAmcContent,
      actorId: actor.id,
      actorType: actor.type,
      actorRole: actor.role,
      assigneeId,
      copyScriptId: effectiveCopyScriptId,
      copyScriptVersionId: effectiveCopyScriptVersionId,
      scriptSelection: effectiveScriptSelection,
      experimentAssignmentId: experimentAssignment?.assignment.id || '',
      experimentId: experimentAssignment?.experiment.id || '',
      experimentArm: experimentAssignment?.assignment.arm || '',
      experimentOverridden: experimentAssignment?.assignment.overridden || false,
    }, config)
    if (requireAmcContent && result?.contentEngine !== 'amc-content') {
      throw new Error(`Expected amc-content copywriter, got ${result?.contentEngine || 'unknown engine'}`)
    }
  } catch (err: any) {
    console.error(`Background copywriter trigger failed for draft ${draftId}:`, err);
    try {
      const reason = `AI generation graph error: ${err.message || String(err)}`
      const cleaned = canDeleteOnFailure
        ? await cleanupDisposableAiPlaceholderDraft({ brandId, draftId, reason })
        : false
      if (!cleaned) {
        await prisma.contentDraft.update({
          where: { id: draftId },
          data: {
            caption: originalCaption,
            status: originalStatus,
            agentNote: reason
          }
        });
      }
    } catch (dbErr) {
      console.error(`Failed to update draft ${draftId} to failed on error:`, dbErr);
    }
    try {
      await prisma.workUnit.update({
        where: { id: task.id },
        data: { status: 'failed', requiredInput: `AI copywriter graph invocation crashed: ${err.message || String(err)}` }
      });
    } catch (dbErr) {
      console.error(`Failed to update task ${task.id} to failed:`, dbErr);
    }
    return NextResponse.json(
      { error: err.message || 'AI Copywriter failed', taskId: task.id, cleanedPlaceholderDraft: canDeleteOnFailure },
      { status: 500 }
    )
  }

  const provenance = result?.provenance as any
  if (provenance?.copyScriptId && provenance?.copyScriptVersionId) {
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        viralCopyScriptId: provenance.copyScriptId,
        viralCopyScriptVersionId: provenance.copyScriptVersionId,
        viralCopyScriptName: provenance.copyScriptName || draft.viralCopyScriptName,
        viralCopyScriptSelection: provenance.scriptSelection || draft.viralCopyScriptSelection || 'manual',
        viralCopyScriptProvenance: provenance,
      },
    })
  }

  const updatedDraft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
    select: {
      id: true, caption: true, hashtags: true, status: true, agentNote: true,
      viralCopyScriptId: true, viralCopyScriptVersionId: true, viralCopyScriptName: true,
      viralCopyScriptSelection: true, viralCopyScriptProvenance: true,
      viralCopyExperimentId: true, viralCopyExperimentAssignmentId: true, viralCopyExperimentArm: true,
      viralCopyExperimentOverridden: true, viralCopyExperimentExcluded: true,
    },
  })

  return NextResponse.json({
    success: true,
    taskId: task.id,
    contentEngine: result?.contentEngine || null,
    provenance: result?.provenance || null,
    quality: result?.quality || null,
    draft: updatedDraft,
    message: 'AI Copywriter triggered successfully'
  })
}
