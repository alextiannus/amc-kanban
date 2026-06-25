#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import assert from 'assert'
import { prisma } from '../src/lib/prisma.ts'

const PORT = 3009
const BASE_URL = `http://127.0.0.1:${PORT}`
const FIXTURE_PREFIX = '[log-test]'
const FIXTURE_PASSWORD = 'LogTestPass!123'

const fixtures = {
  ownerA: {
    email: 'log-owner-a@example.com',
    password: FIXTURE_PASSWORD,
  },
  ownerB: {
    email: 'log-owner-b@example.com',
    password: FIXTURE_PASSWORD,
  },
  agentA: {
    email: 'log-agent-a@example.com',
    password: FIXTURE_PASSWORD,
    nickname: 'Log AI Writer Agent',
  },
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function login(email: string) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: FIXTURE_PASSWORD }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Login failed for ${email}: ${errText}`)
  }

  const cookieHeader = response.headers.get('set-cookie')
  if (!cookieHeader) {
    throw new Error(`Login for ${email} did not return a session cookie`)
  }
  return cookieHeader.split(';')[0]
}

async function cleanupFixtures() {
  const fixtureEmails = Object.values(fixtures).map((f) => f.email)
  const users = await prisma.user.findMany({
    where: { email: { in: fixtureEmails } },
    select: { id: true },
  })
  const userIds = users.map((u) => u.id)

  if (userIds.length > 0) {
    // Delete audit logs created during test
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: userIds } },
    })

    // Delete tasks/drafts
    await prisma.workUnit.deleteMany({
      where: { title: { startsWith: FIXTURE_PREFIX } },
    })
    await prisma.contentDraft.deleteMany({
      where: { caption: { startsWith: FIXTURE_PREFIX } },
    })

    // Delete BrandAgent relations
    await prisma.brandAgent.deleteMany({
      where: { agentId: { in: userIds } },
    })

    // Delete BrandOwner relations
    await prisma.brandOwner.deleteMany({
      where: { userId: { in: userIds } },
    })

    // Delete brands
    await prisma.brand.deleteMany({
      where: { name: { startsWith: FIXTURE_PREFIX } },
    })

    // Delete users
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    })
  }
}

async function seedFixtures() {
  await cleanupFixtures()

  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10)

  // 1. Create Users
  const ownerA = await prisma.user.create({
    data: { email: fixtures.ownerA.email, password: passwordHash, type: 'HUMAN', role: 'USER' },
  })
  const ownerB = await prisma.user.create({
    data: { email: fixtures.ownerB.email, password: passwordHash, type: 'HUMAN', role: 'USER' },
  })
  const agentA = await prisma.user.create({
    data: { email: fixtures.agentA.email, password: passwordHash, type: 'AI_AGENT', role: 'USER', nickname: fixtures.agentA.nickname },
  })

  // 2. Create Brands
  const brandA = await prisma.brand.create({
    data: { name: `${FIXTURE_PREFIX} Brand A`, timezone: 'Asia/Singapore', status: 'ACTIVE' },
  })
  const brandB = await prisma.brand.create({
    data: { name: `${FIXTURE_PREFIX} Brand B`, timezone: 'Asia/Singapore', status: 'ACTIVE' },
  })

  // 3. Bind Owners & Agents
  await prisma.brandOwner.create({
    data: { brandId: brandA.id, userId: ownerA.id, role: 'owner' },
  })
  await prisma.brandOwner.create({
    data: { brandId: brandB.id, userId: ownerB.id, role: 'owner' },
  })
  await prisma.brandAgent.create({
    data: { brandId: brandA.id, agentId: agentA.id, active: true, role: 'worker' },
  })

  // 4. Create task and draft
  const task = await prisma.workUnit.create({
    data: {
      title: `${FIXTURE_PREFIX} Write weekly post`,
      status: 'in_progress',
      assigneeId: agentA.id,
      brandId: brandA.id,
      description: 'Generate marketing content for weekend campaign',
    },
  })

  const draft = await prisma.contentDraft.create({
    data: {
      caption: `${FIXTURE_PREFIX} Weekend Lobster Promo! Makan time!`,
      brandId: brandA.id,
      status: 'approved',
    },
  })

  // 5. Create Audit Logs
  // Log 1: Task Status Change
  await prisma.auditLog.create({
    data: {
      timestamp: new Date('2026-06-25T10:00:00Z'),
      actorId: agentA.id,
      actorType: 'AI_AGENT',
      actorName: agentA.nickname,
      action: 'STATUS_CHANGED',
      resourceId: task.id,
      resourceType: 'WorkUnit',
      oldValue: { status: 'todo' },
      newValue: { status: 'in_progress' },
    },
  })

  // Log 2: Draft Published
  await prisma.auditLog.create({
    data: {
      timestamp: new Date('2026-06-25T12:00:00Z'),
      actorId: agentA.id,
      actorType: 'AI_AGENT',
      actorName: agentA.nickname,
      action: 'DRAFT_PUBLISHED',
      resourceId: draft.id,
      resourceType: 'ContentDraft',
      metadata: { postId: 'lark-post-e2e-12345' },
    },
  })

  return { ownerA, ownerB, agentA, brandA, brandB, task, draft }
}

async function runTests() {
  console.log('Seeding integration test data...')
  const { ownerA, ownerB, agentA, brandA, brandB, task, draft } = await seedFixtures()

  console.log('Logging in as Owner A...')
  const cookieA = await login(fixtures.ownerA.email)

  console.log('Checking: Owner A fetches logs for Brand A (authorized)')
  {
    const res = await fetch(`${BASE_URL}/api/logs/agent?brandId=${brandA.id}`, {
      headers: { Cookie: cookieA },
    })
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)
    const data = await res.json()
    assert.ok(Array.isArray(data.logs), 'Expected logs to be an array')
    assert.ok(Array.isArray(data.agents), 'Expected agents list to be an array')

    // Verify agents dropdown list contains the seeded agent
    const foundAgent = data.agents.find((a: any) => a.id === agentA.id)
    assert.ok(foundAgent, 'Expected seeded AI Agent in agents dropdown list')

    // Verify the logs have been mapped to natural Chinese descriptions
    const statusChangeLog = data.logs.find((l: any) => l.action === 'STATUS_CHANGED')
    assert.ok(statusChangeLog, 'Expected to find STATUS_CHANGED log')
    assert.ok(
      statusChangeLog.description.includes('将任务'),
      `Expected natural language description, got: ${statusChangeLog.description}`
    )
    assert.ok(
      statusChangeLog.description.includes('从「待办」更新为「执行中」'),
      `Expected status translation, got: ${statusChangeLog.description}`
    )

    const draftPublishLog = data.logs.find((l: any) => l.action === 'DRAFT_PUBLISHED')
    assert.ok(draftPublishLog, 'Expected to find DRAFT_PUBLISHED log')
    assert.strictEqual(draftPublishLog.description, '将发布内容成功推送至目标平台')
    assert.ok(
      draftPublishLog.detail.includes('lark-post-e2e-12345'),
      `Expected detail to carry postId, got: ${draftPublishLog.detail}`
    )
  }

  console.log('Checking: Date filter behaves correctly')
  {
    // Filter on 2026-06-25 -> should return logs
    const resYes = await fetch(`${BASE_URL}/api/logs/agent?brandId=${brandA.id}&startDate=2026-06-25&endDate=2026-06-25`, {
      headers: { Cookie: cookieA },
    })
    const dataYes = await resYes.json()
    assert.strictEqual(dataYes.logs.length, 2, 'Expected 2 logs on 2026-06-25')

    // Filter on 2026-06-26 -> should return 0 logs
    const resNo = await fetch(`${BASE_URL}/api/logs/agent?brandId=${brandA.id}&startDate=2026-06-26&endDate=2026-06-26`, {
      headers: { Cookie: cookieA },
    })
    const dataNo = await resNo.json()
    assert.strictEqual(dataNo.logs.length, 0, 'Expected 0 logs on 2026-06-26')
  }

  console.log('Checking: Agent filter behaves correctly')
  {
    // Filter by agentA id -> should return logs
    const resYes = await fetch(`${BASE_URL}/api/logs/agent?brandId=${brandA.id}&agentId=${agentA.id}`, {
      headers: { Cookie: cookieA },
    })
    const dataYes = await resYes.json()
    assert.strictEqual(dataYes.logs.length, 2, 'Expected 2 logs for Agent A')

    // Filter by a random ID -> should return 0 logs
    const resNo = await fetch(`${BASE_URL}/api/logs/agent?brandId=${brandA.id}&agentId=nonexistent-agent-id`, {
      headers: { Cookie: cookieA },
    })
    const dataNo = await resNo.json()
    assert.strictEqual(dataNo.logs.length, 0, 'Expected 0 logs for unknown agent')
  }

  console.log('Checking: Multi-tenancy boundaries (Owner B cannot see Brand A logs)')
  {
    const cookieB = await login(fixtures.ownerB.email)
    const res = await fetch(`${BASE_URL}/api/logs/agent?brandId=${brandA.id}`, {
      headers: { Cookie: cookieB },
    })
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)
    const data = await res.json()
    // Should return 0 logs because Brand A is not owned/accessible by Owner B
    assert.strictEqual(
      data.logs.filter((l: any) => l.description.includes(FIXTURE_PREFIX)).length,
      0,
      'Security Violation: Owner B accessed Brand A logs!'
    )
  }

  console.log('E2E Integration tests passed successfully!')
}

async function main() {
  let serverProcess: ChildProcess | null = null

  try {
    console.log(`Starting Next.js production server on port ${PORT}...`)
    serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'production' },
    })

    // Poll server until ready
    let ready = false
    for (let i = 0; i < 20; i++) {
      await delay(500)
      try {
        const res = await fetch(`${BASE_URL}/api/meta/openapi`)
        if (res.ok) {
          ready = true
          break
        }
      } catch {
        // Not ready yet
      }
    }

    if (!ready) {
      throw new Error('Next.js server failed to start or respond on port ' + PORT)
    }

    console.log('Next.js server is ready. Running tests...')
    await runTests()
  } finally {
    console.log('Cleaning up fixtures in database...')
    await cleanupFixtures()

    if (serverProcess) {
      console.log('Stopping Next.js server...')
      serverProcess.kill()
    }
  }
}

main().catch((err) => {
  console.error('❌ E2E Integration tests failed:', err)
  process.exit(1)
})
