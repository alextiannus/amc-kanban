import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env')
  process.loadEnvFile('.env.local')
}

const prisma = new PrismaClient()
const baseUrl = process.env.PERMISSION_TEST_BASE_URL || 'http://127.0.0.1:3000'
const fixturePassword = 'PermissionCheck!123'
const fixturePrefix = '[permission-check]'

const fixtures = {
  humanA: {
    email: 'perm-human-a@example.com',
    password: fixturePassword,
  },
  humanB: {
    email: 'perm-human-b@example.com',
    password: fixturePassword,
  },
  agentA: {
    email: 'perm-agent-a@example.com',
    apiKey: 'perm_agent_a_key_01234567890123456789',
    nickname: 'Perm Agent A',
  },
  agentB: {
    email: 'perm-agent-b@example.com',
    apiKey: 'perm_agent_b_key_01234567890123456789',
    nickname: 'Perm Agent B',
  },
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function parseJson(response) {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Expected JSON response from ${response.url}, received: ${text}`)
  }
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init)
  const data = await parseJson(response)
  return { response, data }
}

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const data = await parseJson(response)
  expect(response.ok, `Login failed for ${email}: ${JSON.stringify(data)}`)

  const cookieHeader = response.headers.get('set-cookie')
  expect(cookieHeader, `Login for ${email} did not return a session cookie`)

  return cookieHeader.split(';')[0]
}

async function resetFixtures() {
  const fixtureEmails = Object.values(fixtures).map((fixture) => fixture.email)
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: fixtureEmails } },
    select: { id: true },
  })

  const existingIds = existingUsers.map((user) => user.id)

  await prisma.workUnit.deleteMany({
    where: {
      OR: [
        { title: { startsWith: fixturePrefix } },
        existingIds.length > 0 ? { assigneeId: { in: existingIds } } : { id: '__never__' },
      ],
    },
  })

  await prisma.brand.deleteMany({
    where: { name: { startsWith: fixturePrefix } },
  })

  if (existingIds.length > 0) {
    await prisma.agentPermission.deleteMany({
      where: {
        OR: [
          { humanId: { in: existingIds } },
          { agentId: { in: existingIds } },
        ],
      },
    })

    await prisma.user.deleteMany({
      where: { id: { in: existingIds } },
    })
  }
}

async function seedFixtures() {
  await resetFixtures()

  const passwordHash = await bcrypt.hash(fixturePassword, 10)

  const [humanA, humanB, agentA, agentB] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: fixtures.humanA.email,
        password: passwordHash,
        type: 'HUMAN',
        role: 'USER',
      },
    }),
    prisma.user.create({
      data: {
        email: fixtures.humanB.email,
        password: passwordHash,
        type: 'HUMAN',
        role: 'USER',
      },
    }),
    prisma.user.create({
      data: {
        email: fixtures.agentA.email,
        password: passwordHash,
        type: 'AI_AGENT',
        role: 'USER',
        nickname: fixtures.agentA.nickname,
        apiKey: fixtures.agentA.apiKey,
        introduction: 'Permission test agent A',
        workflow: 'Handle agent A tasks',
        insights: 'Only visible to permitted users.',
        themeColor: '#2563eb',
      },
    }),
    prisma.user.create({
      data: {
        email: fixtures.agentB.email,
        password: passwordHash,
        type: 'AI_AGENT',
        role: 'USER',
        nickname: fixtures.agentB.nickname,
        apiKey: fixtures.agentB.apiKey,
        introduction: 'Permission test agent B',
        workflow: 'Handle agent B tasks',
        insights: 'Only visible to permitted users.',
        themeColor: '#dc2626',
      },
    }),
  ])

  await prisma.agentPermission.createMany({
    data: [
      { humanId: humanA.id, agentId: agentA.id },
      { humanId: humanB.id, agentId: agentB.id },
    ],
  })

  const [brandA, brandASecondary, brandOnlyB, sharedBrand] = await prisma.$transaction([
    prisma.brand.create({
      data: {
        name: `${fixturePrefix} Brand A`,
        timezone: 'Asia/Singapore',
        status: 'ACTIVE',
      },
    }),
    prisma.brand.create({
      data: {
        name: `${fixturePrefix} Brand A Secondary`,
        timezone: 'Asia/Singapore',
        status: 'ACTIVE',
      },
    }),
    prisma.brand.create({
      data: {
        name: `${fixturePrefix} Brand Only B`,
        timezone: 'Asia/Singapore',
        status: 'ACTIVE',
      },
    }),
    prisma.brand.create({
      data: {
        name: `${fixturePrefix} Shared Brand`,
        timezone: 'Asia/Singapore',
        status: 'ACTIVE',
      },
    }),
  ])

  await prisma.brandAgent.createMany({
    data: [
      { brandId: brandA.id, agentId: agentA.id, active: true, role: 'worker' },
      { brandId: brandASecondary.id, agentId: agentA.id, active: true, role: 'worker' },
      { brandId: brandOnlyB.id, agentId: agentB.id, active: true, role: 'worker' },
      { brandId: sharedBrand.id, agentId: agentA.id, active: true, role: 'worker' },
      { brandId: sharedBrand.id, agentId: agentB.id, active: true, role: 'worker' },
    ],
  })

  const [taskA, taskB] = await prisma.$transaction([
    prisma.workUnit.create({
      data: {
        title: `${fixturePrefix} Agent A Task`,
        status: 'todo',
        assigneeId: agentA.id,
        brandId: brandA.id,
      },
    }),
    prisma.workUnit.create({
      data: {
        title: `${fixturePrefix} Agent B Task`,
        status: 'todo',
        assigneeId: agentB.id,
        brandId: brandOnlyB.id,
      },
    }),
  ])

  return { humanA, humanB, agentA, agentB, brandA, brandASecondary, brandOnlyB, sharedBrand, taskA, taskB }
}

function authHeaders(options = {}) {
  const headers = {
    ...(options.headers || {}),
  }

  if (options.cookie) {
    headers.Cookie = options.cookie
  }

  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`
  }

  if (options.json) {
    headers['Content-Type'] = 'application/json'
  }

  return headers
}

async function main() {
  console.log(`Seeding permission fixtures against ${baseUrl}`)
  const { humanA, agentA, agentB, brandA, brandASecondary, brandOnlyB, sharedBrand, taskA, taskB } = await seedFixtures()
  const humanACookie = await login(fixtures.humanA.email, fixtures.humanA.password)

  console.log('Checking: Human A sees only Agent A and no apiKey in list response')
  {
    const { response, data } = await requestJson('/api/agents', {
      headers: authHeaders({ cookie: humanACookie }),
    })

    expect(response.ok, `Expected agent list success, got ${response.status}`)
    expect(Array.isArray(data), 'Expected agent list response to be an array')
    expect(data.length === 1, `Expected Human A to see exactly one agent, got ${data.length}`)
    expect(data[0].id === agentA.id, 'Expected Human A to see only Agent A')
    expect(!('apiKey' in data[0]), 'Agent list response leaked apiKey')
  }

  console.log('Checking: Human A can access Agent A detail and detail does not expose apiKey')
  {
    const { response, data } = await requestJson(`/api/agents/${agentA.id}`, {
      headers: authHeaders({ cookie: humanACookie }),
    })

    expect(response.ok, `Expected Agent A detail success, got ${response.status}`)
    expect(data.id === agentA.id, 'Expected Agent A detail payload')
    expect(!('apiKey' in data), 'Agent detail response leaked apiKey')
  }

  console.log('Checking: Human A cannot access Agent B detail')
  {
    const { response } = await requestJson(`/api/agents/${agentB.id}`, {
      headers: authHeaders({ cookie: humanACookie }),
    })

    expect(response.status === 403, `Expected Agent B detail to be 403, got ${response.status}`)
  }

  console.log('Checking: Human A task list is scoped and assignee secrets are omitted')
  {
    const { response, data } = await requestJson('/api/tasks', {
      headers: authHeaders({ cookie: humanACookie }),
    })

    expect(response.ok, `Expected task list success, got ${response.status}`)
    expect(Array.isArray(data), 'Expected task list response to be an array')
    expect(data.length === 1, `Expected Human A to see exactly one task, got ${data.length}`)
    expect(data[0].id === taskA.id, 'Expected Human A to see only Agent A task')
    expect(data[0].assignee?.id === agentA.id, 'Expected task assignee to be Agent A')
    expect(!('apiKey' in data[0].assignee), 'Task list assignee leaked apiKey')
    expect(!('password' in data[0].assignee), 'Task list assignee leaked password hash')
  }

  console.log('Checking: Human A cannot access Agent B task detail')
  {
    const { response } = await requestJson(`/api/tasks/${taskB.id}`, {
      headers: authHeaders({ cookie: humanACookie }),
    })

    expect(response.status === 403, `Expected Human A task detail for Agent B to be 403, got ${response.status}`)
  }

  console.log('Checking: Human A cannot create tasks for Agent B')
  {
    const { response } = await requestJson('/api/tasks', {
      method: 'POST',
      headers: authHeaders({ cookie: humanACookie, json: true }),
      body: JSON.stringify({
        title: `${fixturePrefix} Human create blocked`,
        assigneeId: agentB.id,
      }),
    })

    expect(response.status === 403, `Expected Human A create for Agent B to be 403, got ${response.status}`)
  }

  console.log('Checking: Human A cannot update Agent B task status')
  {
    const { response } = await requestJson(`/api/tasks/${taskB.id}/status`, {
      method: 'PATCH',
      headers: authHeaders({ cookie: humanACookie, json: true }),
      body: JSON.stringify({ status: 'in_progress' }),
    })

    expect(response.status === 403, `Expected Human A status update for Agent B to be 403, got ${response.status}`)
  }

  console.log('Checking: Human A cannot reassign Agent A task to Agent B')
  {
    const { response } = await requestJson(`/api/tasks/${taskA.id}`, {
      method: 'PATCH',
      headers: authHeaders({ cookie: humanACookie, json: true }),
      body: JSON.stringify({ assigneeId: agentB.id }),
    })

    expect(response.status === 403, `Expected Human A reassignment to Agent B to be 403, got ${response.status}`)
  }

  console.log('Checking: Agent A API key cannot create tasks for Agent B')
  {
    const { response } = await requestJson('/api/tasks', {
      method: 'POST',
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey, json: true }),
      body: JSON.stringify({
        title: `${fixturePrefix} Agent create blocked`,
        assigneeId: agentB.id,
      }),
    })

    expect(response.status === 403, `Expected Agent A create for Agent B to be 403, got ${response.status}`)
  }

  console.log('Checking: Agent A API key cannot update Agent B task status')
  {
    const { response } = await requestJson(`/api/tasks/${taskB.id}/status`, {
      method: 'PATCH',
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey, json: true }),
      body: JSON.stringify({ status: 'in_progress' }),
    })

    expect(response.status === 403, `Expected Agent A status update for Agent B to be 403, got ${response.status}`)
  }

  console.log('Checking: Agent A cannot read config for a brand it is not linked to')
  {
    const { response } = await requestJson(`/api/agent/brand-config?brandId=${brandOnlyB.id}`, {
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey }),
    })

    expect(response.status === 403, `Expected Agent A brand-config read for unlinked brand to be 403, got ${response.status}`)
  }

  console.log('Checking: Agent A cannot update config for a brand it is not linked to')
  {
    const { response } = await requestJson('/api/agent/brand-config', {
      method: 'PATCH',
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey, json: true }),
      body: JSON.stringify({ brandId: brandOnlyB.id, description: 'blocked update' }),
    })

    expect(response.status === 403, `Expected Agent A brand-config update for unlinked brand to be 403, got ${response.status}`)
  }

  console.log('Checking: Agent A cannot upsert accounts for a brand it is not linked to')
  {
    const { response } = await requestJson('/api/agent/accounts', {
      method: 'PATCH',
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey, json: true }),
      body: JSON.stringify({ brandId: brandOnlyB.id, platformId: 'instagram', handle: '@blocked' }),
    })

    expect(response.status === 403, `Expected Agent A account upsert for unlinked brand to be 403, got ${response.status}`)
  }

  console.log('Checking: Agent A cannot create action items for a brand it is not linked to')
  {
    const { response } = await requestJson('/api/agent/action-items', {
      method: 'POST',
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey, json: true }),
      body: JSON.stringify({
        brandId: brandOnlyB.id,
        type: 'competitor_alert',
        title: `${fixturePrefix} blocked action`,
        description: 'blocked action item',
      }),
    })

    expect(response.status === 403, `Expected Agent A action item for unlinked brand to be 403, got ${response.status}`)
  }

  console.log('Checking: Agent A can read config for a co-managed brand')
  {
    const { response, data } = await requestJson(`/api/agent/brand-config?brandId=${sharedBrand.id}`, {
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey }),
    })

    expect(response.ok, `Expected Agent A brand-config read for shared brand to succeed, got ${response.status}`)
    expect(data.id === sharedBrand.id, `Expected shared brand payload, got ${JSON.stringify(data)}`)
  }

  console.log('Checking: multi-brand Agent A must specify brandId when creating own task')
  {
    const { response } = await requestJson('/api/tasks', {
      method: 'POST',
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey, json: true }),
      body: JSON.stringify({ title: `${fixturePrefix} missing brandId` }),
    })

    expect(response.status === 400, `Expected multi-brand Agent A task without brandId to be 400, got ${response.status}`)
  }

  console.log('Checking: Agent A can create and query brand-scoped tasks for Brand A')
  {
    const { response, data } = await requestJson('/api/tasks', {
      method: 'POST',
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey, json: true }),
      body: JSON.stringify({ title: `${fixturePrefix} Agent A Brand Task`, brandId: brandA.id }),
    })

    expect(response.ok, `Expected Agent A brand task create success, got ${response.status}: ${JSON.stringify(data)}`)
    expect(data.brandId === brandA.id, `Expected created task brandId ${brandA.id}, got ${data.brandId}`)

    const filtered = await requestJson(`/api/tasks?brandId=${brandA.id}`, {
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey }),
    })
    expect(filtered.response.ok, `Expected Agent A Brand A task list success, got ${filtered.response.status}`)
    expect(Array.isArray(filtered.data), 'Expected Brand A task list to be an array')
    expect(filtered.data.length >= 1, 'Expected at least one Brand A task')
    expect(filtered.data.every((task) => task.brandId === brandA.id), 'Expected all Brand A task results to carry Brand A brandId')

    const emptySecondary = await requestJson(`/api/tasks?brandId=${brandASecondary.id}`, {
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey }),
    })
    expect(emptySecondary.response.ok, `Expected Agent A Brand A Secondary task list success, got ${emptySecondary.response.status}`)
    expect(Array.isArray(emptySecondary.data), 'Expected Brand A Secondary task list to be an array')
    expect(emptySecondary.data.length === 0, `Expected no Brand A Secondary tasks, got ${emptySecondary.data.length}`)
  }

  console.log('Checking: Agent A cannot query tasks for a brand it is not linked to')
  {
    const { response } = await requestJson(`/api/tasks?brandId=${brandOnlyB.id}`, {
      headers: authHeaders({ apiKey: fixtures.agentA.apiKey }),
    })

    expect(response.status === 403, `Expected Agent A unlinked-brand task list to be 403, got ${response.status}`)
  }

  console.log('Permission verification passed')

  // Keep the database clean so reruns are deterministic.
  await resetFixtures()
}

main()
  .catch((error) => {
    console.error('Permission verification failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })