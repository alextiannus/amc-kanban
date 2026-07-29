import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import {
  ensureGrowthMerchantForBrand,
  readGrowthMerchantData,
} from '@/lib/growthDataCenter'

type Params = { params: Promise<{ id: string }> }

/**
 * Compatibility endpoint for existing dashboard buttons.
 *
 * It now verifies/creates the stable Growth link and reads canonical data
 * directly. It intentionally does not copy Growth facts into Kanban Markdown.
 */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const { id } = await params

  if (session?.user) {
    if (!(await canOwnBrand(id, session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await canSessionAccessBrandProject(id, agent.id, 'AI_AGENT'))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const brand = await prisma.brand.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      description: true,
      growthBrandKey: true,
    },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  try {
    const growthBrandKey = await ensureGrowthMerchantForBrand(brand)
    const data = await readGrowthMerchantData(growthBrandKey)
    return NextResponse.json({
      ok: true,
      source: 'growth',
      copiedToKanban: false,
      merchantId: growthBrandKey,
      merchantName: data.profile?.canonical_name || brand.name,
      growthBrandKey,
      ...data,
    })
  } catch (error) {
    console.error('[sync-growth] canonical Growth read failed:', error)
    return NextResponse.json({
      error: 'Growth data center is temporarily unavailable',
    }, { status: 502 })
  }
}
