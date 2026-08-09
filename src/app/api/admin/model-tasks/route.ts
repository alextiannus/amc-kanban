import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAmcOperator } from '@/lib/amcOperator'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const content = await fetchContentTasks()
  return NextResponse.json({
    items: content.items || [],
    services: { amcContent: content.status, amcKanban: 'publishing_only' },
  })
}

async function fetchContentTasks(): Promise<{ status: string; items?: any[] }> {
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()
  if (!baseUrl || !token) return { status: 'not_configured', items: [] }
  try {
    const response = await fetch(`${baseUrl}/v1/lab/model-tasks`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return { status: `error_${response.status}`, items: [] }
    const data = await response.json()
    return { status: 'available', items: Array.isArray(data?.items) ? data.items : [] }
  } catch {
    return { status: 'unavailable', items: [] }
  }
}
