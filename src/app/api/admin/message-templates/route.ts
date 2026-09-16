import { NextRequest, NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { DEFAULT_TEMPLATES } from '@/lib/email'

// Helper to check authorization for both session (admin user) and API Key (AI agent)
async function verifyAdminAuth(req: NextRequest): Promise<boolean> {
  const session = await getSession()
  if (session?.user && (isAmcOperator(session.user) || session.user.role === 'ADMIN')) {
    return true
  }

  const apiKey = extractApiKey(req)
  if (apiKey) {
    const agent = await getAgentFromApiKey(apiKey)
    if (agent?.role === 'ADMIN') {
      return true
    }
  }

  return false
}

// GET /api/admin/message-templates - List all templates
export async function GET(req: NextRequest) {
  const isAuth = await verifyAdminAuth(req)
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let templates = await prisma.messageTemplate.findMany({
      orderBy: { id: 'asc' }
    })

    const existingIds = new Set(templates.map((template: { id: string }) => template.id))
    const missingDefaultTemplates = Object.entries(DEFAULT_TEMPLATES)
      .filter(([id]) => !existingIds.has(id))
      .map(([id, t]) => ({
        id,
        name: t.name,
        description: t.description,
        subject: t.subject,
        html: t.html,
        text: t.text,
        placeholders: t.placeholders,
        updatedBy: 'System Seed'
      }))

    // Auto-seed newly added defaults without overwriting templates edited in Admin.
    if (missingDefaultTemplates.length > 0) {
      await prisma.messageTemplate.createMany({
        data: missingDefaultTemplates
      })

      templates = await prisma.messageTemplate.findMany({
        orderBy: { id: 'asc' }
      })
    }

    return NextResponse.json(templates)
  } catch (err: any) {
    console.error('[templates_api] GET failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
