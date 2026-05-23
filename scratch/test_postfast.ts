import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Fetching brands...')
  const brands = await prisma.brand.findMany({
    select: { id: true, name: true, postfastApiKey: true }
  })
  console.log('Brands in DB:', brands.map(b => ({ id: b.id, name: b.name, hasKey: !!b.postfastApiKey })))

  for (const brand of brands) {
    if (brand.postfastApiKey) {
      console.log(`Testing brand: ${brand.name} (${brand.id})`)
      const apiKey = brand.postfastApiKey
      
      // Let's call /social-media/my-social-accounts directly using fetch
      console.log('Fetching accounts from PostFast...')
      const res = await fetch('https://api.postfa.st/social-media/my-social-accounts', {
        headers: {
          'pf-api-key': apiKey,
          'Content-Type': 'application/json',
        }
      })
      console.log('Response Status:', res.status)
      const data = await res.json()
      console.log('Response Data:', JSON.stringify(data, null, 2))
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
