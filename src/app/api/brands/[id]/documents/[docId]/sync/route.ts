import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { writeAuditLog, actorFromContext } from '@/lib/audit'
import { eventEmitter } from '@/lib/events'

type Params = { params: Promise<{ id: string; docId: string }> }

function getBrandSlug(brand: { name: string; id: string }): string {
  return brand.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || brand.id
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { id: brandId, docId } = await params

  let userId: string
  let userType: string
  let userRole: string

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type ?? 'HUMAN'
    userRole = session.user.role
  } else {
    userId = authenticatedAgent!.id
    userType = authenticatedAgent!.type ?? 'HUMAN'
    userRole = 'USER'
  }

  const ok = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  try {
    const { summary } = await request.json().catch(() => ({ summary: '' }))

    // Decode docId to get the relative path
    let decodedRelativePath: string
    try {
      decodedRelativePath = Buffer.from(docId, 'base64url').toString('utf8')
    } catch {
      return NextResponse.json({ error: 'Invalid document ID format' }, { status: 400 })
    }

    const absoluteFilePath = path.join(process.cwd(), 'documents', decodedRelativePath)
    const resolvedPath = path.resolve(absoluteFilePath)
    const baseDocumentsDir = path.resolve(path.join(process.cwd(), 'documents'))

    // Path traversal check
    if (!resolvedPath.startsWith(baseDocumentsDir)) {
      return NextResponse.json({ error: 'Forbidden: Path traversal detected' }, { status: 403 })
    }

    let fileMissing = false

    // Check if file exists
    try {
      await fs.access(resolvedPath)
    } catch {
      fileMissing = true
    }

    // Verify brand slug matching
    const pathParts = decodedRelativePath.split(path.sep)
    const brandSlug = pathParts[0]
    const docType = pathParts[1] || 'other'
    const filename = pathParts[2] || 'document.md'

    const expectedSlug = getBrandSlug(brand)
    if (brandSlug !== expectedSlug) {
      return NextResponse.json({ error: 'Forbidden: Document does not belong to this brand' }, { status: 403 })
    }

    const content = fileMissing
      ? [
          `Document file was not available on this runtime instance.`,
          `Document ID: ${docId}`,
          `Document path: ${decodedRelativePath}`,
        ].join('\n')
      : await fs.readFile(resolvedPath, 'utf8')

    // Create a 'done' task on Kanban
    const taskTitle = `[Sync] ${docType.toUpperCase().replace('_', ' ')} - ${filename}`
    const taskDescription = `**Document Synced to Kanban**\n\n**Summary:**\n${summary || 'No summary provided.'}\n\n${fileMissing ? '**Notice:** The saved Markdown file was not available on this runtime instance, so this task records the document reference and supplied summary.\n\n' : ''}---\n\n**Document Content:**\n\n${content}`

    const task = await prisma.workUnit.create({
      data: {
        title: taskTitle,
        description: taskDescription,
        status: 'done',
        priority: 'medium',
        weight: 1,
        assigneeId: userId,
        brandId,
        tags: ['document', docType]
      }
    })

    await writeAuditLog({
      actor: actorFromContext(session?.user, authenticatedAgent),
      action: 'TASK_CREATED',
      resourceId: task.id,
      newValue: task,
      metadata: { source: 'document_sync', docId }
    })

    eventEmitter.emit('board_update')

    return NextResponse.json({
      success: true,
      fileMissing,
      taskId: task.id,
      task
    })
  } catch (error: any) {
    console.error('Error syncing document to Kanban:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
