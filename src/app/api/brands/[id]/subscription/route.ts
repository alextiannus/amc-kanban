import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'
import { POST as humanPost } from '../../../subscription/route'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { id: brandId } = await params

  let userId: string
  let userType: string
  let userRole: string

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type ?? 'HUMAN'
    userRole = session.user.role
  } else {
    userId = authenticatedAgent!.id
    userType = 'AI_AGENT'
    userRole = 'USER'
  }

  const ok = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const subscription = await prisma.brandSubscription.findFirst({
    where: {
      brandId,
      status: 'ACTIVE',
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!subscription) {
    return NextResponse.json({
      plan_name: 'NONE',
      included_services: [],
      monthly_content_quota: 0,
      platform_coverage: [],
      reply_sla: 'none',
      ad_management: false,
      kol_management: false,
      autopilot_eligible: false,
      status: 'EXPIRED'
    })
  }

  const planId = subscription.planId
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId)
  const included_services = plan?.services ?? []
  const monthly_content_quota = planId === 'starter' ? 30 : planId === 'essential' ? 28 : 38
  
  let platform_coverage: string[] = []
  if (planId === 'starter') platform_coverage = ['Instagram', 'Facebook', 'TikTok']
  else if (planId === 'essential') platform_coverage = ['Instagram', 'Facebook', 'TikTok', 'Xiaohongshu', 'Dianping']
  else if (planId === 'advanced') platform_coverage = ['Instagram', 'Facebook', 'TikTok', 'Xiaohongshu', 'Dianping', 'WhatsApp', 'WeChat', 'Ads']

  return NextResponse.json({
    plan_name: plan?.name || subscription.planName,
    included_services,
    monthly_content_quota,
    platform_coverage,
    reply_sla: planId === 'starter' ? 'none' : '24h',
    ad_management: planId === 'advanced',
    kol_management: planId !== 'starter',
    autopilot_eligible: true,
    contract_start: subscription.contractStartDate?.toISOString() ?? null,
    contract_end: subscription.contractEndDate?.toISOString() ?? null,
    status: subscription.status
  })
}

export { humanPost as POST }
