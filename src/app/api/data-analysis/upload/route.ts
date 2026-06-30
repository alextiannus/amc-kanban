import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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

    // Save under public/snapshots/${accountId}/
    const uploadDir = path.join(process.cwd(), 'public/snapshots', accountId)
    try {
      await fs.access(uploadDir)
    } catch {
      await fs.mkdir(uploadDir, { recursive: true })
    }

    // Determine extension, default to .png
    let ext = '.png'
    if (file.name) {
      const parsed = path.parse(file.name)
      if (parsed.ext) {
        ext = parsed.ext.toLowerCase()
      }
    }

    const fileName = `${Date.now()}-uploaded${ext}`
    const filePath = path.join(uploadDir, fileName)
    await fs.writeFile(filePath, buffer)

    const imageUrl = `/snapshots/${accountId}/${fileName}`

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
