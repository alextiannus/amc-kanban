/**
 * AI Marketing Crew — MCP Server definition
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
import { writeAuditLog, actorFromContext } from '@/lib/audit'
import { readBrandProfileMarkdown, refreshBrandProfileMarkdown, writeBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'
import { statSync } from 'node:fs'
import { join } from 'node:path'

let lastCheckedTime = Date.now()

function getSkillUpdateNotice(): string | null {
  try {
    const path1 = join(process.cwd(), 'skills/agent-instructions.md')
    const path2 = join(process.cwd(), 'src/lib/agentInitPrompt.ts')
    
    let mtime1 = 0
    try { mtime1 = statSync(path1).mtimeMs } catch {}
    
    let mtime2 = 0
    try { mtime2 = statSync(path2).mtimeMs } catch {}
    
    const latestMtime = Math.max(mtime1, mtime2)
    
    if (latestMtime > lastCheckedTime) {
      lastCheckedTime = Date.now()
      return `[SYSTEM NOTICE] Your content creation & publishing skill instructions have been updated! Please ensure you align with the new standard workflows:
1. All planned/not-started work must go to 'To Do' (status: 'todo').
2. If materials are missing, set status to 'Require Input' (status: 'pending') and fill 'requiredInput'.
3. If materials are complete, create a Lark doc draft with sharing settings 'anyone with link can edit', and save its URL to task.
4. Auto-pilot mode: set task status to 'In Progress' (status: 'in_progress') on successful schedule/publish.
5. Set status to 'Done' (status: 'done') once you verify the post is live (and record post URL).
6. Set status to 'Void' (status: 'void') for cancelled/obsolete tasks.`
    }
  } catch (e) {
    console.error('Failed to check skill mtime:', e)
  }
  return null
}

// ── Auth helper ────────────────────────────────────────────────────────────
export async function getAgentFromKey(apiKey: string) {
  const key = apiKey.replace(/^Bearer\s+/i, '').trim()
  if (!key) return null
  return prisma.user.findFirst({ where: { apiKey: key, type: 'AI_AGENT' } })
}

async function requireActiveBrandLink(brandId: string, agentId: string) {
  return prisma.brandAgent.findFirst({ where: { brandId, agentId, active: true }, select: { id: true } })
}

async function requireOwnedTask(taskId: string, agentId: string) {
  return prisma.workUnit.findFirst({ where: { id: taskId, assigneeId: agentId }, select: { id: true, assigneeId: true, brandId: true } })
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
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
            postfastApiKey: true,
            googlePlaceId: true,
            googleApiKey: true,
            larkAppId: true,
            larkAppSecret: true,
            larkParentFolderToken: true, larkDriveFolderId: true,
            larkBotWebhook: true,
            larkOwnerId: true,
            accounts: { select: { id: true, platformId: true, handle: true, displayName: true, autoPilot: true } },
          },
        })
        if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

        const {
          postfastApiKey,
          googleApiKey,
          larkAppId,
          larkAppSecret,
          larkBotWebhook,
          ...publicBrand
        } = brand

        const safeBrand = {
          ...publicBrand,
          postfastConfigured: !!postfastApiKey,
          googleConfigured: !!publicBrand.googlePlaceId && !!googleApiKey,
          larkConfigured: !!larkAppId && !!larkAppSecret,
          larkNotifyConfigured: !!publicBrand.larkOwnerId || !!larkBotWebhook,
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(safeBrand, null, 2) }] }
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

  // ── get_brand_profile_markdown ─────────────────────────────────────────
  server.tool(
    'get_brand_profile_markdown',
    'Read brand profile markdown for AI pre-read context. Contains brand basics, positioning, multi-store structure, and social platform config.',
    {
      brandId: z.string().describe('Brand ID linked to this agent.'),
      refresh: z.boolean().optional().describe('When true, regenerate the auto snapshot section before reading.'),
    },
    async ({ brandId, refresh }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const profile = await readBrandProfileMarkdown(brandId, { ensureExists: true, refresh: !!refresh })
      if (!profile) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

      return { content: [{ type: 'text' as const, text: profile.markdown }] }
    }
  )

  // ── refresh_brand_profile_markdown ─────────────────────────────────────
  server.tool(
    'refresh_brand_profile_markdown',
    'Regenerate brand profile markdown auto section from latest system data while preserving manual section.',
    {
      brandId: z.string().describe('Brand ID linked to this agent.'),
    },
    async ({ brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const refreshed = await refreshBrandProfileMarkdown(brandId)
      if (!refreshed) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, brandId, relativePath: refreshed.relativePath }, null, 2),
        }],
      }
    }
  )

  // ── update_brand_profile_markdown ──────────────────────────────────────
  server.tool(
    'update_brand_profile_markdown',
    'Write full brand context markdown for this brand. Use this for long-form brand context; brand-config does not support brandContext field.',
    {
      brandId: z.string().describe('Brand ID linked to this agent.'),
      markdown: z.string().describe('Full markdown content to persist as brand profile context.'),
    },
    async ({ brandId, markdown }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }
      if (!markdown.trim()) return { content: [{ type: 'text' as const, text: 'Error: markdown is required' }], isError: true }

      const saved = await writeBrandProfileMarkdown(brandId, markdown)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, brandId, relativePath: saved.relativePath }, null, 2),
        }],
      }
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
      larkParentFolderToken: z.string().optional(),
      larkDriveFolderId: z.string().optional(),
      larkBotWebhook: z.string().optional(),
      larkOwnerId: z.string().optional(),
    },
    async (input) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const { brandId } = input

      if (!brandId) {
        return { content: [{ type: 'text' as const, text: 'Error: Brand creation via MCP is disabled. Create brands from the dashboard.' }], isError: true }
      }

      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const WRITABLE = ['name', 'description', 'website', 'phone', 'address', 'location', 'timezone',
        'postfastApiKey', 'googlePlaceId', 'googleApiKey', 'larkAppId', 'larkAppSecret',
        'larkParentFolderToken', 'larkDriveFolderId', 'larkBotWebhook', 'larkOwnerId'] as const
      const updateData: Record<string, unknown> = {}
      if (input.name) updateData.name = input.name
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

      try {
        await refreshBrandProfileMarkdown(brandId)
      } catch {
        // non-fatal — profile refresh should not block config writes
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, updated: Object.keys(updateData), brandId }) }] }
    }
  )

  // ── get_agent_profile ───────────────────────────────────────────────────
  server.tool(
    'get_agent_profile',
    'Get this agent\'s own profile from AI Marketing Crew.',
    {},
    async () => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const safe = Object.fromEntries(
        Object.entries(agent).filter(([key]) => key !== 'password' && key !== 'apiKey' && key !== 'avatarData')
      )
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
      status: z.enum(['todo', 'in_progress', 'pending', 'done', 'archived', 'void']).optional(),
      assignedToMe: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional().default(20),
    },
    async ({ brandId, status, assignedToMe, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      if (brandId) {
        const link = await requireActiveBrandLink(brandId, agent.id)
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }
      }

      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (assignedToMe) where.assigneeId = agent.id
      if (!assignedToMe) where.assigneeId = agent.id
      if (brandId) where.brandId = brandId

      const tasks = await prisma.workUnit.findMany({
        where,
        take: limit ?? 20,
        orderBy: { createdAt: 'desc' },
        select: { id: true, brandId: true, title: true, description: true, status: true, priority: true, weight: true, assigneeId: true, createdAt: true },
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
      status: z.enum(['todo', 'in_progress', 'pending', 'void']).optional().default('todo'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
      weight: z.number().int().optional().describe('1 = light, 3 = normal, 5 = heavy'),
      requiredInput: z.string().optional().describe('What human input is needed when status is pending.'),
      deadline: z.string().optional().describe('ISO 8601 deadline e.g. 2026-05-21T12:00:00Z'),
      brandId: z.string().optional().describe('Brand ID. Required when this agent manages multiple brands.'),
    },
    async ({ title, description, status, priority, weight, requiredInput, deadline, brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      if (brandId) {
        const link = await requireActiveBrandLink(brandId, agent.id)
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }
      } else {
        const linkedBrandCount = await prisma.brandAgent.count({ where: { agentId: agent.id, active: true } })
        if (linkedBrandCount > 1) {
          return { content: [{ type: 'text' as const, text: 'Error: brandId is required when this agent manages multiple brands' }], isError: true }
        }
      }

      let parsedDeadline: Date | undefined
      if (deadline) {
        const d = new Date(deadline)
        if (Number.isNaN(d.getTime())) {
          return { content: [{ type: 'text' as const, text: 'Error: deadline must be a valid ISO 8601 datetime string' }], isError: true }
        }
        parsedDeadline = d
      }

      const task = await prisma.workUnit.create({
        data: {
          title,
          description: description || null,
          status: status || 'todo',
          priority: priority || 'medium',
          weight: [1, 3, 5].includes(weight ?? 0) ? weight! : 3,
          requiredInput: requiredInput || null,
          deadline: parsedDeadline,
          assigneeId: agent.id,
          brandId: brandId || null,
        },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, taskId: task.id, brandId: task.brandId, title: task.title, deadline: task.deadline }) }] }
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
      status: z.enum(['todo', 'in_progress', 'pending', 'done', 'archived', 'void']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      requiredInput: z.string().nullable().optional().describe('Set when pending; pass null/empty to clear.'),
      deadline: z.string().nullable().optional().describe('ISO 8601 deadline. Pass null to clear.'),
      brandId: z.string().nullable().optional().describe('Brand ID to assign this task to. Pass null to clear.'),
    },
    async ({ taskId, ...fields }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const existingTask = await requireOwnedTask(taskId, agent.id)
      if (!existingTask) return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      if (existingTask.assigneeId !== agent.id) return { content: [{ type: 'text' as const, text: 'Error: Task not assigned to this agent' }], isError: true }

      const requestedBrandId = fields.brandId === undefined ? existingTask.brandId : fields.brandId
      if (requestedBrandId) {
        const link = await requireActiveBrandLink(requestedBrandId, agent.id)
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }
      }

      const updateData: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updateData[k] = v
      }

      if (updateData.deadline !== undefined) {
        const deadlineVal = updateData.deadline
        if (deadlineVal === null || deadlineVal === '') {
          updateData.deadline = null
        } else {
          const d = new Date(String(deadlineVal))
          if (Number.isNaN(d.getTime())) {
            return { content: [{ type: 'text' as const, text: 'Error: deadline must be a valid ISO 8601 datetime string' }], isError: true }
          }
          updateData.deadline = d
        }
      }

      if (updateData.requiredInput !== undefined) {
        const ri = updateData.requiredInput
        if (ri === null || ri === '') updateData.requiredInput = null
      }

      if (updateData.brandId !== undefined) {
        const nextBrandId = updateData.brandId
        delete updateData.brandId
        updateData.brand = nextBrandId ? { connect: { id: String(nextBrandId) } } : { disconnect: true }
      }

      const task = await prisma.workUnit.update({ where: { id: taskId }, data: updateData })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, taskId: task.id, brandId: task.brandId, status: task.status, deadline: task.deadline }) }] }
    }
  )

  // ── update_accounts ─────────────────────────────────────────────────────
  server.tool(
    'update_accounts',
    'Add or update a social media account for a brand.',
    {
      brandId: z.string(),
      platformId: z.enum([
        'instagram', 'tiktok', 'xiaohongshu', 'facebook', 'youtube',
        'google', 'x', 'twitter', 'yelp', 'linkedin', 'pinterest',
        'weibo', 'wechat', 'snapchat', 'tripadvisor',
      ]),
      handle: z.string(),
      displayName: z.string().optional(),
      profileUrl: z.string().optional(),
      loginUsername: z.string().optional(),
      loginPassword: z.string().optional(),
    },
    async ({ brandId, platformId, handle, displayName, profileUrl, loginUsername, loginPassword }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

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
      type: z.enum(['sentiment_alert', 'content_draft', 'content_approval', 'competitor_alert', 'performance_update']),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
      title: z.string(),
      description: z.string().describe('Full content or action details'),
      platform: z.string().optional(),
    },
    async ({ brandId, type, priority, title, description }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const item = await prisma.actionItem.create({
        data: { brandId, type, priority: priority || 'medium', title, description, status: 'pending', agentId: agent.id },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, actionItemId: item.id }) }] }
    }
  )

  // ── Board Unified Publish/Info Tools (with deprecated postfast_* aliases) ──
  const requireBrandAgentLink = async (brandId: string, agentId: string) => {
    return prisma.brandAgent.findFirst({ where: { brandId, agentId, active: true } })
  }

  const getBrandPostfastKey = async (brandId: string) => {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true, name: true } })
    return { key: brand?.postfastApiKey ?? null, name: brand?.name ?? null }
  }

  const listAccountsSchema = { brandId: z.string() }
  const listAccountsHandler = async ({ brandId }: { brandId: string }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id)
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

    const { key } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured. Run update_brand_config first.' }], isError: true }

    const { postfastFetchAccounts } = await import('@/lib/integrations/postfast')
    const result = await postfastFetchAccounts(key)
    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: result.accounts.length, accounts: result.accounts }, null, 2) }] }
  }

  server.tool('board_list_social_accounts', 'List all connected social accounts for this brand via the board backend.', listAccountsSchema, listAccountsHandler)
  server.tool('list_accounts', '[Compatibility alias] Use board_list_social_accounts.', listAccountsSchema, listAccountsHandler)
  server.tool('postfast_list_accounts', '[Deprecated alias] Use board_list_social_accounts.', listAccountsSchema, listAccountsHandler)

  const listPostsSchema = {
    brandId: z.string(),
    status: z.enum(['scheduled', 'published', 'failed', 'draft']).optional().describe('Filter by post status'),
    platform: z.string().optional().describe('Filter by platform e.g. instagram, tiktok'),
    limit: z.number().int().min(1).max(50).optional().default(20),
  }
  const listPostsHandler = async ({ brandId, status, platform, limit }: { brandId: string; status?: 'scheduled' | 'published' | 'failed' | 'draft'; platform?: string; limit?: number }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id)
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

    const { key } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured.' }], isError: true }

    const { postfastListPosts } = await import('@/lib/integrations/postfast')
    const result = await postfastListPosts(key, { status, platform, limit: limit ?? 20 })
    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, total: result.total, posts: result.posts }, null, 2) }] }
  }

  server.tool('board_list_published_content', 'List scheduled/published content for this brand via the board backend.', listPostsSchema, listPostsHandler)
  server.tool('postfast_list_posts', '[Deprecated alias] Use board_list_published_content.', listPostsSchema, listPostsHandler)

  const deletePostSchema = {
    brandId: z.string(),
    postId: z.string().describe('Post ID from board_list_published_content'),
  }
  const deletePostHandler = async ({ brandId, postId }: { brandId: string; postId: string }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id)
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

    const { key } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured.' }], isError: true }

    const { postfastDeletePost } = await import('@/lib/integrations/postfast')
    const result = await postfastDeletePost(key, postId)
    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: true, postId }) }] }
  }

  server.tool('board_delete_scheduled_content', 'Delete a scheduled content item via the board backend.', deletePostSchema, deletePostHandler)
  server.tool('postfast_delete_post', '[Deprecated alias] Use board_delete_scheduled_content.', deletePostSchema, deletePostHandler)

  const uploadMediaSchema = {
    brandId: z.string(),
    filename: z.string().describe('File name with extension e.g. "photo.jpg"'),
    mimeType: z.string().describe('MIME type e.g. "image/jpeg", "video/mp4"'),
    fileBase64: z.string().describe('Base64-encoded file content (no data: prefix)'),
    sizeBytes: z.number().int().optional().describe('File size in bytes'),
  }
  const uploadMediaHandler = async ({ brandId, filename, mimeType, fileBase64, sizeBytes }: { brandId: string; filename: string; mimeType: string; fileBase64: string; sizeBytes?: number }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id)
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

    const { key } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured.' }], isError: true }

    const fileBuffer = Buffer.from(fileBase64, 'base64')
    const { postfastGetSignedUploadUrls, postfastUploadFile } = await import('@/lib/integrations/postfast')

    const urlResult = await postfastGetSignedUploadUrls(key, [{
      filename,
      mimeType,
      sizeBytes: sizeBytes ?? fileBuffer.length,
    }])
    if (!urlResult.success || urlResult.slots.length === 0) {
      return { content: [{ type: 'text' as const, text: `Error: Failed to get upload URL — ${urlResult.error}` }], isError: true }
    }

    const slot = urlResult.slots[0]
    const uploadResult = await postfastUploadFile(slot.uploadUrl, fileBuffer, mimeType)
    if (!uploadResult.success) {
      return { content: [{ type: 'text' as const, text: `Error: Upload failed — ${uploadResult.error}` }], isError: true }
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, storageKey: slot.storageKey, fileToken: slot.fileToken, filename, mimeType, tip: 'Pass storageKey in board_publish_content.mediaStorageKeys' }) }] }
  }

  server.tool('board_upload_media', 'Upload media through board backend and return storageKey for publish.', uploadMediaSchema, uploadMediaHandler)
  server.tool('upload_asset', '[Compatibility alias] Use board_upload_media.', uploadMediaSchema, uploadMediaHandler)
  server.tool('postfast_upload_media', '[Deprecated alias] Use board_upload_media.', uploadMediaSchema, uploadMediaHandler)

  const connectLinkSchema = {
    brandId: z.string(),
    label: z.string().optional().describe('Label shown on the connect page e.g. brand name'),
    redirectUrl: z.string().optional().describe('URL to redirect to after connection'),
  }
  const connectLinkHandler = async ({ brandId, label, redirectUrl }: { brandId: string; label?: string; redirectUrl?: string }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id)
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

    const { key, name } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured.' }], isError: true }

    const { postfastGenerateConnectLink } = await import('@/lib/integrations/postfast')
    const result = await postfastGenerateConnectLink(key, {
      label: label ?? name ?? undefined,
      redirectUrl,
    })
    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, connectUrl: result.connectUrl, tip: 'Share this URL with the brand owner to connect their accounts' }) }] }
  }

  server.tool('board_generate_account_connect_link', 'Generate a secure account-connect URL through board backend.', connectLinkSchema, connectLinkHandler)
  server.tool('connect_account', '[Compatibility alias] Use board_generate_account_connect_link.', connectLinkSchema, connectLinkHandler)
  server.tool('postfast_generate_connect_link', '[Deprecated alias] Use board_generate_account_connect_link.', connectLinkSchema, connectLinkHandler)

  const publishContentSchema = {
    brandId: z.string().describe('Brand ID — backend credentials are loaded automatically.'),
    platform: z.enum(['instagram', 'tiktok', 'xiaohongshu', 'facebook', 'youtube', 'x', 'linkedin', 'threads', 'bluesky', 'pinterest', 'snapchat', 'telegram', 'google'])
      .describe('Target platform'),
    caption: z.string().describe('Post caption / body text'),
    mediaStorageKeys: z.array(z.string()).optional().describe('Storage keys from board_upload_media (preferred over mediaUrls)'),
    mediaUrls: z.array(z.string()).optional().describe('Public image or video URLs (fallback when storage keys unavailable)'),
    hashtags: z.array(z.string()).optional().describe('Hashtags without the # prefix'),
    scheduledAt: z.string().optional().describe('ISO 8601 UTC datetime to schedule (omit = publish immediately)'),
    accountId: z.string().optional().describe('Specific account ID to post from'),
  }
  const publishContentHandler = async ({ brandId, platform, caption, mediaStorageKeys, mediaUrls, hashtags, scheduledAt, accountId }: { brandId: string; platform: 'instagram' | 'tiktok' | 'xiaohongshu' | 'facebook' | 'youtube' | 'x' | 'linkedin' | 'threads' | 'bluesky' | 'pinterest' | 'snapchat' | 'telegram' | 'google'; caption: string; mediaStorageKeys?: string[]; mediaUrls?: string[]; hashtags?: string[]; scheduledAt?: string; accountId?: string }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id)
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        postfastApiKey: true,
        googlePreferOAuth: true,
        googleRefreshToken: true,
        googleAccountId: true,
        googleLocationId: true,
      }
    })
    if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

    const isDirectGoogle = platform === 'google' && brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId

    let result: { success: boolean; postId?: string; url?: string; error?: string }

    if (isDirectGoogle) {
      try {
        const { getGoogleAccessToken, createGoogleGBPLocalPost } = await import('@/lib/integrations/google')
        const accessToken = await getGoogleAccessToken(brand.googleRefreshToken!)
        
        let googleAccountId = brand.googleAccountId || 'primary'
        let googleLocationId = brand.googleLocationId!
        
        if (accountId) {
          const targetAccount = await prisma.socialAccount.findFirst({
            where: { id: accountId, brandId },
            select: { platformId: true, handle: true },
          })
          if (targetAccount && targetAccount.platformId === 'google') {
            const handle = targetAccount.handle
            const match = handle.match(/accounts\/([^\/]+)\/locations\/([^\/]+)/)
            if (match) {
              googleAccountId = `accounts/${match[1]}`
              googleLocationId = match[2]
            } else {
              googleLocationId = handle
            }
          }
        }

        result = await createGoogleGBPLocalPost({
          accountId: googleAccountId,
          locationId: googleLocationId,
          caption,
          mediaUrls,
          accessToken,
        })
      } catch (e: unknown) {
        result = { success: false, error: errorMessage(e, 'Direct Google GBP publish failed') }
      }
    } else {
      if (!brand.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured for this brand. Run update_brand_config first.' }], isError: true }
      const { postfastPublish } = await import('@/lib/integrations/postfast')
      result = await postfastPublish({ apiKey: brand.postfastApiKey, platform, caption, mediaStorageKeys, mediaUrls, hashtags, scheduledAt, accountId })
    }

    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
    const responseContent: Array<{ type: 'text'; text: string }> = [
      { type: 'text' as const, text: JSON.stringify({ ok: true, postId: result.postId, url: result.url, platform, scheduledAt: isDirectGoogle ? 'immediate' : (scheduledAt ?? 'immediate') }) }
    ]
    const notice = getSkillUpdateNotice()
    if (notice) {
      responseContent.push({ type: 'text' as const, text: notice })
    }
    return { content: responseContent }
  }

  server.tool('publish', 'Publish or schedule content through board backend using stored brand config.', publishContentSchema, publishContentHandler)
  server.tool('board_publish_content', 'Publish or schedule content through board backend using stored brand config.', publishContentSchema, publishContentHandler)
  server.tool('postfast_publish', '[Deprecated alias] Use publish.', publishContentSchema, publishContentHandler)

  const replyReviewSchema = {
    brandId: z.string(),
    platform: z.enum(['google', 'yelp']).describe('Review platform'),
    reviewId: z.string().describe('Review ID from review listing API or source system'),
    replyText: z.string().describe('Reply message to post publicly'),
  }
  const replyReviewHandler = async ({ brandId, platform, reviewId, replyText }: { brandId: string; platform: 'google' | 'yelp'; reviewId: string; replyText: string }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id)
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

    const { key } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Review backend not configured for this brand.' }], isError: true }

    const { postfastReplyReview } = await import('@/lib/integrations/postfast')
    const result = await postfastReplyReview({ apiKey: key, platform, reviewId, replyText })

    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, platform, replied: true }) }] }
  }

  server.tool('board_reply_review', 'Reply to a review through board backend using stored brand config.', replyReviewSchema, replyReviewHandler)
  server.tool('reply_review', '[Compatibility alias] Use board_reply_review (google/yelp).', replyReviewSchema, replyReviewHandler)
  server.tool('postfast_reply_review', '[Deprecated alias] Use board_reply_review.', replyReviewSchema, replyReviewHandler)

  // ── google_get_reviews ──────────────────────────────────────────────────
  server.tool(
    'google_get_reviews',
    'Fetch the latest Google Business reviews for a brand. Returns reviewer, rating, comment, and existing reply.',
    {
      brandId: z.string().describe('Brand ID — googlePlaceId/googleApiKey (Places API) or googleRefreshToken (GBP OAuth2) are loaded from config.'),
      limit: z.number().int().min(1).max(20).optional().default(10),
    },
    async ({ brandId, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ 
        where: { id: brandId }, 
        select: { 
          googlePlaceId: true, 
          googleApiKey: true,
          googleRefreshToken: true,
          googleAccountId: true,
          googleLocationId: true,
          googlePreferOAuth: true,
        } 
      })

      if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

      const { fetchGoogleGBPReviews, fetchGoogleReviews, getGoogleAccessToken } = await import('@/lib/integrations/google')

      // Prioritize Direct Google Business Profile OAuth2 Flow
      if (brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
        try {
          const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
          const result = await fetchGoogleGBPReviews(brand.googleAccountId || 'primary', brand.googleLocationId, accessToken)
          if (result.error) return { content: [{ type: 'text' as const, text: `Error (GBP API): ${result.error}` }], isError: true }
          const reviews = result.reviews.slice(0, limit ?? 10)
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: reviews.length, reviews, source: 'google_business_profile_oauth' }, null, 2) }] }
        } catch (e: unknown) {
          console.error('[MCP Get Reviews] GBP OAuth flow failed, trying fallback...', e)
        }
      }

      // Fallback: Places API Key Flow
      if (brand.googlePlaceId && brand.googleApiKey) {
        const result = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)
        if (result.error) return { content: [{ type: 'text' as const, text: `Error (Places API): ${result.error}` }], isError: true }
        const reviews = result.reviews.slice(0, limit ?? 10)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: reviews.length, reviews, source: 'google_places_api_key' }, null, 2) }] }
      }

      return { content: [{ type: 'text' as const, text: 'Error: Google Business Profile (OAuth) or Google API Key + Place ID is not configured for this brand.' }], isError: true }
    }
  )
  server.tool(
    'get_reviews',
    '[Compatibility alias] Use google_get_reviews. Currently returns Google reviews only.',
    {
      brandId: z.string().describe('Brand ID'),
      limit: z.number().int().min(1).max(20).optional().default(10),
    },
    async ({ brandId, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: {
          googlePlaceId: true,
          googleApiKey: true,
          googleRefreshToken: true,
          googleAccountId: true,
          googleLocationId: true,
          googlePreferOAuth: true,
        },
      })

      if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

      const { fetchGoogleGBPReviews, fetchGoogleReviews, getGoogleAccessToken } = await import('@/lib/integrations/google')

      if (brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
        try {
          const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
          const result = await fetchGoogleGBPReviews(brand.googleAccountId || 'primary', brand.googleLocationId, accessToken)
          if (result.error) return { content: [{ type: 'text' as const, text: `Error (GBP API): ${result.error}` }], isError: true }
          const reviews = result.reviews.slice(0, limit ?? 10)
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: reviews.length, reviews, source: 'google_business_profile_oauth' }, null, 2) }] }
        } catch {
          // fallback below
        }
      }

      if (brand.googlePlaceId && brand.googleApiKey) {
        const result = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)
        if (result.error) return { content: [{ type: 'text' as const, text: `Error (Places API): ${result.error}` }], isError: true }
        const reviews = result.reviews.slice(0, limit ?? 10)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: reviews.length, reviews, source: 'google_places_api_key' }, null, 2) }] }
      }

      return { content: [{ type: 'text' as const, text: 'Error: Google Business Profile (OAuth) or Google API Key + Place ID is not configured for this brand.' }], isError: true }
    }
  )

  // ── google_reply_review ─────────────────────────────────────────────────
  server.tool(
    'google_reply_review',
    'Post a reply to a Google Business review. Uses direct Google API if OAuth is configured, otherwise PostFast.',
    {
      brandId: z.string(),
      reviewId: z.string().describe('Review ID from google_get_reviews'),
      replyText: z.string().describe('Public reply text (max ~4096 chars)'),
    },
    async ({ brandId, reviewId, replyText }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { 
          postfastApiKey: true, 
          googleRefreshToken: true,
          googleAccountId: true,
          googleLocationId: true,
          googlePreferOAuth: true,
        },
      })

      if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

      // Prioritize Direct Google Business Profile OAuth2 Flow
      if (brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
        try {
          const { getGoogleAccessToken, replyGoogleGBPReview } = await import('@/lib/integrations/google')
          const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
          const result = await replyGoogleGBPReview({
            accountId: brand.googleAccountId || 'primary',
            locationId: brand.googleLocationId,
            reviewId,
            replyText,
            accessToken,
          })
          if (!result.success) return { content: [{ type: 'text' as const, text: `Error (GBP API): ${result.error}` }], isError: true }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, via: 'direct_oauth' }) }] }
        } catch (e: unknown) {
          console.error('[MCP Reply Review] GBP OAuth flow failed...', e)
          return { content: [{ type: 'text' as const, text: `Error (GBP OAuth): ${errorMessage(e, 'Unknown error')}` }], isError: true }
        }
      }

      // Fallback: PostFast Route (handles OAuth for us)
      if (brand.postfastApiKey) {
        const { postfastReplyReview } = await import('@/lib/integrations/postfast')
        const result = await postfastReplyReview({ apiKey: brand.postfastApiKey, platform: 'google', reviewId, replyText })
        if (!result.success) return { content: [{ type: 'text' as const, text: `Error (PostFast API): ${result.error}` }], isError: true }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, via: 'postfast' }) }] }
      }

      return { content: [{ type: 'text' as const, text: 'Error: Google OAuth or PostFast API key required for Google review replies. Configure it in settings.' }], isError: true }
    }
  )

  // ── execute_brand_action ─────────────────────────────────────────────────
  server.tool(
    'execute_brand_action',
    'Execute a unified marketing or customer care action for a brand (replies, posts, notifications).',
    {
      brandId: z.string().describe('Brand ID to execute this action for'),
      actionType: z.enum(['reply_review', 'domestic_reply_review', 'lark_notify', 'publish_post'])
        .describe('Type of action to execute'),
      platform: z.string().optional().describe('Platform name e.g., "google", "yelp", "dianping", "meituan"'),
      reviewId: z.string().optional().describe('Review ID (required for replies)'),
      replyText: z.string().optional().describe('Reply comment (required for replies)'),
      title: z.string().optional().describe('Title of Lark message / post'),
      content: z.string().optional().describe('Markdown text for Lark notification'),
      actionUrl: z.string().optional().describe('Lark notification action button link'),
      urgent: z.boolean().optional().describe('Make Lark notification styling urgent'),
      caption: z.string().optional().describe('Social post caption'),
      mediaUrls: z.array(z.string()).optional().describe('Social post media URLs'),
      hashtags: z.array(z.string()).optional().describe('Social post hashtags without #'),
    },
    async ({ brandId, actionType, platform, reviewId, replyText, title, content, actionUrl, urgent, caption, mediaUrls, hashtags }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: {
          postfastApiKey: true,
          googleRefreshToken: true,
          googleAccountId: true,
          googleLocationId: true,
          googlePreferOAuth: true,
          larkBotWebhook: true,
          larkAppId: true,
          larkAppSecret: true,
          larkOwnerId: true,
        },
      })
      if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

      if (actionType === 'reply_review') {
        if (!platform || !reviewId || !replyText) {
          return { content: [{ type: 'text' as const, text: 'Error: platform, reviewId, and replyText are required for reply_review' }], isError: true }
        }

        const normalizedPlatform = platform.toLowerCase().trim()
        if (normalizedPlatform === 'google') {
          // Direct Google GBP OAuth reply if configured
          if (brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
            try {
              const { getGoogleAccessToken, replyGoogleGBPReview } = await import('@/lib/integrations/google')
              const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
              const result = await replyGoogleGBPReview({
                accountId: brand.googleAccountId || 'primary',
                locationId: brand.googleLocationId,
                reviewId,
                replyText,
                accessToken,
              })
              if (!result.success) return { content: [{ type: 'text' as const, text: `Error (GBP API): ${result.error}` }], isError: true }
              return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, via: 'direct_oauth' }) }] }
            } catch (e: unknown) {
              console.error('[execute_brand_action] GBP OAuth reply failed, falling back...', e)
            }
          }

          // Fallback to PostFast
          if (brand.postfastApiKey) {
            const { postfastReplyReview } = await import('@/lib/integrations/postfast')
            const result = await postfastReplyReview({ apiKey: brand.postfastApiKey, platform: 'google', reviewId, replyText })
            if (!result.success) return { content: [{ type: 'text' as const, text: `Error (PostFast API): ${result.error}` }], isError: true }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, via: 'postfast' }) }] }
          }
          return { content: [{ type: 'text' as const, text: 'Error: No credentials configured for Google reply.' }], isError: true }
        } else if (normalizedPlatform === 'yelp') {
          if (!brand.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key required for Yelp replies' }], isError: true }
          const { postfastReplyReview } = await import('@/lib/integrations/postfast')
          const result = await postfastReplyReview({ apiKey: brand.postfastApiKey, platform: 'yelp', reviewId, replyText })
          if (!result.success) return { content: [{ type: 'text' as const, text: `Error (PostFast API): ${result.error}` }], isError: true }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, via: 'postfast' }) }] }
        } else {
          return { content: [{ type: 'text' as const, text: `Error: Platform "${platform}" not supported for standard reply_review. Use domestic_reply_review.` }], isError: true }
        }
      }

      if (actionType === 'domestic_reply_review') {
        if (!platform || !reviewId || !replyText) {
          return { content: [{ type: 'text' as const, text: 'Error: platform, reviewId, and replyText are required for domestic_reply_review' }], isError: true }
        }
        try {
          const { sendExtensionCommand } = await import('@/lib/integrations/extensionBridge')
          
          // Log send command
          writeAuditLog({
            actor: actorFromContext(null, agent),
            action: 'EXTENSION_CMD_SEND',
            resourceId: brandId,
            resourceType: 'ExtensionBridge',
            reason: `AI 代理触发国内平台自动回复 (平台: ${platform}, 评论 ID: ${reviewId})。`,
          }).catch(console.error)

          const result = await sendExtensionCommand(brandId, 'domestic_reply_review', {
            platform,
            reviewId,
            replyText,
          })
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, result }) }] }
        } catch (e: unknown) {
          // Log send command error
          writeAuditLog({
            actor: actorFromContext(null, agent),
            action: 'EXTENSION_CMD_ERR',
            resourceId: brandId,
            resourceType: 'ExtensionBridge',
            reason: `AI 代理触发国内平台自动回复失败 (评论 ID: ${reviewId})。错误: ${errorMessage(e, String(e))}`,
          }).catch(console.error)
          return { content: [{ type: 'text' as const, text: `Error (Extension Bridge): ${errorMessage(e, String(e))}` }], isError: true }
        }
      }

      if (actionType === 'lark_notify') {
        if (!title || !content) {
          return { content: [{ type: 'text' as const, text: 'Error: title and content are required for lark_notify' }], isError: true }
        }
        if (!brand.larkBotWebhook && !brand.larkOwnerId) {
          return { content: [{ type: 'text' as const, text: 'Error: Lark notifications not configured' }], isError: true }
        }
        const { sendLarkWebhookNotification, sendLarkDirectMessage } = await import('@/lib/integrations/lark')
        let result: { success: boolean; error?: string }
        if (brand.larkBotWebhook) {
          result = await sendLarkWebhookNotification({ webhookUrl: brand.larkBotWebhook, title, content, actionUrl, urgent })
        } else {
          result = await sendLarkDirectMessage({
            appId: brand.larkAppId!,
            appSecret: brand.larkAppSecret!,
            ownerId: brand.larkOwnerId!,
            title, content, actionUrl, urgent,
          })
        }
        if (!result.success) return { content: [{ type: 'text' as const, text: `Error (Lark): ${result.error}` }], isError: true }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, channel: brand.larkBotWebhook ? 'webhook' : 'direct_message' }) }] }
      }

      if (actionType === 'publish_post') {
        if (!platform || !caption) {
          return { content: [{ type: 'text' as const, text: 'Error: platform and caption are required for publish_post' }], isError: true }
        }

        const isDirectGoogle = platform === 'google' && brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId
        let result: { success: boolean; postId?: string; url?: string; error?: string }

        if (isDirectGoogle) {
          try {
            const { getGoogleAccessToken, createGoogleGBPLocalPost } = await import('@/lib/integrations/google')
            const accessToken = await getGoogleAccessToken(brand.googleRefreshToken!)
            result = await createGoogleGBPLocalPost({
              accountId: brand.googleAccountId || 'primary',
              locationId: brand.googleLocationId!,
              caption,
              mediaUrls,
              accessToken,
            })
          } catch (e: unknown) {
            result = { success: false, error: errorMessage(e, 'Direct Google GBP publish failed') }
          }
        } else {
          if (!brand.postfastApiKey) {
            return { content: [{ type: 'text' as const, text: 'Error: PostFast API key required for publish_post' }], isError: true }
          }
          const { postfastPublish } = await import('@/lib/integrations/postfast')
          result = await postfastPublish({
            apiKey: brand.postfastApiKey,
            platform,
            caption,
            mediaUrls,
            hashtags,
          })
        }

        if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, postId: result.postId, url: result.url, platform }) }] }
      }

      return { content: [{ type: 'text' as const, text: 'Error: Unsupported action type' }], isError: true }
    }
  )

  // ── lark_notify ─────────────────────────────────────────────────────────
  server.tool(
    'lark_notify',
    'Send a notification to the brand owner via Lark/Feishu bot. Supports webhook (simple) and direct message modes.',
    {
      brandId: z.string().describe('Brand ID — Lark credentials are auto-loaded from brand config.'),
      title: z.string().describe('Card header title'),
      content: z.string().describe('Message body (Lark Markdown supported)'),
      actionUrl: z.string().optional().describe('Optional deep-link button URL, e.g. link to Kanban task'),
      urgent: z.boolean().optional().describe('Set true to render card in red (urgent alert)'),
    },
    async ({ brandId, title, content, actionUrl, urgent }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { larkBotWebhook: true, larkAppId: true, larkAppSecret: true, larkOwnerId: true },
      })

      if (!brand?.larkBotWebhook && !brand?.larkOwnerId) {
        return { content: [{ type: 'text' as const, text: 'Error: larkBotWebhook or larkOwnerId not configured. Run update_brand_config first.' }], isError: true }
      }

      const { sendLarkWebhookNotification, sendLarkDirectMessage } = await import('@/lib/integrations/lark')

      let result: { success: boolean; error?: string }

      if (brand.larkBotWebhook) {
        result = await sendLarkWebhookNotification({ webhookUrl: brand.larkBotWebhook, title, content, actionUrl, urgent })
      } else {
        result = await sendLarkDirectMessage({
          appId: brand.larkAppId!,
          appSecret: brand.larkAppSecret!,
          ownerId: brand.larkOwnerId!,
          title, content, actionUrl, urgent,
        })
      }

      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, channel: brand.larkBotWebhook ? 'webhook' : 'direct_message' }) }] }
    }
  )
  server.tool(
    'notify_owner',
    '[Compatibility alias] Use lark_notify.',
    {
      brandId: z.string().describe('Brand ID — Lark credentials are auto-loaded from brand config.'),
      title: z.string().describe('Card header title'),
      content: z.string().describe('Message body (Lark Markdown supported)'),
      actionUrl: z.string().optional().describe('Optional deep-link button URL, e.g. link to Kanban task'),
      urgent: z.boolean().optional().describe('Set true to render card in red (urgent alert)'),
    },
    async ({ brandId, title, content, actionUrl, urgent }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { larkBotWebhook: true, larkAppId: true, larkAppSecret: true, larkOwnerId: true },
      })

      if (!brand?.larkBotWebhook && !brand?.larkOwnerId) {
        return { content: [{ type: 'text' as const, text: 'Error: larkBotWebhook or larkOwnerId not configured. Run update_brand_config first.' }], isError: true }
      }

      const { sendLarkWebhookNotification, sendLarkDirectMessage } = await import('@/lib/integrations/lark')

      let result: { success: boolean; error?: string }
      if (brand.larkBotWebhook) {
        result = await sendLarkWebhookNotification({ webhookUrl: brand.larkBotWebhook, title, content, actionUrl, urgent })
      } else {
        result = await sendLarkDirectMessage({
          appId: brand.larkAppId!,
          appSecret: brand.larkAppSecret!,
          ownerId: brand.larkOwnerId!,
          title,
          content,
          actionUrl,
          urgent,
        })
      }

      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, channel: brand.larkBotWebhook ? 'webhook' : 'direct_message' }) }] }
    }
  )

  // ── lark_upload_file ────────────────────────────────────────────────────
  server.tool(
    'lark_upload_file',
    'Upload a file (image, PDF, video) to the brand\'s Lark Drive workspace. Returns a file token usable as asset URL.',
    {
      brandId: z.string(),
      filename: z.string().describe('File name including extension, e.g. "banner.jpg"'),
      mimeType: z.string().describe('MIME type e.g. "image/jpeg", "application/pdf"'),
      fileBase64: z.string().describe('Base64-encoded file content (without data: prefix)'),
      folderId: z.string().optional().describe('Lark folder token to upload into. Defaults to brand workspace root.'),
    },
    async ({ brandId, filename, mimeType, fileBase64, folderId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { larkAppId: true, larkAppSecret: true, larkDriveFolderId: true },
      })

      if (!brand?.larkAppId || !brand?.larkAppSecret) {
        return { content: [{ type: 'text' as const, text: 'Error: larkAppId and larkAppSecret not configured. Run update_brand_config first.' }], isError: true }
      }

      const targetFolder = folderId || brand.larkDriveFolderId
      if (!targetFolder) {
        return { content: [{ type: 'text' as const, text: 'Error: No Lark folder target. Either provide folderId or create a workspace first with lark_create_workspace.' }], isError: true }
      }

      const fileBuffer = Buffer.from(fileBase64, 'base64')
      const { uploadToLarkDrive } = await import('@/lib/integrations/lark')
      const result = await uploadToLarkDrive({
        appId: brand.larkAppId,
        appSecret: brand.larkAppSecret,
        folderId: targetFolder,
        filename,
        mimeType,
        fileBuffer,
      })

      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }

      await prisma.mediaAsset.create({
        data: {
          brandId,
          url: result.fileToken!,
          filename,
          mimeType,
          uploadedBy: agent.id,
          sourceType: 'mcp_lark_upload',
          aiReady: mimeType.startsWith('image/') || mimeType.startsWith('video/'),
        },
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, fileToken: result.fileToken, downloadUrl: result.downloadUrl, filename }) }] }
    }
  )

  // ── lark_create_workspace ───────────────────────────────────────────────
  server.tool(
    'lark_create_workspace',
    'Create a brand workspace folder in Lark Drive. Call once per brand. Returns folder token for future uploads.',
    {
      brandId: z.string(),
      parentFolderToken: z.string().optional().describe('Override parent folder. Defaults to the shared AI Workspaces root.'),
    },
    async ({ brandId, parentFolderToken }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { name: true, larkAppId: true, larkAppSecret: true },
      })

      if (!brand?.larkAppId || !brand?.larkAppSecret) {
        return { content: [{ type: 'text' as const, text: 'Error: larkAppId and larkAppSecret not configured. Run update_brand_config first.' }], isError: true }
      }

      const { createBrandWorkspace } = await import('@/lib/integrations/lark')
      const result = await createBrandWorkspace({
        appId: brand.larkAppId,
        appSecret: brand.larkAppSecret,
        parentFolderToken,
        brandName: brand.name,
      })

      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }

      // Persist folder token on brand for future uploads
      await prisma.brand.update({ where: { id: brandId }, data: { larkDriveFolderId: result.folderToken } })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, folderToken: result.folderToken, folderUrl: result.folderUrl }) }] }
    }
  )

  // ── Hot Topics tools ───────────────────────────────────────────────────
  server.tool(
    'board_list_topics',
    'List brand Hot Topics markdown documents. Use before content planning to avoid duplicate research and reuse research-agent findings.',
    {
      brandId: z.string(),
      q: z.string().optional().describe('Search title, summary, markdown, or exact tag.'),
      tag: z.string().optional().describe('Filter by one tag, with or without #.'),
      status: z.enum(['active', 'archived', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ brandId, q, tag, status, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const { listTopicFeeds } = await import('@/lib/topicFeed')
      const topics = await listTopicFeeds({ brandId, q, tag, status, limit })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: topics.length, topics }, null, 2) }] }
    }
  )

  server.tool(
    'board_get_topic',
    'Read one Hot Topics markdown document by ID.',
    {
      brandId: z.string(),
      topicId: z.string(),
    },
    async ({ brandId, topicId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const { getTopicFeed } = await import('@/lib/topicFeed')
      const topic = await getTopicFeed(brandId, topicId)
      if (!topic) return { content: [{ type: 'text' as const, text: 'Error: Topic not found' }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, topic }, null, 2) }] }
    }
  )

  server.tool(
    'board_save_topic',
    'Create or update a Hot Topics markdown research document for a brand. Intended for research AMC Agents.',
    {
      brandId: z.string(),
      topicId: z.string().optional().describe('Pass to update an existing topic. Omit to create a new topic.'),
      title: z.string().describe('Topic title'),
      markdown: z.string().describe('Markdown research document body'),
      summary: z.string().optional(),
      tags: z.array(z.string()).optional(),
      sourceUrl: z.string().optional(),
    },
    async ({ brandId, topicId, title, markdown, summary, tags, sourceUrl }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const { createTopicFeed, updateTopicFeed } = await import('@/lib/topicFeed')
      const result = topicId
        ? await updateTopicFeed({ brandId, topicId, title, markdown, summary, tags, sourceUrl, status: 'active' })
        : await createTopicFeed({ brandId, title, markdown, summary, tags, sourceUrl, createdById: agent.id, createdByType: 'AI_AGENT' })

      if (!result.ok) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, topic: result.topic }, null, 2) }] }
    }
  )

  server.tool(
    'board_archive_topic',
    'Archive a Hot Topics research document. This is a soft delete.',
    {
      brandId: z.string(),
      topicId: z.string(),
    },
    async ({ brandId, topicId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const { archiveTopicFeed } = await import('@/lib/topicFeed')
      const result = await archiveTopicFeed(brandId, topicId)
      if (!result.ok) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, topic: result.topic }, null, 2) }] }
    }
  )

  // ── Draft workflow tools ───────────────────────────────────────────────
  server.tool(
    'board_list_drafts',
    'List content drafts for a brand. Use status filters to find pending, scheduled, failed, or draft items.',
    {
      brandId: z.string(),
      status: z.string().optional().describe('draft, pending_review, scheduled, published, failed, etc.'),
      q: z.string().optional().describe('Search caption or exact hashtag.'),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ brandId, status, q, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const drafts = await prisma.contentDraft.findMany({
        where: {
          brandId,
          ...(status ? { status } : {}),
          ...(q ? { OR: [{ caption: { contains: q, mode: 'insensitive' } }, { hashtags: { has: q } }] } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: limit ?? 50,
        select: {
          id: true, caption: true, hashtags: true, scheduledAt: true, status: true, accountId: true,
          agentNote: true, rejectionNote: true, platformPostId: true, publishedAt: true, updatedAt: true,
          account: { select: { id: true, platformId: true, handle: true, displayName: true } },
          assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
        },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: drafts.length, drafts }, null, 2) }] }
    }
  )

  server.tool(
    'board_save_draft',
    'Create or update a brand content draft. Save first, then call board_submit_draft when ready.',
    {
      brandId: z.string(),
      draftId: z.string().optional().describe('Pass to update an existing draft. Omit to create a new draft.'),
      caption: z.string().optional().describe('Caption body. Required when creating a new draft.'),
      hashtags: z.array(z.string()).optional(),
      accountId: z.string().optional(),
      scheduledAt: z.string().optional().describe('ISO 8601 UTC datetime. Omit or empty for immediate publish on submit.'),
      mediaUrls: z.array(z.string()).optional(),
      assetIds: z.array(z.string()).optional().describe('MediaAsset IDs to attach to this draft.'),
      agentNote: z.string().optional(),
      captionLang: z.string().optional().default('en'),
    },
    async ({ brandId, draftId, caption, hashtags, accountId, scheduledAt, mediaUrls, assetIds, agentNote, captionLang }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      if (!draftId && (!caption || !caption.trim())) {
        return { content: [{ type: 'text' as const, text: 'Error: caption is required when creating a new draft' }], isError: true }
      }

      const parsedScheduledAt = scheduledAt ? new Date(scheduledAt) : null
      if (scheduledAt && Number.isNaN(parsedScheduledAt?.getTime())) {
        return { content: [{ type: 'text' as const, text: 'Error: scheduledAt must be an ISO 8601 datetime' }], isError: true }
      }

      const draft = await prisma.$transaction(async (tx) => {
        let savedId: string

        if (draftId) {
          const existingDraft = await tx.contentDraft.findFirst({ where: { id: draftId, brandId } })
          if (!existingDraft) {
            throw new Error('Draft not found')
          }

          const updateData: Record<string, unknown> = {
            status: 'draft',
            rejectionNote: null,
          }
          if (caption !== undefined) updateData.caption = caption.trim()
          if (captionLang !== undefined) updateData.captionLang = captionLang
          if (accountId !== undefined) updateData.accountId = accountId || null
          if (scheduledAt !== undefined) updateData.scheduledAt = parsedScheduledAt
          if (hashtags !== undefined) updateData.hashtags = hashtags
          if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls
          if (agentNote !== undefined) updateData.agentNote = agentNote || null

          const updated = await tx.contentDraft.update({
            where: { id: draftId },
            data: updateData,
            select: { id: true },
          })
          savedId = updated.id
        } else {
          const created = await tx.contentDraft.create({
            data: {
              brandId,
              caption: caption!.trim(),
              hashtags: hashtags ?? [],
              accountId: accountId || null,
              scheduledAt: parsedScheduledAt,
              mediaUrls: mediaUrls ?? [],
              agentNote: agentNote ?? null,
              captionLang: captionLang || 'en',
              status: 'draft',
              agentId: agent.id,
            },
            select: { id: true },
          })
          savedId = created.id
        }

        if (assetIds) {
          await tx.contentAssetRef.deleteMany({ where: { draftId: savedId } })
          if (assetIds.length > 0) {
            const validAssets = await tx.mediaAsset.findMany({ where: { brandId, id: { in: assetIds } }, select: { id: true } })
            await Promise.all(validAssets.map((asset, order) => tx.contentAssetRef.create({ data: { draftId: savedId, assetId: asset.id, order } })))
          }
        }

        return tx.contentDraft.findUniqueOrThrow({
          where: { id: savedId },
          include: { account: { select: { id: true, platformId: true, handle: true, displayName: true } }, assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } } },
        })
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, draft }, null, 2) }] }
    }
  )

  server.tool(
    'board_submit_draft',
    'Submit a saved draft. Auto-pilot brands publish/schedule directly; boss-approval brands create a pending review ActionItem.',
    {
      brandId: z.string(),
      draftId: z.string(),
      note: z.string().optional(),
    },
    async ({ brandId, draftId, note }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const { submitDraftForDelivery } = await import('@/lib/draftSubmission')
      const result = await submitDraftForDelivery({ brandId, draftId, actorId: agent.id, note: note || null })
      if (!result.ok) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    }
  )

  // ── Asset library tools ────────────────────────────────────────────────
  server.tool(
    'board_list_assets',
    'List brand media assets from the board asset library.',
    {
      brandId: z.string(),
      q: z.string().optional(),
      folder: z.string().optional().describe('Maps to aiCategory/folder.'),
      readyOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ brandId, q, folder, readyOnly, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const assets = await prisma.mediaAsset.findMany({
        where: {
          brandId,
          ...(readyOnly ? { aiReady: true } : {}),
          ...(folder ? { aiCategory: folder } : {}),
          ...(q ? { OR: [{ filename: { contains: q, mode: 'insensitive' } }, { aiCaption: { contains: q, mode: 'insensitive' } }, { aiTags: { has: q } }] } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: limit ?? 50,
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: assets.length, assets }, null, 2) }] }
    }
  )

  server.tool(
    'board_upload_asset',
    'Upload an asset into the board asset library. Production requires Huawei OBS; development can use local fallback.',
    {
      brandId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      fileBase64: z.string().describe('Base64 content without data: prefix.'),
      folder: z.string().optional(),
      aiTags: z.array(z.string()).optional(),
      aiCaption: z.string().optional(),
    },
    async ({ brandId, filename, mimeType, fileBase64, folder, aiTags, aiCaption }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const fileBuffer = Buffer.from(fileBase64, 'base64')
      const category = folder || '素材库'
      const { getHuaweiObsConfig, makeBrandAssetKey, uploadHuaweiObsObject } = await import('@/lib/integrations/huaweiObs')
      const obsConfig = getHuaweiObsConfig()

      let assetUrl: string
      let storageEngine: string
      let storageKey: string | undefined
      const isProduction = process.env.NODE_ENV === 'production'

      if (obsConfig) {
        const key = makeBrandAssetKey({ brandId, folder: category, filename })
        const uploadResult = await uploadHuaweiObsObject({ key, body: fileBuffer, contentType: mimeType })
        if (!uploadResult.ok) return { content: [{ type: 'text' as const, text: `Error: ${uploadResult.error || 'Huawei OBS upload failed'}` }], isError: true }
        assetUrl = uploadResult.url
        storageEngine = 'huawei_obs'
        storageKey = uploadResult.key
      } else if (isProduction) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: OSS is not configured. Configure HUAWEI_OBS_* (or OBS_*) variables in production.',
          }],
          isError: true,
        }
      } else {
        const { mkdir, writeFile } = await import('node:fs/promises')
        const { join: joinPath, extname, basename } = await import('node:path')
        const ext = extname(filename)
        const base = basename(filename, ext).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
        const safeName = `${base}-${Date.now()}${ext || ''}`
        const relativeDir = joinPath('uploads', 'brand-assets', brandId)
        const absoluteDir = joinPath(process.cwd(), 'public', relativeDir)
        await mkdir(absoluteDir, { recursive: true })
        await writeFile(joinPath(absoluteDir, safeName), fileBuffer)
        assetUrl = `/${relativeDir.replace(/\\/g, '/')}/${safeName}`
        storageEngine = 'local'
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          brandId,
          url: assetUrl,
          filename,
          mimeType,
          sizeBytes: fileBuffer.length,
          aiTags: aiTags ?? [],
          aiCategory: category,
          aiCaption: aiCaption || null,
          aiReady: true,
          uploadedBy: agent.id,
          sourceType: storageEngine,
        },
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, assetId: asset.id, assetUrl, storageEngine, storageKey, asset }, null, 2) }] }
    }
  )

  // ── Additional Asset & Draft tools ──────────────────────────────────────
  server.tool(
    'board_get_asset',
    'Retrieve metadata and URL of a specific media asset from the brand\'s asset library by asset ID.',
    {
      brandId: z.string(),
      assetId: z.string(),
    },
    async ({ brandId, assetId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const asset = await prisma.mediaAsset.findFirst({
        where: { id: assetId, brandId },
      })
      if (!asset) return { content: [{ type: 'text' as const, text: 'Error: Asset not found' }], isError: true }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, asset }, null, 2) }] }
    }
  )

  server.tool(
    'board_update_asset',
    'Edit/update properties of a brand media asset, such as its name, category (folder), caption, tags, or ready status.',
    {
      brandId: z.string(),
      assetId: z.string(),
      filename: z.string().optional(),
      folder: z.string().optional().describe('Maps to aiCategory/folder.'),
      aiCaption: z.string().optional(),
      aiTags: z.array(z.string()).optional(),
      aiReady: z.boolean().optional(),
    },
    async ({ brandId, assetId, filename, folder, aiCaption, aiTags, aiReady }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const existing = await prisma.mediaAsset.findFirst({
        where: { id: assetId, brandId },
        select: { id: true },
      })
      if (!existing) return { content: [{ type: 'text' as const, text: 'Error: Asset not found' }], isError: true }

      const data: Record<string, unknown> = {}
      if (filename !== undefined) data.filename = filename.trim() || null
      if (folder !== undefined) data.aiCategory = folder.trim() || '素材库'
      if (aiCaption !== undefined) data.aiCaption = aiCaption.trim() || null
      if (aiTags !== undefined) data.aiTags = aiTags
      if (aiReady !== undefined) data.aiReady = aiReady

      const asset = await prisma.mediaAsset.update({
        where: { id: assetId },
        data,
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, asset }, null, 2) }] }
    }
  )

  server.tool(
    'board_delete_asset',
    'Soft-delete (archive) a brand media asset by setting its folder to \'archived\' and ready status to false.',
    {
      brandId: z.string(),
      assetId: z.string(),
    },
    async ({ brandId, assetId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const existing = await prisma.mediaAsset.findFirst({
        where: { id: assetId, brandId },
        select: { id: true },
      })
      if (!existing) return { content: [{ type: 'text' as const, text: 'Error: Asset not found' }], isError: true }

      await prisma.mediaAsset.update({
        where: { id: assetId },
        data: { aiCategory: 'archived', aiReady: false },
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, archived: true, assetId }) }] }
    }
  )

  server.tool(
    'board_get_draft',
    'Read the details of a single content draft by its ID.',
    {
      brandId: z.string(),
      draftId: z.string(),
    },
    async ({ brandId, draftId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const draft = await prisma.contentDraft.findFirst({
        where: { id: draftId, brandId },
        include: {
          account: { select: { id: true, platformId: true, handle: true, displayName: true } },
          assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
        },
      })
      if (!draft) return { content: [{ type: 'text' as const, text: 'Error: Draft not found' }], isError: true }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, draft }, null, 2) }] }
    }
  )

  server.tool(
    'board_delete_draft',
    'Delete a content draft from the database. If scheduled, cancels the scheduling on PostFast first.',
    {
      brandId: z.string(),
      draftId: z.string(),
    },
    async ({ brandId, draftId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const draft = await prisma.contentDraft.findFirst({
        where: { id: draftId, brandId },
      })
      if (!draft) return { content: [{ type: 'text' as const, text: 'Error: Draft not found' }], isError: true }

      // If scheduled, try to cancel first
      if (draft.platformPostId && !draft.publishedAt) {
        const brand = await prisma.brand.findUnique({
          where: { id: brandId },
          select: { postfastApiKey: true }
        })
        if (brand?.postfastApiKey) {
          const { postfastDeletePost } = await import('@/lib/integrations/postfast')
          const cancelResult = await postfastDeletePost(brand.postfastApiKey, draft.platformPostId)
          if (!cancelResult.success) {
            return { content: [{ type: 'text' as const, text: `Error: Failed to cancel scheduled post on board backend — ${cancelResult.error}` }], isError: true }
          }
        }
      }

      await prisma.contentDraft.delete({ where: { id: draftId } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: true, draftId }) }] }
    }
  )

  return server
}
