import { getSession } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat to establish connection
      controller.enqueue('data: connected\\n\\n')

      const handleUpdate = () => {
        controller.enqueue('data: update\\n\\n')
      }

      eventEmitter.on('board_update', handleUpdate)

      // Send a heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(': heartbeat\\n\\n')
      }, 30000)

      request.signal.addEventListener('abort', () => {
        eventEmitter.off('board_update', handleUpdate)
        clearInterval(heartbeat)
        controller.close()
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
