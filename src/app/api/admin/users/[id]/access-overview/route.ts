import { serveOverview } from '@/lib/access-overview/server'
import { authenticateCurrentSession } from '@/lib/auth-v2/authenticate'

export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return serveOverview(authenticateCurrentSession, id, new URL(request.url).searchParams.get('brandId')?.trim() || undefined)
}
