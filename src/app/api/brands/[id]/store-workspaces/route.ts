import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject, canWriteBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

const publicWorkspace = {
  id: true, name: true, storeName: true, workspaceKind: true, parentBrandId: true,
  status: true, address: true, location: true, phone: true, timezone: true,
  autoPilot: true, createdAt: true, updatedAt: true,
  _count: { select: { accounts: { where: { unboundAt: null } }, assets: true, contents: true, tasks: true } },
} as const

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const flag = (value: unknown, fallback = false) => typeof value === 'boolean' ? value : fallback

async function rootIdFor(id: string) {
  const brand = await prisma.brand.findUnique({ where: { id }, select: { id: true, parentBrandId: true } })
  return brand?.parentBrandId || brand?.id || null
}

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!(await canHumanAccessBrandProject(id, session.user.id, session.user.role))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const rootId = await rootIdFor(id)
  if (!rootId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const workspaces = await prisma.brand.findMany({
    where: { OR: [{ id: rootId }, { parentBrandId: rootId }] },
    select: publicWorkspace,
    orderBy: [{ createdAt: 'asc' }],
  })
  const visible = []
  for (const workspace of workspaces) {
    if (await canHumanAccessBrandProject(workspace.id, session.user.id, session.user.role)) visible.push(workspace)
  }
  return NextResponse.json({ rootBrandId: rootId, currentBrandId: id, workspaces: visible }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rootId = await rootIdFor(id)
  if (!rootId || !(await canWriteBrandProject(rootId, session.user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const storeName = text(body.storeName)
  const address = text(body.address)
  if (!storeName) return NextResponse.json({ error: 'storeName is required' }, { status: 400 })
  if (!address) return NextResponse.json({ error: 'address is required' }, { status: 400 })

  const sourceId = text(body.sourceBrandId) || id
  if (!(await canWriteBrandProject(sourceId, session.user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const source = await prisma.brand.findUnique({
    where: { id: sourceId },
    include: {
      owners: true,
      crew: { include: { members: true } },
      knowledge: true,
      accounts: { where: { unboundAt: null } },
      brandPlanInterviews: true,
      growthResearchSnapshots: true,
      marketingSolutions: true,
    },
  })
  if (!source || (source.parentBrandId || source.id) !== rootId) return NextResponse.json({ error: 'Source workspace is outside this brand family' }, { status: 400 })

  const baseName = text(body.brandName) || source.name.replace(/\s*[（(][^）)]*[）)]\s*$/, '') || source.name
  const displayName = `${baseName}（${storeName}）`
  const copyBrandProfile = flag(body.copyBrandProfile, true)
  const copyStrategy = flag(body.copyStrategy, true)
  const copySocialAccounts = flag(body.copySocialAccounts, false)
  const phone = text(body.phone) || null
  const location = text(body.location) || null
  const businessHours = text(body.businessHours) || null

  const created = await prisma.$transaction(async (tx: any) => {
    const brand = await tx.brand.create({ data: {
      parentBrandId: rootId, workspaceKind: 'STORE', storeName, name: displayName,
      ownerId: source.ownerId, description: copyBrandProfile ? source.description : null,
      industry: copyBrandProfile ? source.industry : null, logoUrl: copyBrandProfile ? source.logoUrl : null,
      website: copyBrandProfile ? source.website : null, timezone: source.timezone,
      address, phone, location, autoPilot: false, status: 'ACTIVE',
    } })
    if (source.owners.length) await tx.brandOwner.createMany({ data: source.owners.map((owner: any) => ({ brandId: brand.id, userId: owner.userId, role: owner.role })), skipDuplicates: true })
    if (source.crew) {
      const crew = await tx.marketingCrew.create({ data: { brandId: brand.id } })
      if (source.crew.members.length) await tx.crewMember.createMany({ data: source.crew.members.map((member: any) => ({ crewId: crew.id, userId: member.userId, role: member.role, active: member.active, source: 'DIRECT' })), skipDuplicates: true })
    }
    if (copyBrandProfile && source.knowledge) {
      const { id: _id, brandId: _brandId, createdAt: _createdAt, updatedAt: _updatedAt, ...knowledge } = source.knowledge as any
      await tx.brandKnowledge.create({ data: { ...knowledge, brandId: brand.id, businessHours, stores: [{ storeId: brand.id, name: storeName, address, phone, businessHours }] } })
    } else {
      await tx.brandKnowledge.create({ data: { brandId: brand.id, businessHours, stores: [{ storeId: brand.id, name: storeName, address, phone, businessHours }] } })
    }
    if (copySocialAccounts && source.accounts.length) {
      await tx.socialAccount.createMany({ data: source.accounts.map((account: any) => ({
        brandId: brand.id, platformId: account.platformId, postfastAccountId: account.postfastAccountId,
        handle: account.handle, displayName: account.displayName, accessToken: account.accessToken,
        refreshToken: account.refreshToken, expiresAt: account.expiresAt, autoPilot: false,
        profileUrl: account.profileUrl, loginUsername: account.loginUsername, loginPassword: account.loginPassword,
        followerCount: account.followerCount, followerDelta: account.followerDelta, ratingScore: account.ratingScore,
        snapshotAt: account.snapshotAt, connectionStatus: account.connectionStatus,
        disabledReason: account.disabledReason, inboxCapable: account.inboxCapable,
        followerCountUpdatedAt: account.followerCountUpdatedAt,
      })), skipDuplicates: true })
    }
    if (copyStrategy) {
      if (source.brandPlanInterviews.length) await tx.brandPlanInterview.createMany({ data: source.brandPlanInterviews.map((item: any) => ({ brandId: brand.id, rawNotes: item.rawNotes, answers: item.answers, summary: item.summary, completedAt: item.completedAt })) })
      const snapshotIds = new Map<string, string>()
      for (const item of source.growthResearchSnapshots as any[]) {
        const snapshot = await tx.brandGrowthResearchSnapshot.create({ data: { brandId: brand.id, source: item.source, sourceVersion: item.sourceVersion, sourcePayload: item.sourcePayload, report: item.report, dataHash: item.dataHash, generatedAt: item.generatedAt } })
        snapshotIds.set(item.id, snapshot.id)
      }
      if (source.marketingSolutions.length) await tx.brandMarketingSolution.createMany({ data: source.marketingSolutions.map((item: any) => ({ brandId: brand.id, kind: item.kind, period: item.period, status: item.status, version: item.version, input: item.input, output: item.output, generationMode: item.generationMode, llmProvider: item.llmProvider, llmModel: item.llmModel, llmError: item.llmError, researchSnapshotId: item.researchSnapshotId ? snapshotIds.get(item.researchSnapshotId) || null : null, createdById: item.createdById, generatedAt: item.generatedAt })) })
    }
    await tx.auditLog.create({ data: { actorId: session.user.id, actorType: 'HUMAN', actorName: session.user.email || null, action: 'STORE_WORKSPACE_CREATED', resourceId: brand.id, resourceType: 'Brand', newValue: { rootBrandId: rootId, sourceBrandId: source.id, storeName, displayName, copyBrandProfile, copyStrategy, copySocialAccounts }, metadata: { brandId: brand.id, rootBrandId: rootId } } })
    return brand
  })
  return NextResponse.json(created, { status: 201 })
}
