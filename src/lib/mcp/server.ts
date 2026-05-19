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
            larkAppId: true, larkAppSecret: true, larkParentFolderToken: true, larkDriveFolderId: true,
            larkBotWebhook: true, larkOwnerId: true,
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
      larkParentFolderToken: z.string().optional(),
      larkDriveFolderId: z.string().optional(),
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
        'larkParentFolderToken', 'larkDriveFolderId', 'larkBotWebhook', 'larkOwnerId'] as const
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

  // ── postfast_list_accounts ──────────────────────────────────────────────
  server.tool(
    'postfast_list_accounts',
    'List all social media accounts connected to this brand\'s PostFast workspace.',
    {
      brandId: z.string(),
    },
    async ({ brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
      if (!brand?.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key not configured. Run update_brand_config first.' }], isError: true }

      const { postfastFetchAccounts } = await import('@/lib/integrations/postfast')
      const result = await postfastFetchAccounts(brand.postfastApiKey)
      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: result.accounts.length, accounts: result.accounts }, null, 2) }] }
    }
  )

  // ── postfast_list_posts ─────────────────────────────────────────────────
  server.tool(
    'postfast_list_posts',
    'List scheduled or published social media posts in this brand\'s PostFast workspace.',
    {
      brandId: z.string(),
      status: z.enum(['scheduled', 'published', 'failed', 'draft']).optional().describe('Filter by post status'),
      platform: z.string().optional().describe('Filter by platform e.g. instagram, tiktok'),
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    async ({ brandId, status, platform, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
      if (!brand?.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key not configured.' }], isError: true }

      const { postfastListPosts } = await import('@/lib/integrations/postfast')
      const result = await postfastListPosts(brand.postfastApiKey, { status, platform, limit: limit ?? 20 })
      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, total: result.total, posts: result.posts }, null, 2) }] }
    }
  )

  // ── postfast_delete_post ────────────────────────────────────────────────
  server.tool(
    'postfast_delete_post',
    'Cancel and delete a scheduled post from PostFast. Only works on posts with status=scheduled.',
    {
      brandId: z.string(),
      postId: z.string().describe('PostFast post ID from postfast_list_posts'),
    },
    async ({ brandId, postId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
      if (!brand?.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key not configured.' }], isError: true }

      const { postfastDeletePost } = await import('@/lib/integrations/postfast')
      const result = await postfastDeletePost(brand.postfastApiKey, postId)
      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: true, postId }) }] }
    }
  )

  // ── postfast_upload_media ───────────────────────────────────────────────
  server.tool(
    'postfast_upload_media',
    'Upload a media file (image/video) to PostFast. Returns a storageKey to attach to postfast_publish. Use this for better quality than direct URLs.',
    {
      brandId: z.string(),
      filename: z.string().describe('File name with extension e.g. "photo.jpg"'),
      mimeType: z.string().describe('MIME type e.g. "image/jpeg", "video/mp4"'),
      fileBase64: z.string().describe('Base64-encoded file content (no data: prefix)'),
      sizeBytes: z.number().int().optional().describe('File size in bytes (helps PostFast allocate storage)'),
    },
    async ({ brandId, filename, mimeType, fileBase64, sizeBytes }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
      if (!brand?.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key not configured.' }], isError: true }

      const fileBuffer = Buffer.from(fileBase64, 'base64')
      const { postfastGetSignedUploadUrls, postfastUploadFile } = await import('@/lib/integrations/postfast')

      // Step 1: Get signed upload URL
      const urlResult = await postfastGetSignedUploadUrls(brand.postfastApiKey, [{
        filename,
        mimeType,
        sizeBytes: sizeBytes ?? fileBuffer.length,
      }])
      if (!urlResult.success || urlResult.slots.length === 0) {
        return { content: [{ type: 'text' as const, text: `Error: Failed to get upload URL — ${urlResult.error}` }], isError: true }
      }

      const slot = urlResult.slots[0]

      // Step 2: Upload file
      const uploadResult = await postfastUploadFile(slot.uploadUrl, fileBuffer, mimeType)
      if (!uploadResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: Upload failed — ${uploadResult.error}` }], isError: true }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, storageKey: slot.storageKey, fileToken: slot.fileToken, filename, mimeType, tip: 'Pass storageKey in postfast_publish.mediaStorageKeys' }) }] }
    }
  )

  // ── postfast_generate_connect_link ──────────────────────────────────────
  server.tool(
    'postfast_generate_connect_link',
    'Generate a secure PostFast connect link so brand owners can link their social accounts without a PostFast login.',
    {
      brandId: z.string(),
      label: z.string().optional().describe('Label shown on the connect page e.g. brand name'),
      redirectUrl: z.string().optional().describe('URL to redirect to after connection'),
    },
    async ({ brandId, label, redirectUrl }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true, name: true } })
      if (!brand?.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key not configured.' }], isError: true }

      const { postfastGenerateConnectLink } = await import('@/lib/integrations/postfast')
      const result = await postfastGenerateConnectLink(brand.postfastApiKey, {
        label: label ?? brand.name,
        redirectUrl,
      })
      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, connectUrl: result.connectUrl, tip: 'Share this URL with the brand owner to connect their accounts' }) }] }
    }
  )

  // ── postfast_publish ────────────────────────────────────────────────────
  server.tool(
    'postfast_publish',
    'Publish or schedule a social media post via PostFast. For best quality, upload media first with postfast_upload_media and pass the storageKey here.',
    {
      brandId: z.string().describe('Brand ID — PostFast API key is read from brand config automatically.'),
      platform: z.enum(['instagram', 'tiktok', 'xiaohongshu', 'facebook', 'youtube', 'x', 'linkedin', 'threads', 'bluesky', 'pinterest', 'snapchat', 'telegram', 'google'])
        .describe('Target platform'),
      caption: z.string().describe('Post caption / body text'),
      mediaStorageKeys: z.array(z.string()).optional().describe('Storage keys from postfast_upload_media (preferred over mediaUrls)'),
      mediaUrls: z.array(z.string()).optional().describe('Public image or video URLs (fallback when storage keys unavailable)'),
      hashtags: z.array(z.string()).optional().describe('Hashtags without the # prefix'),
      scheduledAt: z.string().optional().describe('ISO 8601 UTC datetime to schedule (omit = publish immediately)'),
      accountId: z.string().optional().describe('Specific PostFast account ID to post from (from postfast_list_accounts)'),
    },
    async ({ brandId, platform, caption, mediaStorageKeys, mediaUrls, hashtags, scheduledAt, accountId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
      if (!brand?.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key not configured for this brand. Run update_brand_config first.' }], isError: true }

      const { postfastPublish } = await import('@/lib/integrations/postfast')
      const result = await postfastPublish({ apiKey: brand.postfastApiKey, platform, caption, mediaStorageKeys, mediaUrls, hashtags, scheduledAt, accountId })

      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, postId: result.postId, url: result.url, platform, scheduledAt: scheduledAt ?? 'immediate' }) }] }
    }
  )

  // ── postfast_reply_review ───────────────────────────────────────────────
  server.tool(
    'postfast_reply_review',
    'Reply to a Google or Yelp review via PostFast. Credentials are auto-loaded from brand config.',
    {
      brandId: z.string(),
      platform: z.enum(['google', 'yelp']).describe('Review platform'),
      reviewId: z.string().describe('Review ID from google_get_reviews or external source'),
      replyText: z.string().describe('Reply message to post publicly'),
    },
    async ({ brandId, platform, reviewId, replyText }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
      if (!brand?.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: PostFast API key not configured for this brand.' }], isError: true }

      const { postfastReplyReview } = await import('@/lib/integrations/postfast')
      const result = await postfastReplyReview({ apiKey: brand.postfastApiKey, platform, reviewId, replyText })

      if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, platform, replied: true }) }] }
    }
  )

  // ── google_get_reviews ──────────────────────────────────────────────────
  server.tool(
    'google_get_reviews',
    'Fetch the latest Google Business reviews for a brand. Returns reviewer, rating, comment, and existing reply.',
    {
      brandId: z.string().describe('Brand ID — googlePlaceId and googleApiKey are auto-loaded from brand config.'),
      limit: z.number().int().min(1).max(20).optional().default(10),
    },
    async ({ brandId, limit }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: agent.id, active: true } })
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked to this agent' }], isError: true }

      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { googlePlaceId: true, googleApiKey: true } })
      if (!brand?.googlePlaceId || !brand?.googleApiKey) {
        return { content: [{ type: 'text' as const, text: 'Error: googlePlaceId and googleApiKey not configured for this brand. Run update_brand_config first.' }], isError: true }
      }

      const { fetchGoogleReviews } = await import('@/lib/integrations/google')
      const result = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)

      if (result.error) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
      const reviews = result.reviews.slice(0, limit ?? 10)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: reviews.length, reviews }, null, 2) }] }
    }
  )

  // ── google_reply_review ─────────────────────────────────────────────────
  server.tool(
    'google_reply_review',
    'Post a reply to a Google Business review. Uses PostFast if configured (recommended), otherwise direct Google API.',
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
        select: { postfastApiKey: true, googlePlaceId: true },
      })

      // Prefer PostFast route (handles OAuth for us)
      if (brand?.postfastApiKey) {
        const { postfastReplyReview } = await import('@/lib/integrations/postfast')
        const result = await postfastReplyReview({ apiKey: brand.postfastApiKey, platform: 'google', reviewId, replyText })
        if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, via: 'postfast' }) }] }
      }

      return { content: [{ type: 'text' as const, text: 'Error: PostFast API key required for Google review replies. Configure it in update_brand_config.' }], isError: true }
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

      const targetFolder = folderId || (brand as any).larkDriveFolderId
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

  return server
}
