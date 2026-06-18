import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { readFile } from 'fs/promises'
import path from 'path'

async function checkAuth(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  if (apiKey && !authenticatedAgent) {
    return { ok: false, status: 401, error: 'Invalid API key' }
  }

  return { ok: true, user: session?.user || authenticatedAgent }
}

export async function GET() {
  try {
    // 1. Delete legacy course/case/calendar items to cleanly transition
    await prisma.schoolItem.deleteMany({
      where: {
        type: { in: ['COURSE', 'CASE', 'CALENDAR'] }
      }
    })

    let count = await prisma.schoolItem.count()
    if (count === 0) {
      try {
        const filePath = path.join(process.cwd(), 'docs', 'Instagram社交媒体运营快速掌握指南.md')
        const md = await readFile(filePath, 'utf-8')
        
        await prisma.schoolItem.create({
          data: {
            type: 'ARTICLE',
            title: 'Instagram 社交媒体运营快速掌握指南',
            desc: '用一篇指南快速建立 2026 年 Instagram 运营的完整认知，能独立诊断账号问题并制定运营节奏。',
            markdown: md
          }
        })
      } catch (err) {
        console.error('Failed to seed default article:', err)
      }
    }

    const items = await prisma.schoolItem.findMany({
      include: {
        author: {
          select: {
            id: true,
            email: true,
            nickname: true,
            type: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('[GET /api/learn/school]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await checkAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { type, title, desc, duration, level, date, event, tip, markdown, authorId } = body
    if (!type) {
      return NextResponse.json({ error: 'Missing required field: type (COURSE | CASE | CALENDAR | ARTICLE)' }, { status: 400 })
    }

    if (!['COURSE', 'CASE', 'CALENDAR', 'ARTICLE'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type. Must be COURSE, CASE, CALENDAR, or ARTICLE' }, { status: 400 })
    }

    let resolvedAuthorId = authorId || null
    if (!resolvedAuthorId && auth.user) {
      resolvedAuthorId = auth.user.id
    }

    const newItem = await prisma.schoolItem.create({
      data: {
        type,
        title: title || null,
        desc: desc || null,
        duration: duration || null,
        level: level || null,
        date: date || null,
        event: event || null,
        tip: tip || null,
        markdown: markdown || null,
        authorId: resolvedAuthorId
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            nickname: true,
            type: true,
          }
        }
      }
    })
    return NextResponse.json(newItem, { status: 201 })
  } catch (error) {
    console.error('[POST /api/learn/school]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await checkAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id')

    if (!id) {
      // fallback to reading from body
      try {
        const body = await request.json()
        id = body?.id
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 })
    }

    const item = await prisma.schoolItem.findUnique({
      where: { id }
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const isAdmin = auth.user?.role === 'ADMIN'
    const isAuthor = item.authorId && item.authorId === auth.user?.id

    if (!isAdmin && !isAuthor) {
      return NextResponse.json({ error: 'Forbidden: Only the author or an admin can delete this article' }, { status: 403 })
    }

    await prisma.schoolItem.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/learn/school]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
