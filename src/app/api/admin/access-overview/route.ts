import { serveOverview } from '@/lib/access-overview/server'
import { authenticateCurrentSession } from '@/lib/auth-v2/authenticate'

export const dynamic = 'force-dynamic'
export async function GET() { return serveOverview(authenticateCurrentSession) }
