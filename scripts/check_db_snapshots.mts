import { prisma } from '../src/lib/prisma.ts'

async function check() {
  console.log('=== Checking database accounts & snapshots ===')
  const accounts = await prisma.socialAccount.findMany({
    include: {
      snapshots: {
        orderBy: { capturedAt: 'desc' },
      }
    }
  })
  
  console.log(`Found ${accounts.length} social accounts total.`)
  for (const acc of accounts) {
    console.log(`\nAccount: ${acc.handle} (${acc.platformId}) - ID: ${acc.id}`)
    console.log(`- Profile URL: ${acc.profileUrl || 'None'}`)
    console.log(`- SnapshotAt: ${acc.snapshotAt ? acc.snapshotAt.toISOString() : 'None'}`)
    console.log(`- Snapshots count: ${acc.snapshots.length}`)
    for (const snap of acc.snapshots) {
      console.log(`  * Snapshot ID: ${snap.id}`)
      console.log(`    URL: ${snap.imageUrl}`)
      console.log(`    CapturedAt: ${snap.capturedAt.toISOString()}`)
    }
  }
}

check().catch(err => {
  console.error(err)
  process.exit(1)
})
