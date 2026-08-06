import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getBusinessDate, normalizeExperienceInput } from '@/lib/gameShareDrafts'

function parseExperienceTags(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string') return []
  try {
    return JSON.parse(value)
  } catch {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  }
}

function submissionResponse(submission: {
  id: string
  status: string
  pointsAwarded: number
  aiReason: string | null
}, pointsBalance: number, alreadySubmitted: boolean, status = 201) {
  return NextResponse.json({
    submissionId: submission.id,
    status: submission.status,
    pointsAwarded: submission.pointsAwarded,
    pointsBalance,
    aiReason: submission.aiReason,
    alreadySubmitted,
  }, { status })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const brandId = formData.get('brandId') as string
    const sessionId = formData.get('sessionId') as string
    const requestedTaskType = formData.get('taskType') as string
    const reviewPlatform = formData.get('reviewPlatform') as string | null

    if (!brandId || !sessionId || !requestedTaskType) {
      return NextResponse.json({ error: 'brandId, sessionId, and taskType are required' }, { status: 400 })
    }

    if (!['EXPERIENCE_FEEDBACK', 'REVIEW_SUBMIT'].includes(requestedTaskType)) {
      return NextResponse.json({ error: 'This activity supports staff-confirmed experience feedback only.' }, { status: 400 })
    }

    const isLegacySubmission = requestedTaskType === 'REVIEW_SUBMIT'
    const normalized = isLegacySubmission
      ? { experienceTags: [], experienceNote: null as string | null }
      : normalizeExperienceInput({
          locale: 'en',
          experienceTags: parseExperienceTags(formData.get('experienceTags')),
          experienceNote: formData.get('experienceNote'),
        })
    if ('error' in normalized && normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        id: true,
        timezone: true,
        gameConfig: { select: { taskReviewEnabled: true } },
      },
    })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }
    if (!brand.gameConfig || brand.gameConfig.taskReviewEnabled === false) {
      return NextResponse.json({ error: 'Experience feedback is unavailable for this activity.' }, { status: 409 })
    }

    let session = await prisma.gameSession.findUnique({
      where: { brandId_sessionId: { brandId, sessionId } },
    })
    if (!session) {
      session = await prisma.gameSession.create({
        data: { brandId, sessionId, pointsBalance: 0 },
      })
    }

    const taskType = 'EXPERIENCE_FEEDBACK'
    const rewardDate = getBusinessDate(brand.timezone)
    const existing = await prisma.customerTaskSubmission.findUnique({
      where: { sessionId_taskType_rewardDate: { sessionId: session.id, taskType, rewardDate } },
    })
    if (existing) return submissionResponse(existing, session.pointsBalance, true, 200)

    const aiReason = 'Pending staff PIN confirmation for genuine visit feedback.'
    try {
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
          reviewPlatform: isLegacySubmission ? reviewPlatform : null,
          reviewTimeRaw: null,
          aiReason,
          experienceTags: normalized.experienceTags,
          experienceNote: normalized.experienceNote,
          rewardDate,
          reviewedAt: null,
        },
      })
      return submissionResponse(submission, session.pointsBalance, false)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await prisma.customerTaskSubmission.findUnique({
          where: { sessionId_taskType_rewardDate: { sessionId: session.id, taskType, rewardDate } },
        })
        if (raced) return submissionResponse(raced, session.pointsBalance, true, 200)
      }
      throw error
    }
  } catch (e: unknown) {
    console.error('[POST /api/game/tasks]', e)
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
