import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'AVATAR_PROMPT_GUIDE.md')
    const content = await readFile(filePath, 'utf-8')
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error serving avatar guide endpoint:', error)
    return NextResponse.json({ error: 'Failed to load avatar guide' }, { status: 500 })
  }
}
