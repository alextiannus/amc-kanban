import { serveOverview } from '@/lib/access-overview/server'
import { authenticateCurrentRequest } from '@/lib/auth-v2/authenticate'

export const dynamic = 'force-dynamic'
export async function GET() { return serveOverview(authenticateCurrentRequest) }
