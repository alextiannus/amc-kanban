import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToLarkDrive } from '@/lib/integrations/lark'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/integrations/lark/upload?brandId=<id>
 * Upload a file to Lark Drive and create a MediaAsset record.
 * Accepts multipart/form-data with a `file` field.
 */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brandId = (await params).id
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, ownerId: session.user.id },
    select: { larkAppId: true, larkAppSecret: true, larkDriveFolderId: true },
  })

  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!brand.larkAppId || !brand.larkAppSecret) {
    return NextResponse.json({ error: 'Lark not configured — add App ID and Secret in Settings' }, { status: 422 })
  }
  if (!brand.larkDriveFolderId) {
    return NextResponse.json({ error: 'Lark Drive folder not configured' }, { status: 422 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const result = await uploadToLarkDrive({
    appId: brand.larkAppId,
    appSecret: brand.larkAppSecret,
    folderId: brand.larkDriveFolderId,
    filename: file.name,
    mimeType: file.type,
    fileBuffer: buffer,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // Create MediaAsset record
  const asset = await prisma.mediaAsset.create({
    data: {
      brandId,
      url: result.fileToken!,          // Store Lark file token as URL
      filename: file.name,
      mimeType: file.type,
      sizeBytes: buffer.length,
      uploadedBy: session.user.id,
      sourceType: 'upload',
    },
  })

  return NextResponse.json({
    assetId: asset.id,
    fileToken: result.fileToken,
    downloadUrl: result.downloadUrl,
  }, { status: 201 })
}
