import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(request: Request) {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'AGENT_CONNECTIVITY.md')
    const content = await readFile(filePath, 'utf-8')
    const shouldDownload = new URL(request.url).searchParams.get('download') === '1'
    const headers: Record<string, string> = {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    }
    if (shouldDownload) {
      headers['Content-Disposition'] = 'attachment; filename="AGENT_CONNECTIVITY.md"'
    }

    return new NextResponse(content, {
      headers,
    })
  } catch (error) {
    console.error('Error serving SOP endpoint:', error)
    return NextResponse.json({ error: 'Failed to load SOP specification' }, { status: 500 })
  }
}
