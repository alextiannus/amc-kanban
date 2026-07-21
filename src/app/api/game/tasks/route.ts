import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const brandId = formData.get('brandId') as string
    const sessionId = formData.get('sessionId') as string
    const taskType = formData.get('taskType') as string
    const reviewPlatform = formData.get('reviewPlatform') as string | null

    if (!brandId || !sessionId || !taskType) {
      return NextResponse.json({ error: 'brandId, sessionId, and taskType are required' }, { status: 400 })
    }

    if (taskType !== 'REVIEW_SUBMIT') {
      return NextResponse.json({ error: 'This activity now supports staff-confirmed publish tasks only.' }, { status: 400 })
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        id: true,
      },
    })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    let session = await prisma.gameSession.findUnique({
      where: { brandId_sessionId: { brandId, sessionId } },
    })
    if (!session) {
      session = await prisma.gameSession.create({
        data: { brandId, sessionId, pointsBalance: 0 },
      })
    }

    const aiReason = 'Pending staff PIN confirmation.'
    const submission = await prisma.customerTaskSubmission.create({
      data: {
        sessionId: session.id,
        brandId,
        taskType,
        status: 'PENDING',
        pointsAwarded: 0,
        images: [],
        imageMd5s: [],
        copyrightAgreed: false,
        reviewPlatform: reviewPlatform || 'GOOGLE',
        reviewTimeRaw: 'recent',
        aiReason,
        reviewedAt: null,
      },
    })

    return NextResponse.json({
      submissionId: submission.id,
      status: submission.status,
      pointsAwarded: 0,
      pointsBalance: session.pointsBalance,
      aiReason,
    }, { status: 201 })
  } catch (e: unknown) {
    console.error('[POST /api/game/tasks]', e)
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
