import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { registerExtension, unregisterExtension } from '@/lib/integrations/extensionBridge'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  // 1. Authenticate caller (session or api key)
  const session = await getSession()
  let userId: string
  let userType: string
  let userRole: string | undefined

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type
    userRole = session.user.role
  } else {
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const agent = await getAgentFromApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = agent.id
    userType = agent.type
    userRole = 'USER'
  }

  // 2. Check brand access permission
  const hasAccess = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Setup ReadableStream for Server-Sent Events (SSE)
  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat to confirm setup
      controller.enqueue('data: {"status": "connected"}\n\n')

      // Register the active controller
      registerExtension(brandId, controller)

      // Keep connection alive with 30s heartbeats
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(': heartbeat\n\n')
        } catch (e) {
          clearInterval(heartbeat)
        }
      }, 30000)

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unregisterExtension(brandId)
        try {
          controller.close()
        } catch (e) {
          // Ignored
        }
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
