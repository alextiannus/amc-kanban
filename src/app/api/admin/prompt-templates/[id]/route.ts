import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAmcOperator } from '@/lib/amcOperator'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

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

async function requireAdmin() {
  const session = await getSession()
  if (!session?.user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAmcOperator(session.user)) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true as const, session }
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  try {
    const previous = await promptTable().findUnique({ where: { id } })
    if (!previous) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data: Record<string, unknown> = { updatedById: auth.session.user.id }
    if ('name' in body) data.name = String((body as any).name || '').trim()
    if ('description' in body) data.description = String((body as any).description || '').trim() || null
    if ('template' in body) data.template = String((body as any).template || '').trim()
    if ('variables' in body) data.variables = stringList((body as any).variables)
    if ('isEnabled' in body) data.isEnabled = Boolean((body as any).isEnabled)
    if (typeof data.name === 'string' && !data.name) return NextResponse.json({ error: 'name_required' }, { status: 400 })
    if (typeof data.template === 'string' && !data.template) return NextResponse.json({ error: 'template_required' }, { status: 400 })

    const updated = await promptTable().update({ where: { id }, data })
    await prisma.auditLog.create({
      data: {
        actorId: auth.session.user.id,
        actorType: 'HUMAN',
        actorName: auth.session.user.email || null,
        action: 'PROMPT_TEMPLATE_UPDATED',
        resourceId: updated.id,
        resourceType: 'PromptTemplate',
        oldValue: previous,
        newValue: updated,
      },
    })
    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error('[prompt-templates] update failed:', error)
    return NextResponse.json({ error: 'prompt_template_update_failed' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    const previous = await promptTable().findUnique({ where: { id } })
    if (!previous) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await promptTable().delete({ where: { id } })
    await prisma.auditLog.create({
      data: {
        actorId: auth.session.user.id,
        actorType: 'HUMAN',
        actorName: auth.session.user.email || null,
        action: 'PROMPT_TEMPLATE_DELETED',
        resourceId: id,
        resourceType: 'PromptTemplate',
        oldValue: previous,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[prompt-templates] delete failed:', error)
    return NextResponse.json({ error: 'prompt_template_delete_failed' }, { status: 500 })
  }
}
