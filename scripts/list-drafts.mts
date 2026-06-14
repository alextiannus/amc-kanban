import { prisma } from '../src/lib/prisma.ts'

async function main() {
  console.log('--- Querying all ContentDrafts ---')
  const drafts = await prisma.contentDraft.findMany({
    select: {
      id: true,
      caption: true,
      status: true,
      createdAt: true,
      brandId: true
    }
  })

  console.log(`Total drafts: ${drafts.length}`)
  for (const draft of drafts) {
    console.log(`- ID: ${draft.id}, Status: ${draft.status}, Caption: "${draft.caption}", Created: ${draft.createdAt.toISOString()}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
