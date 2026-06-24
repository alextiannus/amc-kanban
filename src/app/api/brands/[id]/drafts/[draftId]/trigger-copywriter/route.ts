import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'

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
    const platform = draft.account?.platformId || 'instagram'
    
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

  // 3. Asynchronously invoke marketingGraph workflow in the background
  const config = { configurable: { thread_id: brandId } }
  const platform = draft.account?.platformId || 'instagram'
  
  const { marketingGraph } = await import('@/agents/graph/marketingGraph.ts')
  void marketingGraph.invoke({
    taskId: task.id,
    brandId,
    draftId,
    platform,
    copywriteOnly: true
  }, config).catch((err) => {
    console.error(`Background copywriter trigger failed for draft ${draftId}:`, err);
  })

  return NextResponse.json({
    success: true,
    taskId: task.id,
    message: 'AI Copywriter triggered successfully'
  })
}
