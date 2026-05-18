/**
 * AMC Kanban — MCP Server definition
 *
 * All agent-facing REST capabilities exposed as MCP tools.
 * Uses WebStandardStreamableHTTPServerTransport (Web Fetch API compatible).
 *
 * NOTE: server.tool() takes a raw ZodRawShape (plain object of zod types),
 * NOT a z.object(). The SDK wraps it internally.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { postfastFetchAccounts } from '@/lib/integrations/postfast'

// ── Auth helper ────────────────────────────────────────────────────────────
export async function getAgentFromKey(apiKey: string) {
  const key = apiKey.replace(/^Bearer\s+/i, '').trim()
  if (!key) return null
  return prisma.user.findFirst({ where: { apiKey: key, type: 'AI_AGENT' } })
}

// ── Build and return a configured McpServer ────────────────────────────────
export function createAmcMcpServer(agentApiKey: string) {
  const server = new McpServer({
    name: 'amc-kanban',
    version: '1.0.0',
  })

  const resolveAgent = () => getAgentFromKey(agentApiKey)

  // ── get_brand_config ────────────────────────────────────────────────────
  server.tool(
    'get_brand_config',
    'Get brand config and linked social accounts for brands this agent manages.',
    {
      brandId: z.string().optional().describe('Specific brand ID. Omit to list all linked brands.'),
    },
    async ({ brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      if (brandId) {
        const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }
        const brand = await prisma.brand.findUnique({
          where: { id: brandId },
          select: {
            id: true, name: true, description: true, website: true, phone: true,
            address: true, location: true, timezone: true, autoPilot: true,
            postfastApiKey: true, googlePlaceId: true, googleApiKey: true,
            larkAppId: true, larkAppSecret: true, larkBotWebhook: true, larkOwnerId: true,
            accounts: { select: { id: true, platformId: true, handle: true, displayName: true, autoPilot: true } },
          },
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify(brand, null, 2) }] }
      }

      const links = await prisma.brandAgent.findMany({
        where: { agentId: agent.id, active: true },
        include: {
          brand: {
            select: {
              id: true, name: true, description: true, location: true, timezone: true, autoPilot: true,
              accounts: { select: { id: true, platformId: true, handle: true, autoPilot: true } },
            },
          },
        },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(links.map(l => l.brand), null, 2) }] }
    }
  )

  // ── update_brand_config ─────────────────────────────────────────────────
  server.tool(
    'update_brand_config',
    'Create or update brand profile and integration credentials. Write interview results and brand description here.',
    {
      brandId: z.string().optional().describe('Brand ID to update. Omit only when creating a new brand.'),
      name: z.string().optional(),
      description: z.string().optional().describe('Full brand intro ≥200 chars. Synthesize all interview content + AI understanding. Markdown supported. Shown on brand dashboard.'),
      location: z.string().optional().describe('City, Country'),
      timezone: z.string().optional().describe('IANA timezone e.g. Asia/Singapore'),
      website: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      postfastApiKey: z.string().optional(),
      googlePlaceId: z.string().optional(),
      googleApiKey: z.string().optional(),
      larkAppId: z.string().optional(),
      larkAppSecret: z.string().optional(),
      larkBotWebhook: z.string().optional(),
      larkOwnerId: z.string().optional(),
    },
    async (input) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const { brandId, name, ...fields } = input

      if (!brandId) {
        if (!name) return { content: [{ type: 'text' as const, text: 'Error: name required when creating a new brand' }], isError: true }
        const brand = await prisma.brand.create({ data: { ownerId: agent.id, name, ...fields } })
        await prisma.brandAgent.upsert({
          where: { brandId_agentId: { brandId: brand.id, agentId: agent.id } },
          create: { brandId: brand.id, agentId: agent.id, role: 'owner', active: true },
          update: { active: true },
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, created: true, brandId: brand.id }) }] }
      }

      await prisma.brandAgent.upsert({
        where: { brandId_agentId: { brandId, agentId: agent.id } },
        create: { brandId, agentId: agent.id, role: 'worker', active: true },
        update: { active: true },
      })

      const WRITABLE = ['name', 'description', 'website', 'phone', 'address', 'location', 'timezone',
        'postfastApiKey', 'googlePlaceId', 'googleApiKey', 'larkAppId', 'larkAppSecret',
        'larkBotWebhook', 'larkOwnerId'] as const
      const updateData: Record<string, unknown> = {}
      if (name) updateData.name = name
      for (const key of WRITABLE) {
        const val = (input as Record<string, unknown>)[key]
        if (val !== undefined && val !== '') updateData[key] = val
      }

      await prisma.brand.update({ where: { id: brandId }, data: updateData })

      if (input.postfastApiKey) {
        try {
          const pfResult = await postfastFetchAccounts(input.postfastApiKey)
          if (pfResult.success && pfResult.accounts.length > 0) {
            for (const acc of pfResult.accounts) {
              await prisma.socialAccount.upsert({
                where: { brandId_platformId_handle: { brandId, platformId: acc.platformId, handle: acc.handle } },
                create: { brandId, platformId: acc.platformId, handle: acc.handle, displayName: acc.displayName ?? acc.handle },
                update: { displayName: acc.displayName ?? acc.handle },
              })
            }
          }
        } catch { /* non-fatal — PostFast sync failure should not block brand update */ }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, updated: Object.keys(updateData), brandId }) }] }
    }
  )

  // ── get_agent_profile ───────────────────────────────────────────────────
  server.tool(
    'get_agent_profile',
    'Get this agent\'s own profile from AMC Kanban.',
    {},
    async () => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const { password: _, apiKey: __, avatarData: ___, ...safe } = agent as any
      return { content: [{ type: 'text' as const, text: JSON.stringify(safe, null, 2) }] }
    }
  )

  // ── update_agent_profile ────────────────────────────────────────────────
  server.tool(
    'update_agent_profile',
    'Update agent nickname, avatar, introduction, themeColor, workflow, or insights.',
    {
      nickname: z.string().optional(),
      avatar: z.string().optional().describe('Public URL or base64 data URI (data:image/png;base64,...). System stores it permanently.'),
      introduction: z.string().optional(),
      workflow: z.string().optional(),
      themeColor: z.string().optional().describe('HEX color e.g. #6366f1'),
      insights: z.string().optional(),
    },
    async (input) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const updateData: Record<string, unknown> = { ...input }

      if (input.avatar) {
        if (input.avatar.startsWith('data:')) {
          const match = input.avatar.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            updateData.avatarMimeType = match[1]
            updateData.avatarData = Buffer.from(match[2], 'base64')
            delete updateData.avatar
          }
        } else if (input.avatar.startsWith('http')) {
          try {
            const res = await fetch(input.avatar)
            if (res.ok) {
              updateData.avatarData = Buffer.from(await res.arrayBuffer())
              updateData.avatarMimeType = res.headers.get('content-type') || 'image/jpeg'
              delete updateData.avatar
            }
          } catch { /* keep URL as fallback */ }
        }
      }

      await prisma.user.update({ where: { id: agent.id }, data: updateData })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, updated: Object.keys(updateData) }) }] }
    }
  )

  // ── list_tasks ──────────────────────────────────────────────────────────
  server.tool(
    'list_tasks',
    'List Kanban work units. Filter by brandId, status, or tasks assigned to this agent.',
    {
      brandId: z.string().optional(),
      status: z.enum(['todo', 'in_progress', 'pending', 'done', 'archived']).optional(),
      assignedToMe: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional().default(20),
    },
    async ({ brandId, status, assignedToMe, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const where: Record<string, unknown> = {}
      if (brandId) where.brandId = brandId
      if (status) where.status = status
      if (assignedToMe) where.assigneeId = agent.id

      const tasks = await prisma.workUnit.findMany({
        where,
        take: limit ?? 20,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, description: true, status: true, priority: true, weight: true, assigneeId: true, createdAt: true },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] }
    }
  )

  // ── create_task ─────────────────────────────────────────────────────────
  server.tool(
    'create_task',
    'Create a new Kanban work unit to log work items, content drafts, or action items.',
    {
      title: z.string().describe('Concise, action-oriented task title'),
      description: z.string().optional().describe('Details, context, or content draft. Markdown supported.'),
      status: z.enum(['todo', 'in_progress', 'pending']).optional().default('todo'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
      weight: z.number().int().optional().describe('1 = light, 3 = normal, 5 = heavy'),
    },
    async ({ title, description, status, priority, weight }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const task = await prisma.workUnit.create({
        data: {
          title,
          description: description || null,
          status: status || 'todo',
          priority: priority || 'medium',
          weight: [1, 3, 5].includes(weight ?? 0) ? weight! : 3,
          assigneeId: agent.id,
        },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, taskId: task.id, title: task.title }) }] }
    }
  )

  // ── update_task ─────────────────────────────────────────────────────────
  server.tool(
    'update_task',
    'Update an existing work unit — status, description, title, or priority.',
    {
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['todo', 'in_progress', 'pending', 'done', 'archived']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    },
    async ({ taskId, ...fields }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const updateData: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updateData[k] = v
      }

      const task = await prisma.workUnit.update({ where: { id: taskId }, data: updateData })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, taskId: task.id, status: task.status }) }] }
    }
  )

  // ── update_accounts ─────────────────────────────────────────────────────
  server.tool(
    'update_accounts',
    'Add or update a social media account for a brand.',
    {
      brandId: z.string(),
      platformId: z.enum(['instagram', 'tiktok', 'xiaohongshu', 'facebook', 'youtube', 'twitter', 'linkedin', 'wechat']),
      handle: z.string(),
      displayName: z.string().optional(),
      profileUrl: z.string().optional(),
      loginUsername: z.string().optional(),
      loginPassword: z.string().optional(),
    },
    async ({ brandId, platformId, handle, displayName, profileUrl, loginUsername, loginPassword }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const account = await prisma.socialAccount.upsert({
        where: { brandId_platformId_handle: { brandId, platformId, handle } },
        create: { brandId, platformId, handle, displayName: displayName || handle, profileUrl: profileUrl || null, loginUsername: loginUsername || null, loginPassword: loginPassword || null },
        update: { displayName: displayName || handle, profileUrl: profileUrl || null, loginUsername: loginUsername || null, loginPassword: loginPassword || null },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, accountId: account.id, platformId, handle }) }] }
    }
  )

  // ── post_action_item ────────────────────────────────────────────────────
  server.tool(
    'post_action_item',
    'Submit an action item (alert or content pending review) to the brand dashboard.',
    {
      brandId: z.string(),
      type: z.enum(['sentiment_alert', 'content_draft', 'competitor_alert', 'performance_update']),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
      title: z.string(),
      description: z.string().describe('Full content or action details'),
      platform: z.string().optional(),
    },
    async ({ brandId, type, priority, title, description, platform }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const item = await prisma.actionItem.create({
        data: { brandId, type, priority: priority || 'medium', title, description, status: 'pending', agentId: agent.id },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, actionItemId: item.id }) }] }
    }
  )

  return server
}
