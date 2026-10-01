import { serveOverview } from '@/lib/access-overview/server'
import { authenticateCurrentRequest } from '@/lib/auth-v2/authenticate'

export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return serveOverview(authenticateCurrentRequest, id, new URL(request.url).searchParams.get('brandId')?.trim() || undefined)
}
