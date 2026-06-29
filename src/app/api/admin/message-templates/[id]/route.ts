import { NextRequest, NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { writeAuditLog } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

async function verifyAdminAuth(req: NextRequest): Promise<{ authorized: boolean; actorName: string }> {
  const session = await getSession()
  if (session?.user && (isAmcOperator(session.user) || session.user.role === 'ADMIN')) {
    return { authorized: true, actorName: session.user.email || 'Admin User' }
  }

  const apiKey = extractApiKey(req)
  if (apiKey) {
    const agent = await getAgentFromApiKey(apiKey)
    if (agent && (agent.role === 'ADMIN' || agent.type === 'AI_AGENT')) {
      return { authorized: true, actorName: agent.email || `AI Agent (${agent.id})` }
    }
  }

  return { authorized: false, actorName: '' }
}

// PATCH /api/admin/message-templates/[id] - Update a template
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { authorized, actorName } = await verifyAdminAuth(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { subject, html, text } = body

    if (!subject || !html) {
      return NextResponse.json({ error: 'Subject and HTML body are required' }, { status: 400 })
    }

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        subject: String(subject).trim(),
        html: String(html),
        text: text ? String(text) : null,
        updatedBy: actorName
      }
    })

    // Write to audit log
    writeAuditLog({
      actor: { type: 'SYSTEM', name: actorName },
      action: 'UPDATE_MESSAGE_TEMPLATE',
      resourceId: id,
      resourceType: 'MessageTemplate',
      reason: `Template ${id} updated by ${actorName}`,
      metadata: {
        id,
        subject: updated.subject
      }
    })

    return NextResponse.json(updated)
  } catch (err: any) {
    console.error(`[templates_api] PATCH ${id} failed:`, err)
    return NextResponse.json({ error: 'Failed to update template', details: String(err) }, { status: 500 })
  }
}
