import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getHuaweiObsConfig, uploadHuaweiObsObject } from '@/lib/integrations/huaweiObs'
import fs from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify permission (Admin, Brand Owner, Brand Director, AMC Principal)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { businessRoles: true },
    })
    const isOwnerOrAdmin =
      user?.role === 'ADMIN' ||
      user?.businessRoles.some(
        (r: any) =>
          r.role === 'BRAND_OWNER' ||
          r.role === 'BRAND_DIRECTOR' ||
          r.role === 'AMC_PRINCIPAL'
      )

    if (!isOwnerOrAdmin) {
      return NextResponse.json({ error: 'Unauthorized: insufficient permissions' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const accountId = formData.get('accountId') as string | null

    if (!file || !accountId) {
      return NextResponse.json({ error: 'Missing file or accountId' }, { status: 400 })
    }

    // Verify account exists
    const account = await prisma.socialAccount.findUnique({
      where: { id: accountId },
    })
    if (!account) {
      return NextResponse.json({ error: 'Social account not found' }, { status: 404 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Determine extension, default to .png
    let ext = '.png'
    if (file.name) {
      const parsed = path.parse(file.name)
      if (parsed.ext) {
        ext = parsed.ext.toLowerCase()
      }
    }

    let imageUrl = ''
    const obsConfig = getHuaweiObsConfig()
    console.log('[Upload Snapshot] Resolving storage backend. OBS Config:', obsConfig ? {
      bucket: obsConfig.bucket,
      endpoint: obsConfig.endpoint,
      region: obsConfig.region,
      publicBaseUrl: obsConfig.publicBaseUrl,
      hasAccessKey: !!obsConfig.accessKeyId,
      hasSecretKey: !!obsConfig.secretAccessKey,
    } : 'null (Falling back to local storage)')

    if (obsConfig) {
      const obsKey = `snapshots/${accountId}/${Date.now()}-uploaded${ext}`
      console.log('[Upload Snapshot] Uploading to Huawei OBS with key:', obsKey)
      const uploadResult = await uploadHuaweiObsObject({
        key: obsKey,
        body: buffer,
        contentType: file.type || 'image/png'
      })
      if (!uploadResult.ok) {
        console.error('[Upload Snapshot] Huawei OBS Upload failed:', uploadResult.error)
        return NextResponse.json({ 
          error: `Huawei OBS upload failed: ${uploadResult.error}`,
          debug: {
            bucket: obsConfig.bucket,
            endpoint: obsConfig.endpoint,
            error: uploadResult.error,
          }
        }, { status: 400 })
      }
      imageUrl = uploadResult.url
      console.log('[Upload Snapshot] Huawei OBS Upload succeeded. URL:', imageUrl)
    } else {
      // Local fallback for local development without OSS credentials
      const uploadDir = path.join(process.cwd(), 'public/snapshots', accountId)
      console.log('[Upload Snapshot] Local storage fallback path:', uploadDir)
      try {
        await fs.access(uploadDir)
      } catch {
        await fs.mkdir(uploadDir, { recursive: true })
      }
      const fileName = `${Date.now()}-uploaded${ext}`
      const filePath = path.join(uploadDir, fileName)
      await fs.writeFile(filePath, buffer)
      imageUrl = `/snapshots/${accountId}/${fileName}`
      console.log('[Upload Snapshot] Local write succeeded. URL:', imageUrl)
    }

    // Insert into DB
    await prisma.$transaction([
      prisma.socialAccount.update({
        where: { id: accountId },
        data: { snapshotAt: new Date() },
      }),
      prisma.socialAccountSnapshot.create({
        data: {
          accountId,
          imageUrl,
          capturedAt: new Date(),
          isUserUploaded: true,
          isReal: true,
        },
      }),
    ])

    return NextResponse.json({ success: true, imageUrl })
  } catch (error) {
    console.error('[Upload Snapshot] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
