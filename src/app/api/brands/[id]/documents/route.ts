import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

function getBrandSlug(brand: { name: string; id: string }): string {
  return brand.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || brand.id
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { id: brandId } = await params

  let userId: string
  let userType: string
  let userRole: string

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type ?? 'HUMAN'
    userRole = session.user.role
  } else {
    userId = authenticatedAgent!.id
    userType = authenticatedAgent!.type ?? 'HUMAN'
    userRole = 'USER'
  }

  const ok = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  try {
    const { filename, docType, content } = await request.json()

    if (!filename || !docType || content === undefined) {
      return NextResponse.json({ error: 'Missing required fields: filename, docType, content' }, { status: 400 })
    }

    const brandSlug = getBrandSlug(brand)
    const relativeDir = path.join('documents', brandSlug, docType)
    const absoluteDir = path.join(process.cwd(), relativeDir)

    await fs.mkdir(absoluteDir, { recursive: true })
    const filePath = path.join(absoluteDir, filename)
    await fs.writeFile(filePath, content, 'utf8')

    // Document ID is the base64url encoded relative path
    const relativeFilePath = path.join(brandSlug, docType, filename)
    const docId = Buffer.from(relativeFilePath).toString('base64url')

    return NextResponse.json({
      success: true,
      docId,
      filename,
      docType,
      path: relativeFilePath
    })
  } catch (error: any) {
    console.error('Error saving document:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
