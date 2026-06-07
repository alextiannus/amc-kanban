import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { submissionId, pinCode } = body

    if (!submissionId || !pinCode) {
      return NextResponse.json({ error: 'submissionId and pinCode required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch the submission
      const submission = await tx.customerTaskSubmission.findUnique({
        where: { id: submissionId },
        include: { session: true },
      })
      if (!submission) {
        throw new Error('Task submission not found')
      }

      if (submission.status === 'APPROVED') {
        throw new Error('This submission has already been approved and points awarded.')
      }

      // 2. Fetch the game config to verify the PIN
      const config = await tx.gameConfig.findUnique({
        where: { brandId: submission.brandId },
      })
      if (!config) {
        throw new Error('Game configuration not found')
      }

      if (config.clerkPin !== pinCode) {
        throw new Error('Incorrect staff PIN code. Please try again.')
      }

      // 3. Update submission status to APPROVED and mark as manually overridden
      const updatedSubmission = await tx.customerTaskSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'APPROVED',
          isManualOverride: true,
          pointsAwarded: 5,
          reviewedAt: new Date(),
        },
      })

      // 4. Grant 5 points to the customer's session balance
      const updatedSession = await tx.gameSession.update({
        where: { id: submission.session.id },
        data: {
          pointsBalance: { increment: 5 },
        },
      })

      return {
        success: true,
        pointsBalance: updatedSession.pointsBalance,
        status: updatedSubmission.status,
      }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    console.error('[POST /api/game/tasks/override]', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
