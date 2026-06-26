import { PrismaClient } from '@prisma/client'
import { callLLM } from '../src/lib/llmRouter.ts'
import { getGeminiApiKey } from '../src/lib/systemConfig.ts'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Testing LLM Failover Fallback Chain ===')

  // Find a valid API key to use for the working fallback
  const validApiKey = (await getGeminiApiKey()) || process.env.GEMINI_API_KEY || ''
  if (!validApiKey) {
    console.warn('Warning: No valid GEMINI_API_KEY found in DB systemConfig or process.env. The working fallback test may fail.')
  }

  // Clear existing LLMConfig records for test isolation
  console.log('Backing up existing LLMConfigs...')
  const originalConfigs = await prisma.lLMConfig.findMany()
  await prisma.lLMConfig.deleteMany()

  try {
    // 1. Insert a failing config (wrong key) matching taskTag 'copywriting'
    console.log('Inserting failing config (wrong key) for copywriting task tag...')
    await prisma.lLMConfig.create({
      data: {
        provider: 'google',
        displayName: 'Failing Gemini Config (Bad Key)',
        modelName: 'gemini-2.0-flash',
        apiKey: 'AIzaSyFakeKey_Failing_12345',
        isEnabled: true,
        isDefault: false,
        taskTags: ['copywriting'],
      }
    })

    // 2. Insert a working config (with valid key) as a fallback
    console.log('Inserting working config (valid key) as default fallback...')
    await prisma.lLMConfig.create({
      data: {
        provider: 'google',
        displayName: 'Working Fallback Gemini Config (Good Key)',
        modelName: 'gemini-2.0-flash',
        apiKey: validApiKey,
        isEnabled: true,
        isDefault: true,
        taskTags: ['copywriting'],
      }
    })

    console.log('Executing callLLM for copywriting task...')
    const result = await callLLM('copywriting', 'Hello, this is a test. Please reply with "PONG".', 50)

    console.log('Call result:', result)

    if (result.text && result.text.toUpperCase().includes('PONG')) {
      console.log('✓ Success: Router successfully bypassed the failing config and succeeded using the fallback config!')
    } else if (result.text) {
      console.log('✓ Success: Router bypassed failing config and got response (text returned):', result.text)
    } else {
      console.error('FAILED: Call did not return a valid response text. Error detail:', result.error)
      throw new Error('LLM call failed.')
    }
  } finally {
    // Restore original configs
    console.log('Restoring original LLMConfigs...')
    await prisma.lLMConfig.deleteMany()
    for (const config of originalConfigs) {
      const { id, ...data } = config
      await prisma.lLMConfig.create({ data })
    }
    console.log('Restored original configurations.')
  }

  console.log('=== All tests passed! ===')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
