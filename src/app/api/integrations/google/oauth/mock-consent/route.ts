import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(
    { error: 'Mock OAuth flow has been disabled. Configure real Google OAuth credentials and use /api/integrations/google/oauth.' },
    { status: 410 }
  )
}
