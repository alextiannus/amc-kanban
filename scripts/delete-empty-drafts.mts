import { prisma } from '../src/lib/prisma.ts'

async function main() {
  console.log('--- Scanning for empty posts (ContentDrafts) ---')
  
  // Find all drafts
  const drafts = await prisma.contentDraft.findMany({
    select: {
      id: true,
      caption: true,
      createdAt: true,
      brandId: true,
      brand: {
        select: {
          name: true
        }
      }
    }
  })

  // Filter drafts where caption is empty or only whitespace
  const emptyDrafts = drafts.filter((draft: any) => !draft.caption || draft.caption.trim() === '')

  console.log(`Found ${emptyDrafts.length} empty drafts.`)
  if (emptyDrafts.length === 0) {
    console.log('No empty drafts to delete.')
    return
  }

  console.log('Details of empty drafts found:')
  for (const draft of emptyDrafts) {
    console.log(`- ID: ${draft.id}, Brand: ${draft.brand?.name || draft.brandId}, Created: ${draft.createdAt.toISOString()}`)
  }

  console.log('\nDeleting empty drafts from database...')
  const deleteResult = await prisma.contentDraft.deleteMany({
    where: {
      id: {
        in: emptyDrafts.map((d: any) => d.id)
      }
    }
  })

  console.log(`Successfully deleted ${deleteResult.count} empty drafts.`)
}

main()
  .catch(err => {
    console.error('Error executing delete script:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
