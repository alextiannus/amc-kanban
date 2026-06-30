import { PrismaClient } from '@prisma/client'

async function main() {
  console.log('Connecting to production database to retrieve Gemini API Key...')
  const prodUrl = "postgresql://amc_user:g1fb8GblaOI4feUcObfk0fvuWsESDjRP@dpg-d7v9ec7aqgkc73915tcg-a.oregon-postgres.render.com:5432/amc_cupw"
  
  const prodPrisma = new PrismaClient({
    datasources: {
      db: { url: prodUrl }
    }
  })

  try {
    const config = await prodPrisma.systemConfig.findUnique({ where: { id: 'default' } })
    if (config && config.geminiApiKey) {
      console.log('Successfully retrieved Gemini API Key from production database!')
      
      console.log('Writing key to local database...')
      const localPrisma = new PrismaClient()
      await localPrisma.systemConfig.upsert({
        where: { id: 'default' },
        update: { geminiApiKey: config.geminiApiKey },
        create: { id: 'default', geminiApiKey: config.geminiApiKey }
      })
      await localPrisma.$disconnect()
      console.log('Key successfully copied to local database!')
    } else {
      console.error('No Gemini API Key found in production database.')
    }
  } catch (err: any) {
    console.error('Failed to query production database:', err.message)
  } finally {
    await prodPrisma.$disconnect()
  }
}

main()
