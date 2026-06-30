import { PrismaClient } from '@prisma/client'

async function main() {
  console.log('Connecting to production database to retrieve LLM configs...')
  const prodUrl = "postgresql://amc_user:g1fb8GblaOI4feUcObfk0fvuWsESDjRP@dpg-d7v9ec7aqgkc73915tcg-a.oregon-postgres.render.com:5432/amc_cupw"
  
  const prodPrisma = new PrismaClient({
    datasources: {
      db: { url: prodUrl }
    }
  })

  try {
    const configs = await prodPrisma.lLMConfig.findMany()
    console.log(`Found ${configs.length} LLM configs in production:`, JSON.stringify(configs, null, 2))
    
    if (configs.length > 0) {
      console.log('Copying LLM configs to local database...')
      const localPrisma = new PrismaClient()
      
      for (const config of configs) {
        // Skip id and dates auto-gen if needed, but upsert is safer
        await localPrisma.lLMConfig.upsert({
          where: { id: config.id },
          update: {
            displayName: config.displayName,
            provider: config.provider,
            modelName: config.modelName,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            isEnabled: config.isEnabled,
            isDefault: config.isDefault,
            taskTags: config.taskTags,
            priority: config.priority
          },
          create: {
            id: config.id,
            displayName: config.displayName,
            provider: config.provider,
            modelName: config.modelName,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            isEnabled: config.isEnabled,
            isDefault: config.isDefault,
            taskTags: config.taskTags,
            priority: config.priority
          }
        })
      }
      
      await localPrisma.$disconnect()
      console.log('LLM configs successfully copied to local database!')
    }
  } catch (err: any) {
    console.error('Failed to query production LLM configs:', err.message)
  } finally {
    await prodPrisma.$disconnect()
  }
}

main()
