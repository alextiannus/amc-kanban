/**
 * AI Marketing Crew — MCP Server definition
 *
 * Personal MCP capabilities exposed as tools for the connected user.
 * Uses WebStandardStreamableHTTPServerTransport (Web Fetch API compatible).
 *
 * NOTE: server.tool() takes a raw ZodRawShape (plain object of zod types),
 * NOT a z.object(). The SDK wraps it internally.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { authenticateApiKey, type AuthPrincipal } from '@/lib/auth-v2'
import { canUserAccessBrand } from '@/lib/user-management/brandAccess'
import { postfastFetchAccounts } from '@/lib/integrations/postfast'
import { writeAuditLog, actorFromContext } from '@/lib/audit'
import { readBrandProfileMarkdown, refreshBrandProfileMarkdown, writeBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'
import { growthPathsForBrandPatch, queueBrandGrowthSync, syncBrandGrowthState } from '@/lib/brandGrowthSync'
import {
  BrandPlanError,
  getBrandPlan,
  runBrandPlanAction,
  type BrandPlanWorkspaceData,
} from '@/lib/brand-plan/service'

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
      return `[SYSTEM NOTICE] AMC operating instructions were updated:
1. 1. Use the connected user's Personal API Key; never send x-agent-id.
2. Operate only brands returned by get_brand_config (Capability + Crew scope).
3. Work directly on drafts, assets, reviews, ActionItems and publishing resources.
4. Request human input with post_action_item; do not create new WorkUnit tasks.
5. Every write is recorded with the connected user in the shared work log.`
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
  const principal = await authenticateApiKey(key)
  if (!principal) return null
  return prisma.user.findUnique({ where: { id: principal.userId } })
}

async function requireActiveBrandLink(
  brandId: string,
  agentId: string,
  action: 'READ' | 'WRITE' = 'READ',
) {
  return (await canUserAccessBrand(brandId, agentId, action)) ? { id: 'granted' } : null
}

async function requireOwnedTask(taskId: string, agentId: string) {
  return prisma.workUnit.findFirst({ where: { id: taskId, assigneeId: agentId }, select: { id: true, assigneeId: true, brandId: true } })
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

function brandPlanErrorResult(error: unknown, fallback: string) {
  const status = error instanceof BrandPlanError ? error.status : 500
  const message = error instanceof Error ? error.message : fallback
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, status, error: message }) }],
    isError: true,
  }
}

function normalizeCalendarPlatform(platform: string) {
  const value = platform.toLowerCase().trim()
  if (['google_business', 'google business', 'google_business_profile', 'google maps', 'gbp', 'gmb'].includes(value)) return 'google'
  if (['rednote', 'red', 'xhs', 'redbook'].includes(value)) return 'xiaohongshu'
  return value
}

function pickCalendarMonth(plan: BrandPlanWorkspaceData, fallback?: string) {
  if (fallback && /^\d{4}-\d{2}$/.test(fallback)) return fallback
  const firstMonth = plan.annualPlan?.quarterlyPlans
    ?.flatMap((quarter) => quarter.monthlyFocus || [])
    ?.map((item) => item.month)
    ?.find((month) => /^\d{4}-\d{2}$/.test(month))
  if (firstMonth) return firstMonth
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function marketingPlanPeriodLabel(plan: NonNullable<BrandPlanWorkspaceData['annualPlan']>) {
  const quarters = plan.quarterlyPlans || []
  const first = quarters[0]
  const last = quarters[quarters.length - 1]
  if (first?.startMonth && last?.endMonth) return `${first.startMonth}_${last.endMonth}`
  if (first?.periodLabel && last?.periodLabel) return `${first.periodLabel}_${last.periodLabel}`
  return plan.theme || plan.goal || 'brand_marketing_plan'
}

async function ensureCalendarAccount(brandId: string, platform: string) {
  const platformId = normalizeCalendarPlatform(platform)
  const account = await prisma.socialAccount.findFirst({
    where: { brandId, platformId },
    orderBy: { updatedAt: 'desc' },
  })
  if (account) return account
  return prisma.socialAccount.create({
    data: {
      brandId,
      platformId,
      handle: 'unconfigured',
      displayName: platformId === 'xiaohongshu'
        ? '小红书 / Rednote (未配置)'
        : `${platformId.charAt(0).toUpperCase()}${platformId.slice(1)} (未配置)`,
    },
  })
}

function accountHandleFromExternal(account: any, platformId: string) {
  const handle = String(account?.handle || account?.username || account?.displayName || '').trim()
  return handle || `unconfigured-${platformId}`
}

function calendarItemBrief(item: any, brandName: string) {
  return [
    `Brand: ${brandName}`,
    `Content title: ${item.title}`,
    `Platform: ${item.platform}`,
    `Content type: ${item.contentType}`,
    `Selling point: ${item.product}`,
    `Planning: ${item.planning}`,
    `Opening reference: ${item.sampleHit}`,
    Array.isArray(item.materialRequirements) && item.materialRequirements.length
      ? `Material requirements: ${item.materialRequirements.join('; ')}`
      : '',
    'Write publish-ready social copy. Avoid internal planning labels, AI wording, generic claims, and unverified guarantees.',
  ].filter(Boolean).join('\n')
}

async function createDraftsFromCalendarItems(input: {
  brandId: string
  actor: { id: string; type?: string | null; role?: string | null }
  brandName: string
  items: any[]
  limit: number
  assetIds?: string[]
}) {
  const { generateContentDirect } = await import('@/lib/amc-content/contentGenerationService')
  const { normalizeContentPlatform } = await import('@/lib/amc-content/platforms')
  const selectedItems = input.items.slice(0, input.limit)
  const results = await Promise.all(selectedItems.map(async (item) => {
    const platformId = normalizeCalendarPlatform(String(item.platformSlug || item.platform || 'instagram'))
    const account = await ensureCalendarAccount(input.brandId, platformId)
    let caption = ''
    let hashtags: string[] = []
    let provenance: unknown = null
    let generationError: string | null = null
    const contentPlatform = normalizeContentPlatform(platformId)

    try {
      const generated = await generateContentDirect({
        brandId: input.brandId,
        platform: contentPlatform,
        theme: calendarItemBrief(item, input.brandName),
        mediaUrls: [],
        assetIds: input.assetIds || [],
        actorId: input.actor.id,
        actorType: input.actor.type || 'HUMAN',
        actorRole: input.actor.role || 'USER',
      })
      caption = generated.caption || ''
      hashtags = generated.hashtags || []
      provenance = generated.provenance
    } catch (error) {
      generationError = errorMessage(error, 'amc-content generation failed')
      caption = [
        item.title,
        item.planning,
        item.sampleHit,
      ].filter(Boolean).join('\n\n')
    }

    const scheduledAt = item.date ? new Date(item.date) : null
    const draft = await prisma.contentDraft.create({
      data: {
        brandId: input.brandId,
        accountId: account.id,
        caption: caption.trim(),
        captionLang: platformId === 'xiaohongshu' ? 'zh' : 'en',
        hashtags,
        scheduledAt: scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt : null,
        status: generationError ? 'failed' : 'draft',
        agentId: input.actor.id,
        agentNote: [
          `Created from brand publishing calendar item ${item.id || ''}`.trim(),
          generationError ? `amc-content generation failed: ${generationError}` : 'amc-content direct generation succeeded.',
        ].join('\n'),
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        accountId: true,
        caption: true,
        hashtags: true,
        agentNote: true,
      },
    })

    if (input.assetIds?.length) {
      const validAssets = await prisma.mediaAsset.findMany({
        where: { brandId: input.brandId, id: { in: input.assetIds } },
        select: { id: true },
      })
      await Promise.all(validAssets.map((asset: { id: string }, order: number) =>
        prisma.contentAssetRef.create({ data: { draftId: draft.id, assetId: asset.id, order } }),
      ))
    }

    return {
      calendarItemId: item.id,
      platform: platformId,
      accountId: account.id,
      draft,
      generation: generationError
        ? { ok: false, error: generationError }
        : { ok: true, provenance },
    }
  }))
  return {
    ok: results.every((item) => item.generation.ok),
    count: results.length,
    results,
  }
}

// ── Build and return a configured McpServer ────────────────────────────────
export function createAmcMcpServer(auth: AuthPrincipal | string, credentialToken?: string) {
  const server = new McpServer({
    name: 'amc-kanban',
    version: '1.0.0',
  })
  const agentApiKey = typeof auth === 'string' ? auth : credentialToken ?? ''

  let principalPromise: Promise<AuthPrincipal | null> | null = null
  const resolvePrincipal = () => {
    if (!principalPromise) {
      principalPromise =
        typeof auth === 'string' ? authenticateApiKey(auth) : Promise.resolve(auth)
    }
    return principalPromise
  }

  const resolveAgent = async () => {
    const principal = await resolvePrincipal()
    if (!principal) return null
    const agent = await prisma.user.findUnique({ where: { id: principal.userId } })
    if (!agent || agent.status !== 'ACTIVE') return null
    return agent
  }

  // ── get_brand_config ────────────────────────────────────────────────────
  server.tool(
    'get_brand_config',
    'Get brand config and linked social accounts for brands this personal MCP user can access.',
    {
      brandId: z.string().optional().describe('Specific brand ID. Omit to list all linked brands.'),
    },
    async ({ brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      if (brandId) {
        const link = await requireActiveBrandLink(brandId, agent.id)
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }
        const brand = await prisma.brand.findUnique({
          where: { id: brandId },
          select: {
            id: true, name: true, description: true, website: true, phone: true,
            address: true, location: true, timezone: true, autoPilot: true,
            postfastApiKey: true,
            googlePlaceId: true,
            googleApiKey: true,
            accounts: { select: { id: true, platformId: true, handle: true, displayName: true, autoPilot: true } },
          },
        })
        if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

        const {
          postfastApiKey,
          googleApiKey,
          ...publicBrand
        } = brand

        const safeBrand = {
          ...publicBrand,
          postfastConfigured: !!postfastApiKey,
          googleConfigured: !!publicBrand.googlePlaceId && !!googleApiKey,
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(safeBrand, null, 2) }] }
      }

      const links = await prisma.crewMember.findMany({
        where: {
          userId: agent.id,
          active: true,
          crew: {
            brand: {
              status: { not: 'ARCHIVED' },
              subscriptions: {
                some: {
                  status: 'ACTIVE',
                  OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
                },
              },
            },
          },
        },
        include: {
          crew: {
            include: {
              brand: {
                select: {
                  id: true, name: true, description: true, location: true, timezone: true, autoPilot: true,
                  accounts: { select: { id: true, platformId: true, handle: true, autoPilot: true } },
                },
              },
            },
          },
        },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(links.map((l: any) => l.crew.brand), null, 2) }] }
    }
  )

  // ── get_brand_profile_markdown ─────────────────────────────────────────
  server.tool(
    'get_brand_profile_markdown',
    'Read brand profile markdown for AI pre-read context. Contains brand basics, positioning, multi-store structure, and social platform config.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      refresh: z.boolean().optional().describe('When true, regenerate the auto snapshot section before reading.'),
    },
    async ({ brandId, refresh }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
      brandId: z.string().describe('Brand ID linked to this user.'),
    },
    async ({ brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
      brandId: z.string().describe('Brand ID linked to this user.'),
      markdown: z.string().describe('Full markdown content to persist as brand profile context.'),
    },
    async ({ brandId, markdown }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }
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
    },
    async (input) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const { brandId } = input

      if (!brandId) {
        return { content: [{ type: 'text' as const, text: 'Error: Brand creation via MCP is disabled. Create brands from the dashboard.' }], isError: true }
      }

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const WRITABLE = ['name', 'description', 'website', 'phone', 'address', 'location', 'timezone',
        'postfastApiKey', 'googlePlaceId', 'googleApiKey'] as const
      const updateData: Record<string, unknown> = {}
      if (input.name) updateData.name = input.name
      for (const key of WRITABLE) {
        const val = (input as Record<string, unknown>)[key]
        if (val !== undefined && val !== '') updateData[key] = val
      }

      const growthDirtyPaths = growthPathsForBrandPatch(updateData)
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.brand.update({ where: { id: brandId }, data: updateData })
        if (growthDirtyPaths.length) {
          await queueBrandGrowthSync({
            brandId,
            dirtyPaths: growthDirtyPaths,
            actor: { id: agent.id, email: agent.email, type: 'HUMAN', roles: [agent.role] },
            tx,
          })
        }
      })
      if (growthDirtyPaths.length) await syncBrandGrowthState(brandId)

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

            // Prune stale accounts: delete any account that is not in the PostFast synced accounts list,
            // unless it's a direct Google Business Profile account.
            try {
              const postfastPlatformHandles = pfResult.accounts.map((acc: any) => ({
                platformId: acc.platformId,
                handle: acc.handle
              }))

              const dbAccounts = await prisma.socialAccount.findMany({
                where: { brandId },
                select: { id: true, platformId: true, handle: true }
              })

              const brandInfo = await prisma.brand.findUnique({
                where: { id: brandId },
                select: { googlePreferOAuth: true, googleRefreshToken: true, googleLocationId: true }
              })

              const isDirectGoogleConfigured = brandInfo?.googlePreferOAuth && brandInfo?.googleRefreshToken && brandInfo?.googleLocationId

              const accountsToDelete = dbAccounts.filter((dbAcc: any) => {
                if (dbAcc.platformId === 'google' && isDirectGoogleConfigured) {
                  return false
                }
                const isMatched = postfastPlatformHandles.some((pfAcc: any) => 
                  pfAcc.platformId.toLowerCase() === dbAcc.platformId.toLowerCase() &&
                  pfAcc.handle.toLowerCase() === dbAcc.handle.toLowerCase()
                )
                return !isMatched
              })

              if (accountsToDelete.length > 0) {
                const idsToDelete = accountsToDelete.map((a: any) => a.id)
                await prisma.socialAccount.deleteMany({
                  where: { id: { in: idsToDelete } }
                })
                console.log(`[MCP Sync] Deleted ${accountsToDelete.length} stale social accounts for brand ${brandId}`)
              }
            } catch (pruneErr) {
              console.warn('[MCP Sync] Failed to prune stale social accounts:', pruneErr)
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
    'Get this user\'s own profile from AI Marketing Crew.',
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
    'List Kanban work units. Filter by brandId, status, or tasks assigned to this user.',
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
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }
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
      brandId: z.string().optional().describe('Brand ID. Required when this user can access multiple brands.'),
    },
    async ({ title, description, status, priority, weight, requiredInput, deadline, brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      if (brandId) {
        const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }
      } else {
        const linkedBrandCount = await prisma.crewMember.count({ where: { userId: agent.id, active: true } })
        if (linkedBrandCount > 1) {
          return { content: [{ type: 'text' as const, text: 'Error: brandId is required when this user can access multiple brands' }], isError: true }
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
      if (existingTask.assigneeId !== agent.id) return { content: [{ type: 'text' as const, text: 'Error: Task not assigned to this user' }], isError: true }

      const requestedBrandId = fields.brandId === undefined ? existingTask.brandId : fields.brandId
      if (requestedBrandId) {
        const link = await requireActiveBrandLink(requestedBrandId, agent.id, 'WRITE')
        if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }
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

  // ── delete_task ─────────────────────────────────────────────────────────
  const deleteTaskSchema = {
    taskId: z.string().describe('The ID of the task to delete'),
  }
  const deleteTaskHandler = async ({ taskId }: { taskId: string }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const existingTask = await requireOwnedTask(taskId, agent.id)
    if (!existingTask) return { content: [{ type: 'text' as const, text: 'Error: Task not found or not assigned to this user' }], isError: true }

    await prisma.workUnit.delete({
      where: { id: taskId },
    })

    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: true, taskId }) }] }
  }

  server.tool('board_delete_task', 'Delete a work unit task assigned to this user.', deleteTaskSchema, deleteTaskHandler)
  server.tool('delete_task', '[Compatibility alias] Use board_delete_task.', deleteTaskSchema, deleteTaskHandler)

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

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const item = await prisma.actionItem.create({
        data: { brandId, type, priority: priority || 'medium', title, description, status: 'pending', agentId: agent.id },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, actionItemId: item.id }) }] }
    }
  )

  // ── Board Unified Publish/Info Tools (with deprecated postfast_* aliases) ──
  const requireBrandAgentLink = async (
    brandId: string,
    agentId: string,
    action: 'READ' | 'WRITE' = 'READ',
  ) => {
    return (await canUserAccessBrand(brandId, agentId, action)) ? { id: 'granted' } : null
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
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

    const { key } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured. Run update_brand_config first.' }], isError: true }

    const { postfastFetchAccounts } = await import('@/lib/integrations/postfast')
    const result = await postfastFetchAccounts(key)
    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }

    const localAccounts = await prisma.socialAccount.findMany({
      where: { brandId },
      select: { id: true, platformId: true, handle: true, displayName: true, profileUrl: true, followerCount: true },
    })
    const localByPlatformHandle = new Map<string, (typeof localAccounts)[number]>(localAccounts.map((account: (typeof localAccounts)[number]) => [
      `${normalizeCalendarPlatform(account.platformId)}:${account.handle.toLowerCase()}`,
      account,
    ]))

    const externalAccounts = Array.isArray(result.accounts) ? result.accounts as any[] : []
    const accounts = externalAccounts.map((account: any) => {
      const platformId = normalizeCalendarPlatform(String(account.platformId || account.platform || ''))
      const handle = accountHandleFromExternal(account, platformId)
      const local = localByPlatformHandle.get(`${platformId}:${handle.toLowerCase()}`)
      return {
        ...account,
        id: local?.id ?? `unconfigured_${platformId}`,
        localAccountId: local?.id ?? null,
        externalAccountId: account.id,
        platformId,
        handle,
        displayName: local?.displayName || account.displayName || handle,
        profileUrl: local?.profileUrl || account.profileUrl || null,
        followerCount: local?.followerCount ?? account.followerCount,
        mcpDraftReady: Boolean(local),
      }
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: accounts.length, accounts }, null, 2) }] }
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
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

    const link = await requireBrandAgentLink(brandId, agent.id, 'WRITE')
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

    const link = await requireBrandAgentLink(brandId, agent.id, 'WRITE')
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

    const link = await requireBrandAgentLink(brandId, agent.id, 'WRITE')
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

    const link = await requireBrandAgentLink(brandId, agent.id, 'WRITE')
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        postfastApiKey: true,
      }
    })
    if (!brand) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }

    if (!brand.postfastApiKey) return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured for this brand. Run update_brand_config first.' }], isError: true }
    const { postfastPublish } = await import('@/lib/integrations/postfast')
    const result = await postfastPublish({ apiKey: brand.postfastApiKey, platform, caption, mediaStorageKeys, mediaUrls, hashtags, scheduledAt, accountId })

    if (!result.success) {
      const payload = result.code
        ? { code: result.code, error: result.error, issues: result.issues || [] }
        : { error: result.error }
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError: true }
    }
    const responseContent: Array<{ type: 'text'; text: string }> = [
      { type: 'text' as const, text: JSON.stringify({ ok: true, postId: result.postId, url: result.url, platform, scheduledAt: scheduledAt ?? 'immediate' }) }
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
    platform: z.enum(['google', 'yelp', 'instagram', 'tiktok', 'xiaohongshu', 'dianping', 'meituan']).describe('Review platform'),
    reviewId: z.string().describe('Review ID from review listing API or source system'),
    replyText: z.string().describe('Reply message to post publicly'),
  }
  const replyReviewHandler = async ({ 
    brandId, 
    platform, 
    reviewId, 
    replyText 
  }: { 
    brandId: string; 
    platform: 'google' | 'yelp' | 'instagram' | 'tiktok' | 'xiaohongshu' | 'dianping' | 'meituan'; 
    reviewId: string; 
    replyText: string 
  }) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

    const link = await requireBrandAgentLink(brandId, agent.id, 'WRITE')
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

    if (['instagram', 'tiktok', 'xiaohongshu', 'dianping', 'meituan'].includes(platform)) {
      try {
        const { sendExtensionCommand } = await import('@/lib/integrations/extensionBridge')
        
        writeAuditLog({
          actor: actorFromContext(null, agent),
          action: 'EXTENSION_CMD_SEND',
          resourceId: brandId,
          resourceType: 'ExtensionBridge',
          reason: `AI 代理通过社媒/国内平台自动回复 (平台: ${platform}, 评论 ID: ${reviewId})。`,
        }).catch(console.error)

        const result = await sendExtensionCommand(brandId, 'domestic_reply_review', {
          platform,
          reviewId,
          replyText,
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, platform, reviewId, replied: true, result }) }] }
      } catch (e: unknown) {
        writeAuditLog({
          actor: actorFromContext(null, agent),
          action: 'EXTENSION_CMD_ERR',
          resourceId: brandId,
          resourceType: 'ExtensionBridge',
          reason: `AI 代理通过社媒/国内平台自动回复失败 (评论 ID: ${reviewId})。错误: ${errorMessage(e, String(e))}`,
        }).catch(console.error)
        return { content: [{ type: 'text' as const, text: `Error (Extension Bridge): ${errorMessage(e, String(e))}` }], isError: true }
      }
    }

    const { key } = await getBrandPostfastKey(brandId)
    if (!key) return { content: [{ type: 'text' as const, text: 'Error: Review backend not configured for this brand.' }], isError: true }

    const { postfastReplyReview } = await import('@/lib/integrations/postfast')
    const result = await postfastReplyReview({ apiKey: key, platform: platform as 'google' | 'yelp', reviewId, replyText })

    if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, reviewId, platform, replied: true }) }] }
  }

  server.tool('board_reply_review', 'Reply to a review through board backend using stored brand config.', replyReviewSchema, replyReviewHandler)
  server.tool('reply_review', '[Compatibility alias] Use board_reply_review.', replyReviewSchema, replyReviewHandler)
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

      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
      actionType: z.enum(['reply_review', 'domestic_reply_review', 'publish_post'])
        .describe('Type of action to execute'),
      platform: z.string().optional().describe('Platform name e.g., "google", "yelp", "dianping", "meituan"'),
      reviewId: z.string().optional().describe('Review ID (required for replies)'),
      replyText: z.string().optional().describe('Reply comment (required for replies)'),
      caption: z.string().optional().describe('Social post caption'),
      mediaUrls: z.array(z.string()).optional().describe('Social post media URLs'),
      hashtags: z.array(z.string()).optional().describe('Social post hashtags without #'),
    },
    async ({ brandId, actionType, platform, reviewId, replyText, caption, mediaUrls, hashtags }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
        } else if (['instagram', 'tiktok', 'xiaohongshu', 'dianping', 'meituan'].includes(normalizedPlatform)) {
          try {
            const { sendExtensionCommand } = await import('@/lib/integrations/extensionBridge')
            
            writeAuditLog({
              actor: actorFromContext(null, agent),
              action: 'EXTENSION_CMD_SEND',
              resourceId: brandId,
              resourceType: 'ExtensionBridge',
              reason: `AI 代理通过社媒/国内平台自动回复 (平台: ${normalizedPlatform}, 评论 ID: ${reviewId})。`,
            }).catch(console.error)

            const result = await sendExtensionCommand(brandId, 'domestic_reply_review', {
              platform: normalizedPlatform,
              reviewId,
              replyText,
            })
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, result }) }] }
          } catch (e: unknown) {
            writeAuditLog({
              actor: actorFromContext(null, agent),
              action: 'EXTENSION_CMD_ERR',
              resourceId: brandId,
              resourceType: 'ExtensionBridge',
              reason: `AI 代理通过社媒/国内平台自动回复失败 (评论 ID: ${reviewId})。错误: ${errorMessage(e, String(e))}`,
            }).catch(console.error)
            return { content: [{ type: 'text' as const, text: `Error (Extension Bridge): ${errorMessage(e, String(e))}` }], isError: true }
          }
        } else {
          return { content: [{ type: 'text' as const, text: `Error: Platform "${platform}" not supported for reply_review.` }], isError: true }
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

      if (actionType === 'publish_post') {
        if (!platform || !caption) {
          return { content: [{ type: 'text' as const, text: 'Error: platform and caption are required for publish_post' }], isError: true }
        }

        if (!brand.postfastApiKey) {
          return { content: [{ type: 'text' as const, text: 'Error: PostFast API key required for publish_post' }], isError: true }
        }
        const { postfastPublish } = await import('@/lib/integrations/postfast')
        const result = await postfastPublish({
          apiKey: brand.postfastApiKey,
          platform,
          caption,
          mediaUrls,
          hashtags,
        })

        if (!result.success) {
          const payload = result.code
            ? { code: result.code, error: result.error, issues: result.issues || [] }
            : { error: result.error }
          return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError: true }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, postId: result.postId, url: result.url, platform }) }] }
      }

      return { content: [{ type: 'text' as const, text: 'Error: Unsupported action type' }], isError: true }
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
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const { getTopicFeed } = await import('@/lib/topicFeed')
      const topic = await getTopicFeed(brandId, topicId)
      if (!topic) return { content: [{ type: 'text' as const, text: 'Error: Topic not found' }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, topic }, null, 2) }] }
    }
  )

  server.tool(
    'board_save_topic',
    'Create or update a Hot Topics markdown research document for a brand. Intended for users running research workflows.',
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
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const { createTopicFeed, updateTopicFeed } = await import('@/lib/topicFeed')
      const result = topicId
        ? await updateTopicFeed({ brandId, topicId, title, markdown, summary, tags, sourceUrl, status: 'active' })
        : await createTopicFeed({ brandId, title, markdown, summary, tags, sourceUrl, createdById: agent.id, createdByType: 'HUMAN' })

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
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
          coverAsset: true,
          assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
        },
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: drafts.length, drafts }, null, 2) }] }
    }
  )

  server.tool(
    'board_save_draft',
    'Create or update a brand content draft. Save first. To schedule content, call board_get_schedule_recommendation BEFORE board_submit_draft — never set a time yourself. Agents must NOT hardcode scheduledAt.',
    {
      brandId: z.string(),
      draftId: z.string().optional().describe('Pass to update an existing draft. Omit to create a new draft.'),
      caption: z.string().optional().describe('Caption body. Required when creating a new draft.'),
      hashtags: z.array(z.string()).optional(),
      accountId: z.string().optional().describe('Platform account ID. Required when creating a new draft.'),
      mediaUrls: z.array(z.string()).optional(),
      assetIds: z.array(z.string()).optional().describe('MediaAsset IDs to attach to this draft.'),
      coverAssetId: z.string().nullable().optional().describe('Optional JPEG/PNG MediaAsset ID to use as the draft cover. Pass null to clear it.'),
      agentNote: z.string().optional(),
      captionLang: z.string().optional().default('en'),
      creativeHooks: z.string().optional(),
    },
    async ({ brandId, draftId, caption, hashtags, accountId, mediaUrls, assetIds, coverAssetId, agentNote, captionLang, creativeHooks }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      if (caption !== undefined && (!caption || !caption.trim())) {
        return { content: [{ type: 'text' as const, text: 'Error: caption cannot be empty' }], isError: true }
      }
      if (accountId !== undefined && (!accountId || !accountId.trim())) {
        return { content: [{ type: 'text' as const, text: 'Error: accountId is required (platform must be determined)' }], isError: true }
      }

      let resolvedAccountId = accountId?.trim()
      if (resolvedAccountId) {
        if (resolvedAccountId.startsWith('unconfigured_')) {
          const platformId = resolvedAccountId.replace('unconfigured_', '')
          const account = await ensureCalendarAccount(brandId, platformId)
          resolvedAccountId = account.id
        } else {
          const localAccount = await prisma.socialAccount.findFirst({
            where: { id: resolvedAccountId, brandId },
            select: { id: true },
          })
          if (!localAccount) {
            const { key } = await getBrandPostfastKey(brandId)
            if (!key) {
              return { content: [{ type: 'text' as const, text: 'Error: Publishing backend not configured. Cannot resolve accountId.' }], isError: true }
            }
            const { postfastFetchAccounts } = await import('@/lib/integrations/postfast')
            const result = await postfastFetchAccounts(key)
            if (!result.success) {
              return { content: [{ type: 'text' as const, text: `Error: Cannot resolve accountId: ${result.error}` }], isError: true }
            }
            const externalAccount = result.accounts.find((account: any) => account.id === resolvedAccountId)
            if (!externalAccount) {
              return { content: [{ type: 'text' as const, text: 'Error: accountId was not found for this brand' }], isError: true }
            }
            const platformId = normalizeCalendarPlatform(String(externalAccount.platformId || externalAccount.platform || ''))
            const handle = accountHandleFromExternal(externalAccount, platformId)
            const account = await prisma.socialAccount.upsert({
              where: { brandId_platformId_handle: { brandId, platformId, handle } },
              create: {
                brandId,
                platformId,
                handle,
                displayName: externalAccount.displayName || handle,
                profileUrl: externalAccount.profileUrl || null,
                followerCount: typeof externalAccount.followerCount === 'number' ? externalAccount.followerCount : null,
              },
              update: {
                displayName: externalAccount.displayName || handle,
                profileUrl: externalAccount.profileUrl || null,
                followerCount: typeof externalAccount.followerCount === 'number' ? externalAccount.followerCount : undefined,
              },
              select: { id: true },
            })
            resolvedAccountId = account.id
          }
        }
      }

      if (!draftId) {
        if (!caption || !caption.trim()) {
          return { content: [{ type: 'text' as const, text: 'Error: caption is required when creating a new draft' }], isError: true }
        }
        if (!resolvedAccountId) {
          return { content: [{ type: 'text' as const, text: 'Error: accountId is required when creating a new draft' }], isError: true }
        }
      }

      if (coverAssetId) {
        const coverAsset = await prisma.mediaAsset.findFirst({
          where: { id: coverAssetId, brandId, mimeType: { in: ['image/jpeg', 'image/png'] } },
          select: { id: true },
        })
        if (!coverAsset) {
          return { content: [{ type: 'text' as const, text: 'Error: coverAssetId must reference a JPEG or PNG image in this brand' }], isError: true }
        }
      }

      const draft = await prisma.$transaction(async (tx: any) => {
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
          if (accountId !== undefined) updateData.accountId = resolvedAccountId
          // scheduledAt intentionally NOT accepted from agent — use board_get_schedule_recommendation
          if (hashtags !== undefined) updateData.hashtags = hashtags
          if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls
          if (coverAssetId !== undefined) updateData.coverAssetId = coverAssetId
          if (agentNote !== undefined) updateData.agentNote = agentNote || null
          if (creativeHooks !== undefined) updateData.creativeHooks = creativeHooks || null

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
              accountId: resolvedAccountId || null,
              scheduledAt: null, // Always null on save — set by board_get_schedule_recommendation
              mediaUrls: mediaUrls ?? [],
              coverAssetId: coverAssetId ?? null,
              agentNote: agentNote ?? null,
              captionLang: captionLang || 'en',
              creativeHooks: creativeHooks ?? null,
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
            await Promise.all(validAssets.map((asset: any, order: any) => tx.contentAssetRef.create({ data: { draftId: savedId, assetId: asset.id, order } })))
          }
        }

        return tx.contentDraft.findUniqueOrThrow({
          where: { id: savedId },
          include: { account: { select: { id: true, platformId: true, handle: true, displayName: true } }, coverAsset: true, assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } } },
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
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const { submitDraftForDelivery } = await import('@/lib/draftSubmission')
      const result = await submitDraftForDelivery({ brandId, draftId, actorId: agent.id, note: note || null })
      if (!result.ok) {
        const payload = 'code' in result
          ? { code: result.code, error: result.error, issues: result.issues || [] }
          : { error: result.error }
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    }
  )

  // ── Scheduling recommendation tool ─────────────────────────────────────────
  server.tool(
    'board_get_schedule_recommendation',
    'Get the recommended publish time for a brand on a given platform. MUST be called before board_submit_draft when scheduling content. Uses the unified smart scheduling algorithm (respects minimum gap between posts, preferred time slots). Do NOT hardcode scheduledAt — always use this tool.',
    {
      brandId: z.string(),
      platform: z.string().nullable().optional().describe('Platform ID (e.g. instagram, xiaohongshu). Null = cross-platform aggregate.'),
      numberOfPosts: z.number().int().min(1).max(10).optional().default(1).describe('How many consecutive posts to schedule. Returns N recommended time slots.'),
      urgency: z.enum(['normal', 'urgent']).optional().default('normal'),
    },
    async ({ brandId, platform, numberOfPosts, urgency }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const data = await getSchedulingRecommendations({
        brandId,
        platform: platform ?? null,
        urgency: urgency ?? 'normal',
        count: numberOfPosts ?? 1,
      })
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            recommendations: data.recommendations,
            instruction: 'Use recommendations[0].recommendedAt as scheduledAt when calling board_submit_draft. Prefer the recommended slot; only use alternativeSlots if the user requests a different time.',
          }, null, 2),
        }],
      }
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
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
    'Upload an asset into the board asset library by providing base64 data OR a direct image URL. Production requires Huawei OBS; development can use local fallback.',
    {
      brandId: z.string(),
      filename: z.string(),
      mimeType: z.string().optional().describe('Optional MIME type of the file. If omitted with imageUrl, it is resolved from the server response headers.'),
      fileBase64: z.string().optional().describe('Base64 content without data: prefix.'),
      imageUrl: z.string().optional().describe('Direct URL of the image/asset to download.'),
      folder: z.string().optional(),
      aiTags: z.array(z.string()).optional(),
      aiCaption: z.string().optional(),
    },
    async ({ brandId, filename, mimeType, fileBase64, imageUrl, folder, aiTags, aiCaption }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      if (!fileBase64 && !imageUrl) {
        return { content: [{ type: 'text' as const, text: 'Error: Either fileBase64 or imageUrl must be provided' }], isError: true }
      }

      let fileBuffer: Buffer
      let resolvedMimeType = mimeType

      if (fileBase64) {
        fileBuffer = Buffer.from(fileBase64, 'base64')
        resolvedMimeType = resolvedMimeType || 'application/octet-stream'
      } else {
        try {
          const res = await fetch(imageUrl!)
          if (!res.ok) {
            return { content: [{ type: 'text' as const, text: `Error: Failed to fetch image from URL: HTTP ${res.status}` }], isError: true }
          }
          fileBuffer = Buffer.from(await res.arrayBuffer())
          resolvedMimeType = resolvedMimeType || res.headers.get('content-type') || 'application/octet-stream'
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `Error: Exception downloading image: ${errorMessage(err, 'Exception downloading image')}` }], isError: true }
        }
      }

      const category = folder || '素材库'
      let technicalMetadata
      try {
        const { assertUploadMedia, inspectMediaBuffer } = await import('@/lib/mediaValidation')
        technicalMetadata = await inspectMediaBuffer(fileBuffer, { filename, mimeType: resolvedMimeType })
        assertUploadMedia(technicalMetadata, { filename })
        resolvedMimeType = technicalMetadata.mimeType
      } catch (error) {
        const { mediaValidationResponse } = await import('@/lib/mediaValidation')
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(mediaValidationResponse(error)) }],
          isError: true,
        }
      }

      const { getHuaweiObsConfig, makeBrandAssetKey, uploadHuaweiObsObject } = await import('@/lib/integrations/huaweiObs')
      const obsConfig = getHuaweiObsConfig()

      let assetUrl: string
      let storageEngine: string
      let storageKey: string | undefined
      const isProduction = process.env.NODE_ENV === 'production'

      if (obsConfig) {
        const key = makeBrandAssetKey({ brandId, folder: category, filename })
        const uploadResult = await uploadHuaweiObsObject({ key, body: fileBuffer, contentType: resolvedMimeType })
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
          mimeType: resolvedMimeType,
          sizeBytes: fileBuffer.length,
          width: technicalMetadata.width ?? null,
          height: technicalMetadata.height ?? null,
          technicalMetadata,
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
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
    'Delete a brand media asset completely from the database and disk storage.',
    {
      brandId: z.string(),
      assetId: z.string(),
    },
    async ({ brandId, assetId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const asset = await prisma.mediaAsset.findFirst({
        where: { id: assetId, brandId },
        select: { id: true, url: true, sourceType: true },
      })
      if (!asset) return { content: [{ type: 'text' as const, text: 'Error: Asset not found' }], isError: true }

      // If local storage, delete local file from disk
      if (asset.sourceType === 'local' && asset.url.startsWith('/uploads/')) {
        try {
          const { unlink } = await import('node:fs/promises')
          const { join } = await import('node:path')
          const absolutePath = join(process.cwd(), 'public', asset.url)
          await unlink(absolutePath)
        } catch (err) {
          console.error('[MCP board_delete_asset] Failed to delete local file from disk:', err)
        }
      }

      await prisma.mediaAsset.delete({
        where: { id: assetId },
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: true, assetId }) }] }
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
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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

  // ── v2.0 Onboarding & Skill Tools ────────────────────────────────────────

  server.tool(
    'get_brand_subscription',
    'Get brand subscription details and included services.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
    },
    async ({ brandId }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const subscription = await prisma.brandSubscription.findFirst({
        where: {
          brandId,
          status: 'ACTIVE',
          OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!subscription) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              plan_name: 'NONE',
              included_services: [],
              monthly_content_quota: 0,
              platform_coverage: [],
              reply_sla: 'none',
              ad_management: false,
              kol_management: false,
              autopilot_eligible: false,
              status: 'EXPIRED'
            }, null, 2)
          }]
        }
      }

      const { SUBSCRIPTION_PLANS } = await import('@/lib/subscription/catalog')
      const planId = subscription.planId
      const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId)
      const included_services = plan?.services ?? []
      const monthly_content_quota = planId === 'essential' ? 12 : planId === 'booster' ? 24 : 0
      
      let platform_coverage: string[] = []
      if (planId === 'essential') platform_coverage = ['Instagram', 'TikTok', 'Google Business Profile']
      else if (planId === 'booster') platform_coverage = ['Instagram', 'TikTok', 'Xiaohongshu', 'Google Business Profile']

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            plan_name: plan?.name || subscription.planName,
            included_services,
            monthly_content_quota,
            platform_coverage,
            reply_sla: planId === 'essential' ? 'none' : '24h',
            ad_management: false,
            kol_management: planId !== 'essential',
            autopilot_eligible: true,
            contract_start: subscription.contractStartDate?.toISOString() ?? null,
            contract_end: subscription.contractEndDate?.toISOString() ?? null,
            status: subscription.status
          }, null, 2)
        }]
      }
    }
  )

  // ── Brand planning tools ───────────────────────────────────────────────
  server.tool(
    'get_brand_marketing_plan',
    'Read the current brand marketing plan workspace, including research report, annual plan, publishing calendar, and merchant interview.',
    {
      brandId: z.string().describe('Brand ID inside this personal MCP user permission scope.'),
    },
    async ({ brandId }) => {
      const user = await resolveAgent()
      if (!user) return { content: [{ type: 'text' as const, text: 'Error: Invalid personal API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, user.id)
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const data = await getBrandPlan(brandId)
      if (!data) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...data }, null, 2) }] }
    }
  )

  server.tool(
    'generate_brand_research_report',
    'Generate or refresh the brand research report used as the baseline for marketing planning.',
    {
      brandId: z.string().describe('Brand ID inside this personal MCP user permission scope.'),
    },
    async ({ brandId }) => {
      const user = await resolveAgent()
      if (!user) return { content: [{ type: 'text' as const, text: 'Error: Invalid personal API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, user.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      try {
        const data = await runBrandPlanAction({ brandId, action: 'generate_research_report', body: {} })
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return brandPlanErrorResult(error, 'research_report_generation_failed')
      }
    }
  )

  server.tool(
    'save_brand_merchant_interview',
    'Save principal or merchant interview notes before plan generation.',
    {
      brandId: z.string().describe('Brand ID inside this personal MCP user permission scope.'),
      rawNotes: z.string().describe('Complete interview notes or synthesis in natural business language.'),
      summary: z.string().optional().describe('Short operator-facing summary.'),
      answers: z.array(z.object({
        question: z.string(),
        answer: z.string(),
      })).optional().describe('Optional structured Q&A pairs.'),
    },
    async ({ brandId, rawNotes, summary, answers }) => {
      const user = await resolveAgent()
      if (!user) return { content: [{ type: 'text' as const, text: 'Error: Invalid personal API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, user.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      try {
        const data = await runBrandPlanAction({
          brandId,
          action: 'save_merchant_interview',
          body: { rawNotes, summary, answers },
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return brandPlanErrorResult(error, 'merchant_interview_save_failed')
      }
    }
  )

  server.tool(
    'generate_brand_marketing_plan',
    'Generate the annual/rolling marketing plan for a brand from the latest research and interview context.',
    {
      brandId: z.string().describe('Brand ID inside this personal MCP user permission scope.'),
    },
    async ({ brandId }) => {
      const user = await resolveAgent()
      if (!user) return { content: [{ type: 'text' as const, text: 'Error: Invalid personal API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, user.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      try {
        const data = await runBrandPlanAction({ brandId, action: 'generate_annual_plan', body: {} })
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return brandPlanErrorResult(error, 'marketing_plan_generation_failed')
      }
    }
  )

  server.tool(
    'generate_brand_publishing_calendar',
    'Generate a month publishing calendar from the current brand marketing plan.',
    {
      brandId: z.string().describe('Brand ID inside this personal MCP user permission scope.'),
      month: z.string().optional().describe('Target month in YYYY-MM. Defaults to the first planned month.'),
      publishingFreqOverride: z.any().optional().describe('Optional publishing frequency override matching BrandKnowledge.publishingFreq.'),
    },
    async ({ brandId, month, publishingFreqOverride }) => {
      const user = await resolveAgent()
      if (!user) return { content: [{ type: 'text' as const, text: 'Error: Invalid personal API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, user.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      try {
        const current = await getBrandPlan(brandId)
        const targetMonth = pickCalendarMonth(current?.marketingSolution || {}, month)
        const data = await runBrandPlanAction({
          brandId,
          action: 'generate_publishing_calendar',
          body: { month: targetMonth, publishingFreqOverride },
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ...data, month: targetMonth }, null, 2) }] }
      } catch (error) {
        return brandPlanErrorResult(error, 'publishing_calendar_generation_failed')
      }
    }
  )

  server.tool(
    'create_content_drafts_from_calendar',
    'Create publish-ready content drafts from existing publishing calendar items. Each platform is generated and written independently.',
    {
      brandId: z.string().describe('Brand ID inside this personal MCP user permission scope.'),
      month: z.string().describe('Calendar month in YYYY-MM.'),
      limit: z.number().int().min(1).max(12).optional().default(6),
      assetIds: z.array(z.string()).optional().describe('Optional MediaAsset IDs to attach to every generated draft.'),
    },
    async ({ brandId, month, limit, assetIds }) => {
      const user = await resolveAgent()
      if (!user) return { content: [{ type: 'text' as const, text: 'Error: Invalid personal API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, user.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const data = await getBrandPlan(brandId)
      if (!data) return { content: [{ type: 'text' as const, text: 'Error: Brand not found' }], isError: true }
      const items = data?.marketingSolution?.publishingCalendar?.months?.[month] || []
      if (!items.length) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'calendar_month_not_found', month }) }], isError: true }
      }
      const result = await createDraftsFromCalendarItems({
        brandId,
        actor: { id: user.id, type: 'HUMAN', role: user.role },
        brandName: data.brand.name,
        items,
        limit: limit ?? 6,
        assetIds,
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok }
    }
  )

  server.tool(
    'run_brand_planning_workflow',
    'Run the full brand planning workflow: verify access, optionally refresh research, generate marketing plan, generate publishing calendar, and optionally create content drafts.',
    {
      brandId: z.string().describe('Brand ID inside this personal MCP user permission scope.'),
      month: z.string().optional().describe('Target month in YYYY-MM. Defaults to the first planned month.'),
      refreshResearch: z.boolean().optional().default(false),
      createDrafts: z.boolean().optional().default(true),
      maxDrafts: z.number().int().min(1).max(12).optional().default(6),
      assetIds: z.array(z.string()).optional().describe('Optional MediaAsset IDs to attach to generated drafts.'),
    },
    async ({ brandId, month, refreshResearch, createDrafts, maxDrafts, assetIds }) => {
      const user = await resolveAgent()
      if (!user) return { content: [{ type: 'text' as const, text: 'Error: Invalid personal API key' }], isError: true }
      const link = await requireActiveBrandLink(brandId, user.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const steps: Array<Record<string, unknown>> = []
      try {
        const initial = await getBrandPlan(brandId)
        steps.push({ step: 'read_workspace', ok: Boolean(initial), merchantInterviewRequired: initial?.merchantInterviewRequired })

        if (refreshResearch || !initial?.marketingSolution?.researchReport) {
          const research = await runBrandPlanAction({ brandId, action: 'generate_research_report', body: {} })
          steps.push({ step: 'generate_research_report', ok: true, snapshotId: research.marketingSolution.researchReport?.snapshotId })
        }

        const annual = await runBrandPlanAction({ brandId, action: 'generate_annual_plan', body: {} })
        steps.push({
          step: 'generate_marketing_plan',
          ok: true,
          generationMode: annual.marketingSolution.annualPlan?.generationMode,
          period: annual.marketingSolution.annualPlan ? marketingPlanPeriodLabel(annual.marketingSolution.annualPlan) : null,
        })

        const targetMonth = pickCalendarMonth(annual.marketingSolution, month)
        const calendar = await runBrandPlanAction({
          brandId,
          action: 'generate_publishing_calendar',
          body: { month: targetMonth },
        })
        const calendarItems = calendar.marketingSolution.publishingCalendar?.months?.[targetMonth] || []
        steps.push({ step: 'generate_publishing_calendar', ok: true, month: targetMonth, itemCount: calendarItems.length })

        let drafts = null
        if (createDrafts) {
          drafts = await createDraftsFromCalendarItems({
            brandId,
            actor: { id: user.id, type: 'HUMAN', role: user.role },
            brandName: calendar.brand.name,
            items: calendarItems,
            limit: maxDrafts ?? 6,
            assetIds,
          })
          steps.push({ step: 'create_content_drafts', ok: drafts.ok, count: drafts.count })
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: steps.every((step) => step.ok !== false),
              brand: calendar.brand,
              month: targetMonth,
              steps,
              marketingSolution: calendar.marketingSolution,
              drafts,
            }, null, 2),
          }],
          isError: Boolean(drafts && !drafts.ok),
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, steps, error: errorMessage(error, 'brand_planning_workflow_failed') }, null, 2) }],
          isError: true,
        }
      }
    }
  )

  server.tool(
    'create_tasks',
    'Batch create Kanban tasks.',
    {
      brandId: z.string().describe('Brand ID to assign the tasks to.'),
      tasks: z.array(z.object({
        title: z.string().describe('Action-oriented title'),
        description: z.string().optional().describe('Details / content draft'),
        status: z.enum(['todo', 'in_progress', 'pending', 'void']).optional().default('todo'),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
        weight: z.number().int().optional().default(3),
        requiredInput: z.string().optional().describe('Required human input if pending'),
        deadline: z.string().optional().describe('ISO 8601 deadline string'),
        type: z.string().optional().describe('Set "require_input" to automatically format as input-required task'),
        attachments: z.array(z.string()).optional()
      })).describe('Array of tasks to create')
    },
    async ({ brandId, tasks }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      const createdTasks = []
      for (const t of tasks) {
        let statusVal = t.status || 'todo'
        let reqInputVal = t.requiredInput || null
        const tagsList: string[] = []

        if (t.type === 'require_input') {
          statusVal = 'pending'
          reqInputVal = t.description || t.title || ''
          if (t.attachments && t.attachments.length > 0) {
            reqInputVal += `\n\nAttachments:\n` + t.attachments.join('\n')
          }
          tagsList.push('require_input')
        }

        const task = await prisma.workUnit.create({
          data: {
            title: t.title,
            description: t.description || null,
            status: statusVal,
            priority: t.priority || 'medium',
            weight: [1, 3, 5].includes(t.weight ?? 0) ? t.weight! : 3,
            requiredInput: reqInputVal,
            deadline: t.deadline ? new Date(t.deadline) : null,
            brandId,
            assigneeId: agent.id,
            tags: tagsList
          }
        })
        createdTasks.push(task)
      }

      const { eventEmitter } = await import('@/lib/events')
      eventEmitter.emit('board_update')

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, count: createdTasks.length, tasks: createdTasks.map((t: any) => ({ id: t.id, title: t.title, status: t.status })) }, null, 2)
        }]
      }
    }
  )

  server.tool(
    'get_brand_analytics',
    'Get brand historical analytics (likes, comments, engagement, time-series).',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      from: z.string().optional().describe('ISO date string (from)'),
      to: z.string().optional().describe('ISO date string (to)'),
      platform: z.string().optional().describe('Filter platform e.g. instagram, tiktok'),
    },
    async ({ brandId, from, to, platform }) => {
      const { GET: handleGetAnalytics } = await import('@/app/api/brands/[id]/analytics/route')
      
      const url = new URL(`http://localhost/api/brands/${brandId}/analytics`)
      if (from) url.searchParams.set('from', from)
      if (to) url.searchParams.set('to', to)
      if (platform) url.searchParams.set('platform', platform)
      
      const req = new Request(url.toString(), {
        headers: { Authorization: `Bearer ${agentApiKey}` }
      })
      
      const response = await handleGetAnalytics(req, { params: Promise.resolve({ id: brandId }) })
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to fetch analytics'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'get_social_insights',
    'Get live brand social insights (sentiment, keywords, conversions, trends, top posts).',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      from: z.string().optional().describe('ISO date string (from)'),
      to: z.string().optional().describe('ISO date string (to)'),
      platform: z.string().optional().describe('Filter platform e.g. instagram, tiktok'),
    },
    async ({ brandId, from, to, platform }) => {
      const { GET: handleGetSocialInsight } = await import('@/app/api/brands/[id]/social-insight/route')
      
      const url = new URL(`http://localhost/api/brands/${brandId}/social-insight`)
      if (from) url.searchParams.set('from', from)
      if (to) url.searchParams.set('to', to)
      if (platform) url.searchParams.set('platform', platform)
      
      const req = new Request(url.toString(), {
        headers: { Authorization: `Bearer ${agentApiKey}` }
      })
      
      const response = await handleGetSocialInsight(req, { params: Promise.resolve({ id: brandId }) })
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to fetch social insights'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'get_brand_reviews',
    'Fetch the latest Google Maps / GBP reviews for a brand.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      limit: z.number().int().min(1).max(50).optional().default(10),
    },
    async ({ brandId, limit }) => {
      const { GET: handleGetReviews } = await import('@/app/api/brands/[id]/reviews/route')
      
      const url = new URL(`http://localhost/api/brands/${brandId}/reviews`)
      url.searchParams.set('limit', String(limit))
      
      const req = new Request(url.toString(), {
        headers: { Authorization: `Bearer ${agentApiKey}` }
      })
      
      const response = await handleGetReviews(req, { params: Promise.resolve({ id: brandId }) })
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to fetch reviews'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'list_brand_assets',
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
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

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
    'save_agent_insights',
    'Save agent self-learning insights.',
    {
      insights: z.string().describe('The markdown content of the self-learning insights.'),
    },
    async ({ insights }) => {
      const { PATCH: handlePatchAgentInsights } = await import('@/app/api/agent/insights/route')
      
      const req = new Request('http://localhost/api/agent/insights', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${agentApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ insights })
      })
      
      const response = await handlePatchAgentInsights(req)
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to save insights'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'create_require_input_task',
    'Create a task on Kanban that requires human input or review.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      title: z.string().describe('Concise task title explaining what input/review is needed.'),
      description: z.string().describe('Details or questions for the human. Markdown supported.'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
      attachments: z.array(z.string()).optional().describe('URLs or paths of relevant assets.')
    },
    async ({ brandId, title, description, priority, attachments }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      const link = await requireActiveBrandLink(brandId, agent.id, 'WRITE')
      if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand is outside this user permission scope' }], isError: true }

      let reqInputVal = description || title
      if (attachments && attachments.length > 0) {
        reqInputVal += `\n\nAttachments:\n` + attachments.join('\n')
      }

      const task = await prisma.workUnit.create({
        data: {
          title,
          description,
          status: 'pending',
          priority: priority || 'medium',
          weight: 3,
          requiredInput: reqInputVal,
          brandId,
          assigneeId: agent.id,
          tags: ['require_input']
        }
      })

      const { writeAuditLog, actorFromContext } = await import('@/lib/audit')
      await writeAuditLog({
        actor: actorFromContext(null, agent),
        action: 'TASK_CREATED',
        resourceId: task.id,
        newValue: task,
        metadata: { source: 'create_require_input_task' }
      })

      const { eventEmitter } = await import('@/lib/events')
      eventEmitter.emit('board_update')

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, taskId: task.id, status: task.status, tags: task.tags }, null, 2)
        }]
      }
    }
  )

  server.tool(
    'save_local_document',
    'Save a marketing report or strategy document locally as a Markdown file.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      filename: z.string().describe('File name with extension e.g. "weekly_report_2026-W24.md"'),
      docType: z.enum(['weekly_report', 'monthly_report', 'strategy_plan', 'daily_memory', 'other']).describe('Type of document'),
      content: z.string().describe('Markdown text content of the document.')
    },
    async ({ brandId, filename, docType, content }) => {
      const { POST: handlePostDoc } = await import('@/app/api/brands/[id]/documents/route')
      
      const req = new Request(`http://localhost/api/brands/${brandId}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${agentApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename, docType, content })
      })
      
      const response = await handlePostDoc(req, { params: Promise.resolve({ id: brandId }) })
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to save document'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'sync_to_kanban',
    'Synchronize a local document to the Kanban board as a completed task.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      docId: z.string().describe('Document ID returned by save_local_document.'),
      summary: z.string().optional().describe('Short summary to show in the task details.')
    },
    async ({ brandId, docId, summary }) => {
      const { POST: handleSyncDoc } = await import('@/app/api/brands/[id]/documents/[docId]/sync/route')
      
      const req = new Request(`http://localhost/api/brands/${brandId}/documents/${docId}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${agentApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ summary })
      })
      
      const response = await handleSyncDoc(req, { params: Promise.resolve({ id: brandId, docId }) })
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to sync document'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'write_daily_memory',
    'Save daily memory markdown file for a brand.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      date: z.string().describe('Date in YYYY-MM-DD format.'),
      content: z.string().describe('Markdown text containing daily records.')
    },
    async ({ brandId, date, content }) => {
      const { POST: handlePostMemory } = await import('@/app/api/brands/[id]/memory/route')
      
      const req = new Request(`http://localhost/api/brands/${brandId}/memory`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${agentApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ date, content })
      })
      
      const response = await handlePostMemory(req, { params: Promise.resolve({ id: brandId }) })
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to write memory'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'read_daily_memory',
    'Read daily memory markdown files for a brand.',
    {
      brandId: z.string().describe('Brand ID linked to this user.'),
      days: z.number().int().optional().describe('Number of recent days to read. Default 3.'),
      date: z.string().optional().describe('Specific date YYYY-MM-DD to read.'),
    },
    async ({ brandId, days, date }) => {
      const { GET: handleGetMemory } = await import('@/app/api/brands/[id]/memory/route')
      
      const url = new URL(`http://localhost/api/brands/${brandId}/memory`)
      if (days) url.searchParams.set('days', String(days))
      if (date) url.searchParams.set('date', date)
      
      const req = new Request(url.toString(), {
        headers: { Authorization: `Bearer ${agentApiKey}` }
      })
      
      const response = await handleGetMemory(req, { params: Promise.resolve({ id: brandId }) })
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to read memory'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'get_platform_benchmarks',
    'Get platform-level benchmarks by category and location.',
    {
      category: z.string().describe('Brand business category e.g. chinese_restaurant'),
      location: z.string().describe('Brand city / location e.g. Singapore'),
      platform: z.string().optional().describe('Filter by platform e.g. instagram'),
    },
    async ({ category, location, platform }) => {
      const { GET: handleGetBenchmarks } = await import('@/app/api/analytics/benchmarks/route')
      
      const url = new URL(`http://localhost/api/analytics/benchmarks`)
      url.searchParams.set('category', category)
      url.searchParams.set('location', location)
      if (platform) url.searchParams.set('platform', platform)
      
      const req = new Request(url.toString(), {
        headers: { Authorization: `Bearer ${agentApiKey}` }
      })
      
      const response = await handleGetBenchmarks(req)
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to fetch benchmarks'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'google_get_place_info',
    'Get Google Place profile details for a brand location.',
    {
      placeId: z.string().describe('Google Place ID'),
    },
    async ({ placeId }) => {
      const { GET: handleGetPlaces } = await import('@/app/api/integrations/google/places/route')
      
      const url = new URL(`http://localhost/api/integrations/google/places`)
      url.searchParams.set('placeId', placeId)
      
      const req = new Request(url.toString(), {
        headers: { Authorization: `Bearer ${agentApiKey}` }
      })
      
      const response = await handleGetPlaces(req)
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to fetch place details'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'fetch_public_social_profile',
    'Fetch public social media profile stats (followers, posts, engagement).',
    {
      platform: z.enum(['instagram', 'facebook']).describe('Social platform'),
      handle: z.string().describe('Public handle / profile username'),
    },
    async ({ platform, handle }) => {
      const { GET: handleGetProfile } = await import('@/app/api/integrations/social/public-profile/route')
      
      const url = new URL(`http://localhost/api/integrations/social/public-profile`)
      url.searchParams.set('platform', platform)
      url.searchParams.set('handle', handle)
      
      const req = new Request(url.toString(), {
        headers: { Authorization: `Bearer ${agentApiKey}` }
      })
      
      const response = await handleGetProfile(req)
      const data = await response.json()
      
      if (response.status >= 400) {
        return { content: [{ type: 'text' as const, text: `Error: ${data.error || 'Failed to fetch public profile'}` }], isError: true }
      }
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── list_faqs ────────────────────────────────────────────────────────────
  server.tool(
    'list_faqs',
    'List all FAQ / Q&A items in the AMC Learning Center.',
    {},
    async () => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      try {
        const { GET } = await import('@/app/api/learn/faq/route')
        const response = await GET()
        const data = await response.json()
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorMessage(error, 'Failed to list FAQs')}` }], isError: true }
      }
    }
  )

  // ── add_faq ─────────────────────────────────────────────────────────────
  server.tool(
    'add_faq',
    'Add a new Q&A item to the AMC Learning Center FAQ list.',
    {
      category: z.enum(['accounts', 'posts', 'influencers', 'billing', 'reports']).describe('FAQ category'),
      q: z.string().describe('The question'),
      a: z.string().describe('The answer'),
      tag: z.string().describe('A tag label for the FAQ'),
    },
    async ({ category, q, a, tag }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      try {
        const faq = await prisma.faqItem.create({
          data: { category, q, a, tag }
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify(faq, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorMessage(error, 'Failed to add FAQ')}` }], isError: true }
      }
    }
  )

  // ── delete_faq ──────────────────────────────────────────────────────────
  server.tool(
    'delete_faq',
    'Delete a Q&A item from the AMC Learning Center FAQ list.',
    {
      id: z.string().describe('The FAQ item ID to delete'),
    },
    async ({ id }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      try {
        await prisma.faqItem.delete({
          where: { id }
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: id }) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorMessage(error, 'Failed to delete FAQ')}` }], isError: true }
      }
    }
  )

  // ── list_school_items ───────────────────────────────────────────────────
  server.tool(
    'list_school_items',
    'List all AMC School items (courses, cases, and calendar events).',
    {},
    async () => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      try {
        const { GET } = await import('@/app/api/learn/school/route')
        const response = await GET()
        const data = await response.json()
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorMessage(error, 'Failed to list school items')}` }], isError: true }
      }
    }
  )

  // ── add_school_item ──────────────────────────────────────────────────────
  server.tool(
    'add_school_item',
    'Add a new Course, Case, Calendar Event, or Article to the AMC School.',
    {
      type: z.enum(['COURSE', 'CASE', 'CALENDAR', 'ARTICLE']).describe('The school item type'),
      title: z.string().optional().describe('Title of the item (applicable to COURSE, CASE, or ARTICLE)'),
      desc: z.string().optional().describe('Description / summary of the item (applicable to COURSE, CASE, or ARTICLE)'),
      duration: z.string().optional().describe('Duration of the course e.g. "15m" (applicable to COURSE)'),
      level: z.enum(['entry', 'advanced']).optional().describe('Level of the course (applicable to COURSE)'),
      date: z.string().optional().describe('Date / month range e.g. "6月" (applicable to CALENDAR)'),
      event: z.string().optional().describe('Event name (applicable to CALENDAR)'),
      tip: z.string().optional().describe('Marketing tip / suggestion (applicable to CALENDAR)'),
      markdown: z.string().optional().describe('Markdown text content of the learning article (applicable to ARTICLE)'),
    },
    async (input) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      try {
        const item = await prisma.schoolItem.create({
          data: {
            type: input.type,
            title: input.title || null,
            desc: input.desc || null,
            duration: input.duration || null,
            level: input.level || null,
            date: input.date || null,
            event: input.event || null,
            tip: input.tip || null,
            markdown: input.markdown || null,
            authorId: agent.id
          },
          include: {
            author: {
              select: {
                id: true,
                email: true,
                nickname: true,
                type: true,
              }
            }
          }
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify(item, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorMessage(error, 'Failed to add school item')}` }], isError: true }
      }
    }
  )

  // ── delete_school_item ───────────────────────────────────────────────────
  server.tool(
    'delete_school_item',
    'Delete a School item (Course, Case, or Calendar Event) by its ID.',
    {
      id: z.string().describe('The School item ID to delete'),
    },
    async ({ id }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      try {
        await prisma.schoolItem.delete({
          where: { id }
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: id }) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorMessage(error, 'Failed to delete school item')}` }], isError: true }
      }
    }
  )
  // ── submit_knowledge_template ───────────────────────────────────────────
  server.tool(
    'submit_knowledge_template',
    'Submit a copywriting template, content idea, video script blueprint, or prompt rule to the AMC Knowledge Base.',
    {
      industry: z.enum(['fb', 'fitness', 'renovation', 'winery', 'general']).describe('The industry category for this template'),
      platform: z.string().describe('The target platform name, e.g. "instagram", "red", "tiktok", "facebook", "google_business", or "all"'),
      template: z.string().optional().describe('Copywriting template content with placeholders like [BrandName], [Signature], [Texture] if applicable'),
      idea: z.string().optional().describe('Content creation/marketing idea'),
      videoScript: z.string().optional().describe('Video script blueprint with time markers'),
      prompt: z.string().optional().describe('Specialized prompt/rule for the AI agent copywriter'),
    },
    async ({ industry, platform, template, idea, videoScript, prompt }) => {
      const agent = await resolveAgent()
      if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }

      if (!template && !idea && !videoScript && !prompt) {
        return { content: [{ type: 'text' as const, text: 'Error: At least one of template, idea, videoScript, or prompt must be provided' }], isError: true }
      }

      try {
        const { addCustomTemplate } = await import('@/agents/knowledgeBase.ts')
        const success = addCustomTemplate({
          industry,
          platform,
          template,
          idea,
          videoScript,
          prompt,
        })
        if (!success) {
          return { content: [{ type: 'text' as const, text: 'Error: Failed to save template to the knowledge base file' }], isError: true }
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Template submitted successfully to AMC Knowledge Base' }, null, 2),
          }],
        }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorMessage(error, 'Failed to save template')}` }], isError: true }
      }
    }
  )

  return server
}
