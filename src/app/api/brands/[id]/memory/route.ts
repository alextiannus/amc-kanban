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
    userType = 'AI_AGENT'
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
    const { date, content } = await request.json()

    if (!date || content === undefined) {
      return NextResponse.json({ error: 'Missing required fields: date, content' }, { status: 400 })
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Date must be in YYYY-MM-DD format' }, { status: 400 })
    }

    const brandSlug = getBrandSlug(brand)
    const relativeDir = path.join('memory', brandSlug)
    const absoluteDir = path.join(process.cwd(), relativeDir)

    await fs.mkdir(absoluteDir, { recursive: true })
    const filePath = path.join(absoluteDir, `${date}.md`)
    await fs.writeFile(filePath, content, 'utf8')

    return NextResponse.json({
      success: true,
      date,
      path: path.join('memory', brandSlug, `${date}.md`)
    })
  } catch (error: any) {
    console.error('Error writing memory:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request: Request, { params }: Params) {
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
    userType = 'AI_AGENT'
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

  const brandSlug = getBrandSlug(brand)
  const relativeDir = path.join('memory', brandSlug)
  const absoluteDir = path.join(process.cwd(), relativeDir)

  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')
  const daysParam = searchParams.get('days')

  try {
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json({ error: 'Date must be in YYYY-MM-DD format' }, { status: 400 })
      }

      const filePath = path.join(absoluteDir, `${dateParam}.md`)
      try {
        const content = await fs.readFile(filePath, 'utf8')
        return NextResponse.json({ date: dateParam, content })
      } catch {
        return NextResponse.json({ error: 'Memory for specified date not found' }, { status: 404 })
      }
    }

    const limit = daysParam ? parseInt(daysParam, 10) : 3
    if (isNaN(limit) || limit <= 0) {
      return NextResponse.json({ error: 'Days must be a positive integer' }, { status: 400 })
    }

    let files: string[] = []
    try {
      files = await fs.readdir(absoluteDir)
    } catch {
      // Directory doesn't exist, return empty
      return NextResponse.json([])
    }

    // Filter files matching YYYY-MM-DD.md
    const memoryFiles = files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort((a, b) => b.localeCompare(a)) // sort descending (most recent first)
      .slice(0, limit)

    const memories = await Promise.all(
      memoryFiles.map(async (f) => {
        const date = f.replace('.md', '')
        const content = await fs.readFile(path.join(absoluteDir, f), 'utf8')
        return { date, content }
      })
    )

    return NextResponse.json(memories)
  } catch (error: any) {
    console.error('Error reading memory:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
