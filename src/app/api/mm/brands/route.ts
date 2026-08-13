import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createMarketingCrew, addCrewMember } from '@/lib/user-management/crew'
import { ensureBrandWorkspace } from '@/lib/brandWorkspace'
import { resolveAssignment } from '@/lib/assignmentPool'
import { queueBrandGrowthSync, seedInitialBrandStores, syncBrandGrowthState } from '@/lib/brandGrowthSync'
import { provisionPostfastKeyForBrand } from '@/lib/postfastKeyPool'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, description, location, timezone, address, industry, region, referenceCode } = body
    const initialStores = Array.isArray(body.stores) ? body.stores : body.store && typeof body.store === 'object' ? [body.store] : []

    if (!name?.trim()) {
      return NextResponse.json({ error: '品牌名称为必填项' }, { status: 400 })
    }

    // 1. Create Brand record
    const brand = await prisma.$transaction(async (tx: any) => {
      const created = await tx.brand.create({
        data: {
        ownerId: session.user.id,
        name: name.trim(),
        description: description?.trim() || null,
        industry: typeof industry === 'string' ? industry.trim() || null : null,
        location: location?.trim() || null,
        timezone: timezone || 'Asia/Singapore',
        address: address?.trim() || null,
        status: 'ACTIVE',
        },
      })
      await seedInitialBrandStores(created.id, initialStores, tx)
      await queueBrandGrowthSync({
        brandId: created.id,
        dirtyPaths: ['*'],
        mode: 'BACKFILL',
        actor: { id: session.user.id, email: session.user.email, type: session.user.type, roles: session.user.role ? [session.user.role] : [] },
        tx,
      })
      return created
    })

    syncBrandGrowthState(brand.id).catch(growthError => {
      console.error('[MM-API-Brand-Create] Growth snapshot deferred:', growthError)
    })

    try {
      const keyResult = await provisionPostfastKeyForBrand({
        brandId: brand.id,
        userId: session.user.id,
      })
      if (!keyResult.ok) {
        console.warn('[MM-API-Brand-Create] PostFast key auto-allocation skipped:', keyResult.reason)
      }
    } catch (postfastKeyError) {
      console.error('[MM-API-Brand-Create] PostFast key auto-allocation failed (non-fatal):', postfastKeyError)
    }

    try {
      // 2. Initialize new Marketing Crew
      const crew = await createMarketingCrew(brand.id)
      await addCrewMember(crew.id, session.user.id, 'OWNER')

      // 3. Backward compatibility mappings
      await prisma.brandOwner.upsert({
        where: { brandId_userId: { brandId: brand.id, userId: session.user.id } },
        create: { brandId: brand.id, userId: session.user.id, role: 'owner' },
        update: { role: 'owner' },
      })

      await prisma.userBusinessRole.upsert({
        where: { userId_role: { userId: session.user.id, role: 'BRAND_OWNER' } },
        create: { userId: session.user.id, role: 'BRAND_OWNER' },
        update: {},
      })
    } catch (syncError) {
      console.error('[MM-API-Brand-Create] Mappings setup failed (non-fatal):', syncError)
    }

    // 4. Initialize workspace
    try {
      await ensureBrandWorkspace(brand.id)
    } catch (workspaceError) {
      console.error('[MM-API-Brand-Create] Workspace init failed:', workspaceError)
    }

    // 5. Run AI Assignment matching in background (asynchronously)
    resolveAssignment({
      subjectType: 'brand_create',
      subjectId: brand.id,
      industry: typeof industry === 'string' ? industry : null,
      region: typeof region === 'string' ? region : (typeof location === 'string' ? location : null),
      referenceCode: typeof referenceCode === 'string' ? referenceCode : null,
      createdBy: 'system',
    }).then(result => {
      console.log('[MM-API-Brand-Create] Background resolve assignment succeeded:', result.selectedAgentId)
    }).catch(assignmentError => {
      console.error('[MM-API-Brand-Create] Background resolve assignment failed:', assignmentError)
    })

    return NextResponse.json({
      success: true,
      brand,
      assignment: null,
    }, { status: 201 })

  } catch (err: any) {
    console.error('[MM-API-Brand-Create] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
