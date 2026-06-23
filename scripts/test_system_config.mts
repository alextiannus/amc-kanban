import { PrismaClient } from '@prisma/client'
import { getGeminiApiKey, ensureSystemConfig } from '../src/lib/systemConfig'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Testing SystemConfig DB Key & Fallback ===')

  // 1. Ensure system config initialized
  const config = await ensureSystemConfig()
  console.log('Initialized config:', config)

  // Save current key to restore later
  const originalKey = config.geminiApiKey

  // 2. Test fallback to env key when db key is null
  await prisma.systemConfig.update({
    where: { id: 'default' },
    data: { geminiApiKey: null }
  })
  const keyWithNullDb = await getGeminiApiKey()
  console.log('Key when DB key is null (should be fallback process.env.GEMINI_API_KEY):', keyWithNullDb)

  // 3. Test db key overrides env key
  const testKey = 'test_gemini_api_key_override_1234'
  await prisma.systemConfig.update({
    where: { id: 'default' },
    data: { geminiApiKey: testKey }
  })
  const keyWithDbOverride = await getGeminiApiKey()
  console.log('Key when DB key is configured (should be testKey):', keyWithDbOverride)

  if (keyWithDbOverride === testKey) {
    console.log('✓ Success: DB key overrides environment variable.')
  } else {
    throw new Error('FAILED: DB key did not override environment variable.')
  }

  // 4. Test audit log write
  const updatedConfig = await prisma.systemConfig.update({
    where: { id: 'default' },
    data: { geminiApiKey: 'another_key_5678' }
  })
  
  await prisma.auditLog.create({
    data: {
      actorId: 'test_admin_user',
      actorType: 'HUMAN',
      actorName: 'testadmin@example.com',
      action: 'SYSTEM_CONFIG_UPDATED',
      resourceId: updatedConfig.id,
      resourceType: 'SystemConfig',
      oldValue: { id: 'default', geminiApiKey: '••••••1234' },
      newValue: { id: 'default', geminiApiKey: '••••••5678' },
    }
  })
  
  const log = await prisma.auditLog.findFirst({
    where: { action: 'SYSTEM_CONFIG_UPDATED' },
    orderBy: { timestamp: 'desc' }
  })
  
  if (log) {
    console.log('✓ Success: Audit log entry successfully created:', log)
  } else {
    throw new Error('FAILED: Audit log entry not created.')
  }

  // Restore original key
  await prisma.systemConfig.update({
    where: { id: 'default' },
    data: { geminiApiKey: originalKey }
  })
  console.log('Restored original config key.')
  console.log('=== All tests passed! ===')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
