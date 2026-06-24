#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { prisma } from '../src/lib/prisma.ts'
import { captureAccountSnapshot, runDailySnapshotCrawler } from '../src/lib/captureSnapshots.ts'

function rid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

async function main() {
  console.log('=== Snapshot Integration Test Started ===')

  const testPassword = 'TestPassword!123'
  const brandName = rid('test-snapshot-brand')
  const handle = rid('insta-handle')

  let createdUserId: string | null = null
  let createdBrandId: string | null = null
  let createdAccountId: string | null = null

  try {
    // 1. Create a test user (owner/principal)
    const user = await prisma.user.create({
      data: {
        email: `${rid('owner')}@example.com`,
        password: testPassword,
        type: 'HUMAN',
        role: 'USER',
        nickname: 'Test Owner',
        businessRoles: {
          create: {
            role: 'BRAND_OWNER'
          }
        }
      }
    })
    createdUserId = user.id
    console.log(`- Created test user: ${user.email}`)

    // 2. Create a test brand owned by the user
    const brand = await prisma.brand.create({
      data: {
        name: brandName,
        status: 'ACTIVE',
        location: 'Singapore',
        owners: {
          create: {
            userId: user.id,
            role: 'owner'
          }
        }
      }
    })
    createdBrandId = brand.id
    console.log(`- Created test brand: ${brand.name}`)

    // 3. Create a test social account under the brand
    const account = await prisma.socialAccount.create({
      data: {
        brandId: brand.id,
        platformId: 'instagram',
        handle: handle,
        profileUrl: `https://instagram.com/${handle}`,
        followerCount: 25000,
        ratingScore: 4.9,
      }
    })
    createdAccountId = account.id
    console.log(`- Created test social account: ${account.handle}`)

    // 4. Test captureAccountSnapshot (should fallback to SVG and create DB record)
    console.log('- Running captureAccountSnapshot...')
    const savedUrl = await captureAccountSnapshot(account.id)
    assert.ok(savedUrl, 'imageUrl should be returned')
    assert.ok(savedUrl.endsWith('.svg') || savedUrl.endsWith('.png'), 'imageUrl should point to svg or png')

    // Verify snapshot in DB
    const snapshotInDb = await prisma.socialAccountSnapshot.findFirst({
      where: { accountId: account.id }
    })
    assert.ok(snapshotInDb, 'Snapshot should be saved to database')
    assert.equal(snapshotInDb.imageUrl, savedUrl, 'Database imageUrl should match returned url')
    console.log(`- Snapshot verified in DB, imageUrl: ${snapshotInDb.imageUrl}`)

    // 5. Test runDailySnapshotCrawler
    console.log('- Running runDailySnapshotCrawler...')
    const crawlerResult = await runDailySnapshotCrawler()
    assert.ok(crawlerResult.successCount > 0, 'Crawler should execute successfully on at least one account')
    console.log(`- Crawler results: success=${crawlerResult.successCount}, failed=${crawlerResult.failedCount}`)

    console.log('=== All snapshot integration tests PASSED ===')
  } catch (e) {
    console.error('❌ Snapshot integration test failed:', e)
    process.exit(1)
  } finally {
    console.log('- Cleaning up test database records...')
    // Cleanup records in correct order to avoid foreign key violations
    if (createdAccountId) {
      await prisma.socialAccountSnapshot.deleteMany({ where: { accountId: createdAccountId } })
      await prisma.socialAccount.delete({ where: { id: createdAccountId } })
    }
    if (createdBrandId) {
      await prisma.brandOwner.deleteMany({ where: { brandId: createdBrandId } })
      await prisma.brand.delete({ where: { id: createdBrandId } })
    }
    if (createdUserId) {
      await prisma.userBusinessRole.deleteMany({ where: { userId: createdUserId } })
      await prisma.user.delete({ where: { id: createdUserId } })
    }
    console.log('- Cleanup finished.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
