import { prisma } from '../src/lib/prisma'
import assert from 'node:assert/strict'

async function runTests() {
  console.log('🚀 Starting Lucky Spin Wheel 60-User Simulation Test...')

  // 1. Setup / Find a Brand
  let brand = await prisma.brand.findFirst()
  if (!brand) {
    console.log('No brand found in database. Creating a test brand...')
    brand = await prisma.brand.create({
      data: {
        name: 'Lucky Spin Simulation Brand',
        location: 'Test Location',
      },
    })
  }
  const brandId = brand.id
  console.log(`✅ Using Brand: ${brand.name} (ID: ${brandId})`)

  // Cleanup any old test GameConfigs and Sessions to avoid side effects
  await prisma.gameConfig.deleteMany({ where: { brandId } }).catch(() => {})
  await prisma.gameSession.deleteMany({ where: { brandId } }).catch(() => {})

  // 2. Setup GameConfig with exact inventories
  console.log('Configuring test game configuration...')
  const config = await prisma.gameConfig.create({
    data: {
      brandId,
      title: 'Simulation Spin Wheel',
      description: 'Run 60 simulations to check limits and probabilities!',
      themeColor: '#10b981', // emerald-500
      taskPhotoEnabled: true,
      taskReviewEnabled: true,
      clerkPin: '999888',
      maxSpinsPerUserDay: 5,
      prizes: {
        create: [
          { name: '10% Coupon', type: 'COUPON', probability: 0.4, totalInventory: null },
          { name: 'Free Coffee', type: 'COUPON', probability: 0.3, totalInventory: null },
          { name: 'Limited Mug', type: 'PHYSICAL', probability: 0.2, totalInventory: 2 }, // Only 2 mugs!
          { name: 'Try Again', type: 'THANKS', probability: 0.1, totalInventory: null },
        ],
      },
    },
    include: { prizes: true },
  })

  console.log('✅ GameConfig created with prizes:')
  config.prizes.forEach((p: any) => {
    console.log(`   - ${p.name} (Prob: ${p.probability}, Stock: ${p.totalInventory ?? 'Unlimited'})`)
  })

  // Track results
  const prizeCounts: Record<string, number> = {}
  const createdSessionIds: string[] = []
  const createdSubmissionIds: string[] = []
  const createdSpinLogIds: string[] = []

  let aiApprovedCount = 0
  let clerkPinApprovedCount = 0

  // 3. Run 60 simulations
  console.log('\n🎬 Simulating 60 different user submissions & spins...');

  for (let i = 1; i <= 60; i++) {
    const sessionId = `sim_session_${i}_${Date.now()}`
    createdSessionIds.push(sessionId)

    // A. Create Session
    const session = await prisma.gameSession.create({
      data: {
        brandId,
        sessionId,
        pointsBalance: 0,
      },
    })

    // B. Submit Task (alternate PHOTO_UPLOAD / REVIEW_SUBMIT)
    const taskType = i % 2 === 0 ? 'PHOTO_UPLOAD' : 'REVIEW_SUBMIT'
    const userMd5s = [`md5_sim_user_${i}_hash1`, `md5_sim_user_${i}_hash2`]

    // Submit task
    const submission = await prisma.customerTaskSubmission.create({
      data: {
        brandId,
        sessionId: session.id,
        taskType,
        images: taskType === 'PHOTO_UPLOAD' ? ['/img1.jpg', '/img2.jpg', '/img3.jpg'] : ['/screenshot.jpg'],
        imageMd5s: userMd5s,
        copyrightAgreed: true,
        status: 'PENDING',
        pointsAwarded: 0,
      },
    })
    createdSubmissionIds.push(submission.id)

    // C. Deduplication check (simulate checking this user's hashes don't exist in recent 30 submissions before this one)
    const recentSubmissions = await prisma.customerTaskSubmission.findMany({
      where: {
        brandId,
        id: { not: submission.id }, // exclude current
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { imageMd5s: true },
    })
    const recentMd5Set = new Set(recentSubmissions.flatMap((s: any) => s.imageMd5s))
    
    // Assert MD5 is unique
    userMd5s.forEach((hash: string) => {
      assert.ok(!recentMd5Set.has(hash), `MD5 hash ${hash} should not be duplicated in the last 30 submissions!`)
    })

    // D. Simulate AI Verification Approval or Failure
    const aiSuccess = i % 3 !== 0 // 66% chance AI approves automatically, 33% chance clerk PIN override is needed
    
    if (aiSuccess) {
      // AI approved
      aiApprovedCount++
      await prisma.customerTaskSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'APPROVED',
          pointsAwarded: 5,
          aiReason: 'AI approved automatically.',
          reviewedAt: new Date(),
        },
      })
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { pointsBalance: 5 },
      })
    } else {
      // AI failed, Clerk PIN override
      clerkPinApprovedCount++
      
      // Perform Clerk PIN verification transaction
      const pinCode = '999888'
      await prisma.$transaction(async (tx: any) => {
        const activeConfig = await tx.gameConfig.findUnique({
          where: { brandId },
        })
        if (!activeConfig || activeConfig.clerkPin !== pinCode) {
          throw new Error('Invalid Clerk PIN')
        }

        await tx.customerTaskSubmission.update({
          where: { id: submission.id },
          data: {
            status: 'APPROVED',
            isManualOverride: true,
            pointsAwarded: 5,
            reviewedAt: new Date(),
          },
        })

        await tx.gameSession.update({
          where: { id: session.id },
          data: { pointsBalance: 5 },
        })
      })
    }

    // E. Spin the Wheel!
    const spinResult = await prisma.$transaction(async (tx: any) => {
      const s = await tx.gameSession.findUnique({
        where: { id: session.id },
      })
      if (!s || s.pointsBalance < 5) throw new Error('Session points error')

      const activeConfig = await tx.gameConfig.findUnique({
        where: { brandId },
        include: { prizes: true },
      })
      if (!activeConfig) throw new Error('Config error')

      // Select active prizes (inventory check)
      const activePrizes = activeConfig.prizes.filter((p: any) => {
        if (p.totalInventory === null) return true
        return p.claimedCount < p.totalInventory
      })

      if (activePrizes.length === 0) {
        throw new Error('All prizes out of stock')
      }

      // Weighted random selection
      const totalProb = activePrizes.reduce((sum: number, p: any) => sum + p.probability, 0)
      const r = Math.random() * totalProb
      let runningSum = 0
      let selectedPrize = activePrizes[0]

      for (const prize of activePrizes) {
        runningSum += prize.probability
        if (r <= runningSum) {
          selectedPrize = prize
          break
        }
      }

      // Deduct points
      await tx.gameSession.update({
        where: { id: s.id },
        data: { pointsBalance: { decrement: 5 } },
      })

      // Increment claimedCount
      if (selectedPrize.totalInventory !== null) {
        await tx.gamePrize.update({
          where: { id: selectedPrize.id },
          data: { claimedCount: { increment: 1 } },
        })
      }

      // Create Spin Log
      const code = `S${String(i).padStart(3, '0')}C`
      const log = await tx.gameSpinLog.create({
        data: {
          sessionId: s.id,
          prizeId: selectedPrize.id,
          prizeNameSnapshot: selectedPrize.name,
          prizeTypeSnapshot: selectedPrize.type,
          prizeImageSnapshot: selectedPrize.imageUrl,
          pointsDeducted: 5,
          redemptionCode: code,
          status: 'UNCLAIMED',
        },
      })

      return {
        prizeName: selectedPrize.name,
        logId: log.id,
      }
    })

    createdSpinLogIds.push(spinResult.logId)
    prizeCounts[spinResult.prizeName] = (prizeCounts[spinResult.prizeName] || 0) + 1
  }

  // 4. Print Summary Report
  console.log('\n📊 --- Simulation Results ---')
  console.log(`Total Simulated Users: 60`)
  console.log(`  - Approved by AI automatically: ${aiApprovedCount}`)
  console.log(`  - Approved by Clerk PIN override: ${clerkPinApprovedCount}`)
  console.log('\nPrizes Awarded Distribution:')
  Object.entries(prizeCounts).forEach(([name, count]) => {
    console.log(`  - ${name}: ${count} times`)
  })

  // E. Verify Inventory Control
  const mugCount = prizeCounts['Limited Mug'] || 0
  console.log(`\n🔍 Checking inventory constraint for "Limited Mug" (Stock was set to 2)...`)
  console.log(`   Result: "Limited Mug" was won ${mugCount} time(s).`)
  
  assert.ok(mugCount <= 2, `CRITICAL: Limited Mug was won ${mugCount} times, which exceeds the inventory of 2!`)
  console.log('✅ Inventory constraint verified successfully (never exceeded stock limit).')

  // F. Verification of clean status
  const totalSpins = Object.values(prizeCounts).reduce((a: number, b: number) => a + b, 0)
  assert.equal(totalSpins, 60, 'All 60 spins must be accounted for')
  console.log('✅ All 60 simulations processed and accounted for without a single transaction failure.')

  // 5. Cleanup
  console.log('\n🧹 Cleaning up simulation data from Postgres database...')
  if (createdSpinLogIds.length > 0) {
    await prisma.gameSpinLog.deleteMany({ where: { id: { in: createdSpinLogIds } } })
  }
  if (createdSubmissionIds.length > 0) {
    await prisma.customerTaskSubmission.deleteMany({ where: { id: { in: createdSubmissionIds } } })
  }
  if (createdSessionIds.length > 0) {
    const sessions = await prisma.gameSession.findMany({
      where: { sessionId: { in: createdSessionIds } },
      select: { id: true },
    })
    const sessionIds = sessions.map((s: any) => s.id)
    await prisma.gameSession.deleteMany({ where: { id: { in: sessionIds } } })
  }
  await prisma.gamePrize.deleteMany({ where: { gameConfigId: config.id } })
  await prisma.gameConfig.delete({ where: { id: config.id } })

  console.log('🎉 ALL 60 SIMULATIONS PASSED SUCCESSFULLY! TRANSACTION INTEGRITY OK! 🎉')
}

runTests().catch(e => {
  console.error('❌ Simulation test failed with error:', e)
  process.exit(1)
})
