import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ brandId: string; key: string[] }> }

export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { brandId, key } = await params
  if (!brandId || !key || key.length === 0) {
    return NextResponse.json({ error: 'brandId and key path are required' }, { status: 400 })
  }

  // 1. Verify authorization
  const isAuthorized = await canSessionAccessBrandProject(
    brandId,
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role
  )

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Perform redirect to the public PostFast S3 bucket
  const s3Key = key.join('/')
  const s3Url = `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${s3Key}`

  return NextResponse.redirect(s3Url, { status: 307 })
}
