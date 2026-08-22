import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAmcOperator } from '@/lib/amcOperator'
import { prisma } from '@/lib/prisma'
import { listPromptTemplates } from '@/lib/promptTemplates'

function promptTable() {
  return (prisma as any).promptTemplate
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeTaskKey(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

async function requireAdmin() {
  const session = await getSession()
  if (!session?.user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAmcOperator(session.user)) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true as const, session }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const templates = await listPromptTemplates()
    return NextResponse.json({ templates })
  } catch (error) {
    console.error('[prompt-templates] list failed:', error)
    return NextResponse.json({ error: 'prompt_templates_list_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const taskKey = normalizeTaskKey((body as any).taskKey)
  const name = String((body as any).name || '').trim()
  const template = String((body as any).template || '').trim()
  if (!taskKey || !name || !template) {
    return NextResponse.json({ error: 'taskKey, name and template are required' }, { status: 400 })
  }

  try {
    const created = await promptTable().create({
      data: {
        taskKey,
        name,
        description: String((body as any).description || '').trim() || null,
        template,
        variables: stringList((body as any).variables),
        isEnabled: (body as any).isEnabled !== false,
        updatedById: auth.session.user.id,
      },
    })
    await prisma.auditLog.create({
      data: {
        actorId: auth.session.user.id,
        actorType: 'HUMAN',
        actorName: auth.session.user.email || null,
        action: 'PROMPT_TEMPLATE_CREATED',
        resourceId: created.id,
        resourceType: 'PromptTemplate',
        newValue: created,
      },
    })
    return NextResponse.json({ template: created })
  } catch (error: any) {
    console.error('[prompt-templates] create failed:', error)
    return NextResponse.json({ error: error?.code === 'P2002' ? 'task_key_already_exists' : 'prompt_template_create_failed' }, { status: 500 })
  }
}
