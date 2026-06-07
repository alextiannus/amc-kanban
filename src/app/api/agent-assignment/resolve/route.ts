import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAmcOperator } from '@/lib/amcOperator'
import { AssignmentError, resolveAssignment, SUBJECT_TYPES } from '@/lib/assignmentPool'

function isSystemCaller(request: Request): boolean {
  const internalKey = process.env.ASSIGNMENT_INTERNAL_KEY?.trim()
  if (!internalKey) return false
  const supplied = request.headers.get('x-assignment-internal-key')?.trim()
  return supplied === internalKey
}

export async function POST(request: Request) {
  const session = await getSession()
  const adminCaller = !!session?.user && isAmcOperator(session.user)
  const adminActorId = adminCaller && typeof session?.user?.id === 'string' ? session.user.id : null
  const systemCaller = isSystemCaller(request)

  if (!adminCaller && !systemCaller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const subjectType = typeof body.subjectType === 'string' ? body.subjectType : ''
  const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
  const dryRun = typeof body.dryRun === 'boolean' ? body.dryRun : false

  if (!SUBJECT_TYPES.includes(subjectType as (typeof SUBJECT_TYPES)[number])) {
    return NextResponse.json({ error: 'Invalid subjectType' }, { status: 400 })
  }
  if (!subjectId.trim()) {
    return NextResponse.json({ error: 'subjectId is required' }, { status: 400 })
  }

  const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() || null

  const typedSubjectType = subjectType as (typeof SUBJECT_TYPES)[number]

  try {
    const result = await resolveAssignment({
      subjectType: typedSubjectType,
      subjectId: subjectId.trim(),
      industry: typeof body.industry === 'string' ? body.industry : null,
      region: typeof body.region === 'string' ? body.region : null,
      referenceCode: typeof body.referenceCode === 'string' ? body.referenceCode : null,
      dryRun,
      idempotencyKey,
      createdBy: adminCaller ? 'admin' : 'system',
      actorId: adminActorId,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AssignmentError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status })
    }
    console.error('[POST /api/agent-assignment/resolve]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
