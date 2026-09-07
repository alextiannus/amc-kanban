import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { SocialAccountBindingError, unbindSocialAccount } from '@/lib/socialAccountBinding'

export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, aid } = await params
  if (!(await canWriteBrandProject(id, session.user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    return NextResponse.json(await unbindSocialAccount(id, aid, session.user.id))
  } catch (error) {
    if (error instanceof SocialAccountBindingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('[account-unbind] Failed:', error)
    return NextResponse.json({ error: '解除绑定失败，请稍后重试。' }, { status: 500 })
  }
}
