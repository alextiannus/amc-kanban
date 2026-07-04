import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { authenticateRequest, requireCapability } from '@/lib/auth-v2'

type Params = { params: Promise<{ accountId: string; filename: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { accountId, filename } = await params
    if (path.basename(accountId) !== accountId || path.basename(filename) !== filename) {
      return new NextResponse('Snapshot not found', { status: 404 })
    }

    const principal = await authenticateRequest(request)
    if (!principal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const account = await prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { brandId: true },
    })
    if (!account) return new NextResponse('Snapshot not found', { status: 404 })
    try {
      await requireCapability(principal, 'brand.read', { brandId: account.brandId })
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Clean and validate filename to prevent path traversal
    const safeFilename = path.basename(filename)
    const filePath = path.join(process.cwd(), 'public/snapshots', accountId, safeFilename)
    
    console.log('[Local Snapshot Serv] Reading file from disk path:', filePath)
    const buffer = await fs.readFile(filePath)
    console.log('[Local Snapshot Serv] File read successfully. Size:', buffer.length)
    
    // Determine mime type
    let contentType = 'image/png'
    if (safeFilename.endsWith('.jpg') || safeFilename.endsWith('.jpeg')) {
      contentType = 'image/jpeg'
    } else if (safeFilename.endsWith('.webp')) {
      contentType = 'image/webp'
    } else if (safeFilename.endsWith('.gif')) {
      contentType = 'image/gif'
    }
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    return new NextResponse('Snapshot not found', { status: 404 })
  }
}
