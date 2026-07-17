import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { fetchRemoteContentCatalog } from '@/lib/amc-content/remoteContentService'

export const maxDuration = 30

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id }
  if (session?.user) return { id: session.user.id }
  return null
}

export async function GET(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const creatorType = url.searchParams.get('creatorType')?.trim()
    const catalog: any = await fetchRemoteContentCatalog()
    const presets = Array.isArray(catalog?.videoScriptPresets)
      ? catalog.videoScriptPresets.filter((preset: any) => !creatorType || preset.creatorType === creatorType)
      : []
    return NextResponse.json({ success: true, presets })
  } catch (err: any) {
    console.error('[VideoPresets] failed:', err)
    return NextResponse.json({ error: err.message || 'Video presets failed' }, { status: 500 })
  }
}
