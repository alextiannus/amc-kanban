import { prisma } from '../src/lib/prisma.ts'

async function main() {
  console.log('--- MCP and Skills Voice Companion Integration Test (HTTP Fetch) ---')
  
  // 1. Get first brand
  const brand = await prisma.brand.findFirst()
  if (!brand) {
    console.error('No brands found to test.')
    return
  }
  console.log(`Using Brand: ${brand.name} (${brand.id})`)

  // 2. Find or create an AI Agent user to authenticate
  let user = await prisma.user.findFirst({
    where: { type: 'AI_AGENT' }
  })

  if (!user) {
    user = await prisma.user.findFirst()
  }

  if (!user) {
    console.error('No users found to authenticate.')
    return
  }

  // Ensure user has an apiKey
  if (!user.apiKey) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { apiKey: 'test-agent-api-key-' + Date.now() }
    })
  }

  console.log(`Using User for auth: ${user.email} with apiKey: ${user.apiKey}`)

  // Copy GEMINI_API_KEY from environment to SystemConfig database table
  const envGeminiKey = process.env.GEMINI_API_KEY
  if (envGeminiKey) {
    console.log('Copying GEMINI_API_KEY to SystemConfig database table...')
    await prisma.systemConfig.upsert({
      where: { id: 'default' },
      update: { geminiApiKey: envGeminiKey },
      create: { id: 'default', geminiApiKey: envGeminiKey }
    })
  } else {
    console.warn('WARNING: GEMINI_API_KEY is not defined in process.env!')
  }

  // Create a temporary active BrandAgent link to bypass canSessionAccessBrandProject check
  console.log('Creating temporary active BrandAgent link...')
  const tempLink = await prisma.brandAgent.upsert({
    where: { brandId_agentId: { brandId: brand.id, agentId: user.id } },
    update: { active: true },
    create: { brandId: brand.id, agentId: user.id, active: true }
  })

  // 3. Test end-to-end Voice Chat API Handler via HTTP POST to localhost:3002
  console.log('\n--- Sending Request to Local Server ---')
  
  const mockMessage = '帮我用dct-logistics查一下邮编 577178 在新加坡的地址，并告诉我它的坐标。'
  console.log(`Sending message: "${mockMessage}"`)

  const t0 = Date.now()
  try {
    const res = await fetch(`http://localhost:3002/api/brands/${brand.id}/copywriter/voice-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.apiKey}`
      },
      body: JSON.stringify({
        message: mockMessage,
        history: []
      })
    })

    const duration = Date.now() - t0
    console.log(`Response status: ${res.status} (${duration}ms)`)
    
    const responseBody = await res.json()
    console.log('Response Body:', JSON.stringify(responseBody, null, 2))
  } catch (err: any) {
    console.error('Fetch request failed. Make sure "npm run dev" is running at localhost:3000.', err.message)
  }
}

main()
  .catch(err => {
    console.error('Test run failed:', err)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
