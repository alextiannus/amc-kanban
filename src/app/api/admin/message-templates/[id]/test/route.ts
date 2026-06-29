import { NextRequest, NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { sendEmail, interpolateTemplate, DEFAULT_TEMPLATES } from '@/lib/email'

type Params = { params: Promise<{ id: string }> }

async function verifyAdminAuth(req: NextRequest): Promise<boolean> {
  const session = await getSession()
  if (session?.user && (isAmcOperator(session.user) || session.user.role === 'ADMIN')) {
    return true
  }

  const apiKey = extractApiKey(req)
  if (apiKey) {
    const agent = await getAgentFromApiKey(apiKey)
    if (agent && (agent.role === 'ADMIN' || agent.type === 'AI_AGENT')) {
      return true
    }
  }

  return false
}

// POST /api/admin/message-templates/[id]/test - Send a test notification
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const isAuth = await verifyAdminAuth(req)
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { toEmail } = body

    if (!toEmail) {
      return NextResponse.json({ error: 'Target email is required' }, { status: 400 })
    }

    // 1. Fetch template
    let template = await prisma.messageTemplate.findUnique({
      where: { id }
    })

    const fallback = DEFAULT_TEMPLATES[id as keyof typeof DEFAULT_TEMPLATES]
    if (!template && fallback) {
      template = {
        id,
        name: fallback.name,
        description: fallback.description,
        subject: fallback.subject,
        html: fallback.html,
        text: fallback.text,
        placeholders: fallback.placeholders,
        updatedAt: new Date(),
        updatedBy: 'Test Fallback'
      }
    }

    if (!template) {
      return NextResponse.json({ error: `Template ${id} not found` }, { status: 404 })
    }

    // 2. Populate mock variables
    const mockVars: Record<string, string> = {
      nickname: '甄子丹（商户主理人）',
      to: toEmail,
      temporaryPassword: 'TestTemporaryPassword123!',
      invitationLink: 'https://amc-mm.immedi.ai/invite/mock-token-abc',
      mmInviteLink: 'https://amc-mm.immedi.ai/invite/mock-token-abc',
      brandName: '锦江川菜馆（静安店）',
      planName: '尊享代运营钻石套餐',
      adminEmail: 'support@amc.immedi.ai'
    }

    // Parse conditional planName blocks
    let finalHtml = template.html
    const planName = mockVars.planName
    if (planName) {
      finalHtml = finalHtml.replace(/\{\{#planName\}\}(.*?)\{\{\/planName\}\}/g, '$1')
    } else {
      finalHtml = finalHtml.replace(/\{\{#planName\}\}.*?\{\{\/planName\}\}/g, '')
    }

    let finalExtText = template.text || ''
    if (planName) {
      finalExtText = finalExtText.replace(/\{\{#planName\}\}(.*?)\{\{\/planName\}\}/g, '$1')
    } else {
      finalExtText = finalExtText.replace(/\{\{#planName\}\}.*?\{\{\/planName\}\}/g, '')
    }

    // 3. Send test email
    const result = await sendEmail({
      to: toEmail,
      subject: `【测试】${interpolateTemplate(template.subject, mockVars)}`,
      html: interpolateTemplate(finalHtml, mockVars),
      text: interpolateTemplate(finalExtText, mockVars)
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (err: any) {
    console.error(`[templates_api] POST test ${id} failed:`, err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
