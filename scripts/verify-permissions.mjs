import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

if (typeof process.loadEnvFile === 'function') {
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

  const [taskA, taskB] = await prisma.$transaction([
    prisma.workUnit.create({
      data: {
        title: `${fixturePrefix} Agent A Task`,
        status: 'todo',
        assigneeId: agentA.id,
      },
    }),
    prisma.workUnit.create({
      data: {
        title: `${fixturePrefix} Agent B Task`,
        status: 'todo',
        assigneeId: agentB.id,
      },
    }),
  ])

  return { humanA, humanB, agentA, agentB, taskA, taskB }
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
  const { humanA, agentA, agentB, taskA, taskB } = await seedFixtures()
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