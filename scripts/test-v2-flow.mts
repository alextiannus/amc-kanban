import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/lib/prisma.ts'

const PORT = 3001 // use port 3001 to avoid conflicts with 3000 if running
const BASE = `http://localhost:${PORT}`
let devProcess: any = null

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url: string, timeoutMs: number = 60000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status === 200) {
        return true
      }
    } catch {
      // ignore connection errors during boot
    }
    await delay(500)
  }
  return false
}

async function main() {
  // Clean up any existing memory files for test brand
  const testMemoryDir = path.join(process.cwd(), 'memory', 'test-onboarding-brand-v2')
  if (fs.existsSync(testMemoryDir)) {
    fs.rmSync(testMemoryDir, { recursive: true, force: true })
  }

  console.log('--- Setting up DB Entities for Test ---')

  // Find or create test AI Agent
  let agent = await prisma.user.findFirst({ where: { email: 'test-agent-v2@immedi.ai' } })
  if (!agent) {
    agent = await prisma.user.create({
      data: {
        email: 'test-agent-v2@immedi.ai',
        password: 'test-password-123',
        nickname: 'Test Onboarding Agent v2',
        type: 'AI_AGENT',
        role: 'USER',
        apiKey: 'test-agent-api-key-v2-token'
      }
    })
  } else if (!agent.apiKey) {
    agent = await prisma.user.update({
      where: { id: agent.id },
      data: { apiKey: 'test-agent-api-key-v2-token' }
    })
  }

  // Find or create test Brand
  let brand = await prisma.brand.findFirst({ where: { name: 'Test Onboarding Brand v2' } })
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: 'Test Onboarding Brand v2',
        timezone: 'Asia/Singapore',
        status: 'ACTIVE',
        location: 'Singapore',
        googlePlaceId: 'ChIJz52_AzoY2j0RM3n48B2Zyy0'
      }
    })
  }

  // Ensure BrandAgent link
  const link = await prisma.brandAgent.findFirst({
    where: { brandId: brand.id, agentId: agent.id }
  })
  if (!link) {
    await prisma.brandAgent.create({
      data: {
        brandId: brand.id,
        agentId: agent.id,
        active: true
      }
    })
  }

  // Ensure active BrandSubscription
  const subscription = await prisma.brandSubscription.findFirst({
    where: { brandId: brand.id, status: 'ACTIVE' }
  })
  if (!subscription) {
    await prisma.brandSubscription.create({
      data: {
        brandId: brand.id,
        planId: 'essential',
        planName: 'Essential Plan',
        durationMonths: 12,
        billedMonths: 1,
        monthlyBaseUsd: 199,
        totalDueUsd: 199,
        status: 'ACTIVE',
        contractStartDate: new Date(),
        contractEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    })
  }

  console.log(`Test Agent ID: ${agent.id}`)
  console.log(`Test Brand ID: ${brand.id}`)

  console.log('\n--- Booting Dev Server on Port 3001 ---')
  devProcess = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT) }
  })

  const isReady = await waitForServer(`${BASE}/api/meta/openapi`)
  if (!isReady) {
    throw new Error('Next.js dev server failed to start within timeout')
  }
  console.log('Dev server is ready!')

  const authHeader = `Bearer ${agent.apiKey}`
  const headers = {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  }

  console.log('\n=== Testing REST API Endpoints ===')

  // 1. GET Subscription
  console.log('Testing GET /api/brands/[id]/subscription ...')
  const subRes = await fetch(`${BASE}/api/brands/${brand.id}/subscription`, { headers })
  assert.equal(subRes.status, 200)
  const subData = await subRes.json()
  assert.equal(subData.plan_name, '品牌建设版')
  assert.ok(subData.included_services.length > 0)
  console.log('  -> PASS')

  // 2. POST Documents
  console.log('Testing POST /api/brands/[id]/documents ...')
  const docPayload = {
    filename: 'test-marketing-strategy.md',
    docType: 'strategy_plan',
    content: '# Test Strategy\n\nThis is a strategy plan content.'
  }
  const docRes = await fetch(`${BASE}/api/brands/${brand.id}/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify(docPayload)
  })
  assert.equal(docRes.status, 200)
  const docData = await docRes.json()
  assert.ok(docData.docId)
  console.log(`  -> PASS (docId: ${docData.docId})`)

  // 3. POST Sync Document to Kanban
  console.log('Testing POST /api/brands/[id]/documents/[docId]/sync ...')
  const syncRes = await fetch(`${BASE}/api/brands/${brand.id}/documents/${docData.docId}/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ summary: 'Auto-sync strategy report' })
  })
  assert.equal(syncRes.status, 200)
  const syncData = await syncRes.json()
  assert.ok(syncData.taskId)
  assert.equal(syncData.task.status, 'done')
  console.log(`  -> PASS (taskId: ${syncData.taskId})`)

  // 4. POST Daily Memory
  console.log('Testing POST /api/brands/[id]/memory ...')
  const memDate = '2026-06-14'
  const memPayload = {
    date: memDate,
    content: '# Memory 2026-06-14\n- Created test tasks.'
  }
  const memRes = await fetch(`${BASE}/api/brands/${brand.id}/memory`, {
    method: 'POST',
    headers,
    body: JSON.stringify(memPayload)
  })
  assert.equal(memRes.status, 200)
  console.log('  -> PASS')

  // 5. GET Daily Memory
  console.log('Testing GET /api/brands/[id]/memory ...')
  const getMemRes = await fetch(`${BASE}/api/brands/${brand.id}/memory?days=3`, { headers })
  assert.equal(getMemRes.status, 200)
  const getMemData = await getMemRes.json()
  assert.ok(Array.isArray(getMemData))
  assert.ok(getMemData.length > 0)
  assert.equal(getMemData[0].date, memDate)
  console.log('  -> PASS')

  // 6. GET Benchmarks
  console.log('Testing GET /api/analytics/benchmarks ...')
  const benchRes = await fetch(`${BASE}/api/analytics/benchmarks?category=chinese_restaurant&location=Singapore`, { headers })
  assert.equal(benchRes.status, 200)
  const benchData = await benchRes.json()
  assert.equal(benchData.category, 'chinese_restaurant')
  assert.ok(benchData.metrics.instagram.avgEngagementRate)
  console.log('  -> PASS')

  // 7. GET Places
  console.log('Testing GET /api/integrations/google/places ...')
  const placeRes = await fetch(`${BASE}/api/integrations/google/places?placeId=ChIJz52_AzoY2j0RM3n48B2Zyy0`, { headers })
  assert.equal(placeRes.status, 200)
  const placeData = await placeRes.json()
  assert.equal(placeData.placeId, 'ChIJz52_AzoY2j0RM3n48B2Zyy0')
  console.log('  -> PASS')

  // 8. GET Public Profile
  console.log('Testing GET /api/integrations/social/public-profile ...')
  const profRes = await fetch(`${BASE}/api/integrations/social/public-profile?platform=instagram&handle=test_restaurant`, { headers })
  assert.equal(profRes.status, 200)
  const profData = await profRes.json()
  assert.equal(profData.handle, 'test_restaurant')
  console.log('  -> PASS')


  console.log('\n=== Testing MCP JSON-RPC Tools ===')

  async function callMcpTool(toolName: string, args: any) {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: {
        ...headers,
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      })
    })
    assert.equal(res.status, 200)
    const bodyText = await res.text()
    const match = bodyText.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`MCP tool response not JSON: ${bodyText}`)
    const parsed = JSON.parse(match[0])
    if (parsed.error) {
      throw new Error(`MCP tool error: ${JSON.stringify(parsed.error)}`)
    }
    const text = parsed.result?.content?.[0]?.text
    if (parsed.result?.isError || !text) {
      throw new Error(`MCP tool failed: ${text || 'no content'}`)
    }
    return JSON.parse(text)
  }

  // 1. get_brand_subscription
  console.log('Testing MCP get_brand_subscription ...')
  const mcpSub = await callMcpTool('get_brand_subscription', { brandId: brand.id })
  assert.equal(mcpSub.plan_name, '品牌建设版')
  console.log('  -> PASS')

  // 2. create_tasks
  console.log('Testing MCP create_tasks ...')
  const mcpTasks = await callMcpTool('create_tasks', {
    brandId: brand.id,
    tasks: [
      { title: 'Test Task 1', description: 'desc 1', priority: 'high' },
      { title: 'Test Task 2', type: 'require_input', description: 'need image' }
    ]
  })
  assert.equal(mcpTasks.count, 2)
  console.log('  -> PASS')

  // 3. create_require_input_task
  console.log('Testing MCP create_require_input_task ...')
  const mcpReqInput = await callMcpTool('create_require_input_task', {
    brandId: brand.id,
    title: 'Review strategy document',
    description: 'Please review the strategy document.',
    priority: 'high'
  })
  assert.ok(mcpReqInput.taskId)
  assert.equal(mcpReqInput.status, 'pending')
  assert.ok(mcpReqInput.tags.includes('require_input'))
  console.log('  -> PASS')

  // 4. save_local_document
  console.log('Testing MCP save_local_document ...')
  const mcpDoc = await callMcpTool('save_local_document', {
    brandId: brand.id,
    filename: 'mcp-test-document.md',
    docType: 'strategy_plan',
    content: 'strategy content'
  })
  assert.ok(mcpDoc.docId)
  console.log('  -> PASS')

  // 5. sync_to_kanban
  console.log('Testing MCP sync_to_kanban ...')
  const mcpSync = await callMcpTool('sync_to_kanban', {
    brandId: brand.id,
    docId: mcpDoc.docId,
    summary: 'MCP sync summary'
  })
  assert.ok(mcpSync.taskId)
  console.log('  -> PASS')

  // 6. write_daily_memory
  console.log('Testing MCP write_daily_memory ...')
  const mcpWriteMem = await callMcpTool('write_daily_memory', {
    brandId: brand.id,
    date: '2026-06-15',
    content: 'day memory 2026-06-15'
  })
  assert.ok(mcpWriteMem.success)
  console.log('  -> PASS')

  // 7. read_daily_memory
  console.log('Testing MCP read_daily_memory ...')
  const mcpReadMem = await callMcpTool('read_daily_memory', {
    brandId: brand.id,
    days: 3
  })
  assert.ok(Array.isArray(mcpReadMem))
  assert.ok(mcpReadMem.length > 0)
  console.log('  -> PASS')

  // 8. get_platform_benchmarks
  console.log('Testing MCP get_platform_benchmarks ...')
  const mcpBench = await callMcpTool('get_platform_benchmarks', {
    category: 'chinese_restaurant',
    location: 'Singapore'
  })
  assert.equal(mcpBench.category, 'chinese_restaurant')
  console.log('  -> PASS')

  // 9. google_get_place_info
  console.log('Testing MCP google_get_place_info ...')
  const mcpPlace = await callMcpTool('google_get_place_info', {
    placeId: 'ChIJz52_AzoY2j0RM3n48B2Zyy0'
  })
  assert.equal(mcpPlace.placeId, 'ChIJz52_AzoY2j0RM3n48B2Zyy0')
  console.log('  -> PASS')

  // 10. fetch_public_social_profile
  console.log('Testing MCP fetch_public_social_profile ...')
  const mcpProfile = await callMcpTool('fetch_public_social_profile', {
    platform: 'instagram',
    handle: 'mcp_test_handle'
  })
  assert.equal(mcpProfile.handle, 'mcp_test_handle')
  console.log('  -> PASS')

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉')
}

async function cleanup() {
  if (devProcess) {
    console.log('Shutting down local dev server...')
    devProcess.kill('SIGTERM')
  }

  console.log('Cleaning up test DB records...')
  try {
    const testMemoryDir = path.join(process.cwd(), 'memory', 'test-onboarding-brand-v2')
    if (fs.existsSync(testMemoryDir)) {
      fs.rmSync(testMemoryDir, { recursive: true, force: true })
    }

    const brand = await prisma.brand.findFirst({ where: { name: 'Test Onboarding Brand v2' } })
    if (brand) {
      await prisma.brandAgent.deleteMany({ where: { brandId: brand.id } })
      await prisma.brandSubscription.deleteMany({ where: { brandId: brand.id } })
      await prisma.workUnit.deleteMany({ where: { brandId: brand.id } })
      await prisma.brand.delete({ where: { id: brand.id } })
    }
    await prisma.user.deleteMany({ where: { email: 'test-agent-v2@immedi.ai' } })
  } catch (err: any) {
    console.error('Failed to clean up test DB records:', err.message)
  }
  
  await prisma.$disconnect()
}

main()
  .then(async () => {
    await cleanup()
  })
  .catch(async (err) => {
    console.error('❌ Test failed:', err)
    await cleanup()
    process.exit(1)
  })

