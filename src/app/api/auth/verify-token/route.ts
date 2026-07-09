import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-v2'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const principal = await authenticateRequest(request)
  if (!principal) {
    return NextResponse.json({ valid: false }, { status: 401 })
  }
  return NextResponse.json({
    valid: true,
    user: {
      id: principal.userId,
      email: principal.email,
      roles: principal.globalRoles,
      actorType: principal.actorType,
    }
  })
}
