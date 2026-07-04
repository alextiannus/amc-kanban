import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { makeBrandAssetKey, uploadHuaweiObsObject } from '@/lib/integrations/huaweiObs'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

const MAX_LOGO_BYTES = 5 * 1024 * 1024

// POST /api/brands/[id]/logo — upload and assign a brand logo
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId } = await params
  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Logo must be an image' }, { status: 400 })
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'Logo must be 5 MB or smaller' }, { status: 400 })
  }

  const key = makeBrandAssetKey({
    brandId,
    folder: '品牌资料',
    filename: file.name || 'logo',
  })
  const upload = await uploadHuaweiObsObject({
    key,
    body: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
  })
  if (!upload.ok) {
    return NextResponse.json(
      { error: upload.error || 'Logo upload failed' },
      { status: upload.skipped ? 503 : 502 },
    )
  }

  const brand = await prisma.brand.update({
    where: { id: brandId },
    data: { logoUrl: upload.url },
    select: { id: true, logoUrl: true },
  })

  return NextResponse.json({ ok: true, logoUrl: brand.logoUrl })
}
