import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { getCustomTemplates, addCustomTemplate, CustomTemplateEntry } from '@/agents/knowledgeBase.ts'

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

export async function GET(request: Request) {
  const auth = await checkAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const templates = getCustomTemplates()
    return NextResponse.json({ success: true, templates })
  } catch (error) {
    console.error('[GET /api/learn/templates]', error)
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
    const { industry, platform, template, idea, videoScript, prompt } = body

    if (!industry || !platform) {
      return NextResponse.json({ error: 'Missing required fields: industry and platform are required' }, { status: 400 })
    }

    if (!template && !idea && !videoScript && !prompt) {
      return NextResponse.json({ error: 'At least one of template, idea, videoScript, or prompt must be provided' }, { status: 400 })
    }

    const entry: CustomTemplateEntry = {
      industry,
      platform,
      template,
      idea,
      videoScript,
      prompt
    }

    const success = addCustomTemplate(entry)
    if (!success) {
      return NextResponse.json({ error: 'Failed to write template to database' }, { status: 500 })
    }

    return NextResponse.json({ success: true, entry }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/learn/templates]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
