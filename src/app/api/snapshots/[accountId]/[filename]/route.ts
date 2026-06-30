import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

type Params = { params: Promise<{ accountId: string; filename: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { accountId, filename } = await params
    
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
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    return new NextResponse('Snapshot not found', { status: 404 })
  }
}
