import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

function assertIncludes(source: string, expected: string, context: string) {
  assert.ok(source.includes(expected), `${context}: expected to include ${expected}`)
}

function assertNotIncludes(source: string, unexpected: string, context: string) {
  assert.ok(!source.includes(unexpected), `${context}: expected not to include ${unexpected}`)
}

function testContentGenerateApi() {
  const route = read('src/app/api/content/generate/route.ts')

  assertIncludes(route, "import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'", 'content API auth imports')
  assertIncludes(route, "import { canSessionAccessBrandProject } from '@/lib/brandAccess'", 'content API brand access import')
  assertIncludes(route, "import { generateContentWithFallback } from '@/lib/amc-content/contentGenerationService'", 'content API service import')
  assertIncludes(route, 'export const maxDuration = 120', 'content API timeout')
  assertIncludes(route, 'const actor = await getActor(request)', 'content API actor resolution')
  assertIncludes(route, 'canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)', 'content API brand ACL')
  assertIncludes(route, 'generateContentWithFallback({', 'content API service call')
  assertIncludes(route, 'copywriterId: optionalString(body.copywriterId)', 'content API accepts selected copywriter id')
  assertIncludes(route, 'fallbackToLegacy: body.fallbackToLegacy !== false', 'content API fallback flag')
  assertIncludes(route, 'Unsupported industryVertical', 'content API vertical validation')
  assertIncludes(route, "NextResponse.json({ error: 'Unauthorized' }, { status: 401 })", 'content API unauthorized response')
}

function testContentGenerationService() {
  const service = read('src/lib/amc-content/contentGenerationService.ts')
  const remoteClient = read('src/lib/amc-content/remoteContentService.ts')
  const internalContextRoute = read('src/app/api/internal/content-context/route.ts')
  const internalLogRoute = read('src/app/api/internal/content-log/route.ts')
  const internalLlmRoute = read('src/app/api/internal/llm-generate/route.ts')

  assertIncludes(service, "import { prisma } from '../prisma.ts'", 'service prisma access')
  assertIncludes(service, "import { tryGenerateWithRemoteContentService } from './remoteContentService.ts'", 'service remote bridge')
  assertNotIncludes(service, 'legacyCopywriterBridge', 'service should not import removed local amc-content bridge')
  assertIncludes(service, 'export async function generateContentWithFallback', 'service public facade')
  assertIncludes(service, 'const remote = await tryGenerateWithRemoteContentService(input)', 'service tries remote first')
  assertIncludes(service, 'falling back legacy', 'service logs remote-to-legacy fallback')
  assertIncludes(service, 'if (input.fallbackToLegacy === false)', 'service fallback opt-out')
  assertIncludes(service, "await import('../../agents/nodes/copywriter.ts')", 'service lazy legacy import')
  assertIncludes(service, 'skipAmcContent: true', 'service recursion guard')
  assertIncludes(service, "contentEngine: legacy.aiFailed ? 'rule-based-fallback' : 'legacy-copywriter'", 'service legacy engine marker')
  assertIncludes(service, 'async function resolveMediaUrls', 'service media resolver')

  assertIncludes(remoteClient, 'AMC_CONTENT_SERVICE_URL', 'remote client service url env')
  assertIncludes(remoteClient, 'AMC_CONTENT_REMOTE_ENABLED', 'remote client feature flag')
  assertIncludes(remoteClient, '/v1/content/generate', 'remote client generate endpoint')
  assertIncludes(remoteClient, 'copywriterId: input.copywriterId', 'remote client forwards selected copywriter id')
  assertIncludes(remoteClient, "contentEngine: 'amc-content'", 'remote client engine marker')
  assertIncludes(remoteClient, "headers['x-amc-actor-id']", 'remote client forwards actor id')

  assertIncludes(internalContextRoute, 'CONTENT_SERVICE_INTERNAL_TOKEN', 'internal context token env')
  assertIncludes(internalContextRoute, 'canSessionAccessBrandProject', 'internal context uses kanban ACL')
  assertIncludes(internalContextRoute, 'prisma.brand.findUnique', 'internal context returns brand context')
  assertIncludes(internalContextRoute, 'resolveMedia', 'internal context resolves media')
  assertIncludes(internalContextRoute, 'promotionPlan', 'internal context returns promotion plan')

  assertIncludes(internalLogRoute, 'CONTENT_SERVICE_INTERNAL_TOKEN', 'internal log token env')
  assertIncludes(internalLogRoute, 'prisma.copywriterLog.create', 'internal log persists copywriter logs')
  assertIncludes(internalLogRoute, "engine: 'amc-content'", 'internal log marks amc-content engine')
  assertIncludes(internalLogRoute, 'latencyMs: optionalInt(body.latencyMs)', 'internal log stores latency')
  assertIncludes(internalLogRoute, 'tokenEstimate: optionalInt(body.tokenEstimate)', 'internal log stores token estimates')
  assertIncludes(internalLlmRoute, 'CONTENT_SERVICE_INTERNAL_TOKEN', 'internal LLM route token env')
  assertIncludes(internalLlmRoute, 'callLLM(taskTag, prompt, maxTokens, {', 'internal LLM route delegates to LLMConfig router')
  assertIncludes(internalLlmRoute, "'copywriting'", 'internal LLM route defaults to copywriting tag')
}

function testLegacyEntrypointsUseFacade() {
  const bulkRoute = read('src/app/api/brands/[id]/copywriter/bulk-generate/route.ts')
  const copywriterNode = read('src/agents/nodes/copywriter.ts')
  const state = read('src/agents/state.ts')
  const triggerRoute = read('src/app/api/brands/[id]/drafts/[draftId]/trigger-copywriter/route.ts')
  const llmRouter = read('src/lib/llmRouter.ts')
  const dashboardAssets = read('src/components/dashboard/DashboardAssets.tsx')

  assertIncludes(bulkRoute, "import { generateContentWithFallback } from '@/lib/amc-content/contentGenerationService'", 'bulk route content facade import')
  assertIncludes(bulkRoute, 'const cwResult = await generateContentWithFallback({', 'bulk route content facade call')
  assertIncludes(bulkRoute, 'copywriterIds', 'bulk route accepts selected copywriter ids')
  assertIncludes(bulkRoute, 'copywritersFromIds(copywriterIds)', 'bulk route resolves selected copywriter roster')
  assertIncludes(bulkRoute, 'copywriterId: copywriter?.id', 'bulk route forwards selected copywriter id')
  assertIncludes(bulkRoute, 'fallbackToLegacy: false', 'bulk route requires amc-content instead of legacy fallback')
  assertIncludes(bulkRoute, 'contentEngine = cwResult.contentEngine', 'bulk route engine propagation')
  assertIncludes(bulkRoute, '[via contentService/${contentEngine}]', 'bulk route generation log marker')
  assertNotIncludes(bulkRoute, "import { copywriterNode }", 'bulk route direct copywriter import')

  assertIncludes(copywriterNode, "import { tryGenerateWithRemoteContentService }", 'copywriter node remote service import')
  assertNotIncludes(copywriterNode, 'tryGenerateWithAmcContent', 'copywriter node should not use removed local bridge')
  assertIncludes(copywriterNode, "process.env.AMC_CONTENT_ENGINE_ENABLED === 'false'", 'copywriter node feature gate')
  assertIncludes(copywriterNode, 'actorId: state.actorId || state.assigneeId', 'copywriter node forwards actor for remote context ACL')
  assertIncludes(copywriterNode, "contentEngine: 'amc-content'", 'copywriter node engine marker')
  assertIncludes(state, 'actorId: Annotation<string>', 'graph state preserves actor id for amc-content context ACL')
  assertIncludes(state, 'actorType: Annotation<string>', 'graph state preserves actor type for amc-content context ACL')
  assertIncludes(state, 'actorRole: Annotation<string>', 'graph state preserves actor role for amc-content context ACL')
  assertIncludes(state, 'assigneeId: Annotation<string>', 'graph state preserves assignee fallback actor')
  assertIncludes(state, 'assetIds: Annotation<string[]>', 'graph state preserves asset ids for amc-content media context')
  assertIncludes(state, 'skipAmcContent: Annotation<boolean>', 'graph state preserves recursion guard')
  assertIncludes(triggerRoute, "status: 'draft'", 'copywriter trigger keeps failed generation visible in drafts')
  assertNotIncludes(triggerRoute, "status: 'failed',\n          agentNote: `AI generation graph error", 'copywriter trigger must not hide generation failures from Draft view')
  assertIncludes(llmRouter, 'const hasFiniteRemaining = Number.isFinite(remainingMs)', 'LLM router avoids passing Infinity timeout to AbortSignal')
  assertIncludes(llmRouter, ': undefined', 'LLM router leaves timeout unset when no finite deadline exists')
  assertIncludes(dashboardAssets, 'if (createdDraftIds.length === 0)', 'AI batch create surfaces zero-draft failures')
  assertIncludes(dashboardAssets, 'if (failedCount === 0 && completedCount === threadPlan.length)', 'AI batch create only auto-closes after every thread succeeds')
  assertIncludes(dashboardAssets, 'const rawThreadPlan = selectedCopywriters.flatMap', 'AI batch create builds one thread per asset/copywriter combination')
  assertIncludes(dashboardAssets, 'const threadPlan: AIBatchThread[] = rawThreadPlan.map', 'AI batch create enriches each thread with per-platform scheduling indexes')
  assertIncludes(dashboardAssets, 'await Promise.allSettled(threadPlan.map((thread) => runThread(thread)))', 'AI batch create runs each asset/platform thread independently')
  assertIncludes(dashboardAssets, 'numberOfPosts: thread.platformCount', 'AI batch thread scheduling requests enough slots for same-platform combinations')
  assertIncludes(dashboardAssets, 'schedData.recommendations?.[thread.platformIndex]', 'AI batch thread uses its own scheduled slot')
  assertIncludes(dashboardAssets, "status: 'copywriting'", 'AI batch thread exposes independent amc-content copywriting progress')
  assertIncludes(dashboardAssets, 'aiJobThreads.map((thread)', 'AI batch UI renders per-thread progress instead of copywriter aggregate status')
}

function testContentLabStandaloneEntry() {
  const page = read('src/app/admin/content-lab/page.tsx')
  const internalAdmin = read('src/app/api/internal/content-lab-admin/route.ts')
  const permissions = read('src/lib/permissions.ts')
  const userManagementPermissions = read('src/lib/user-management/permissions.ts')

  assertIncludes(page, 'AMC_CONTENT_SERVICE_URL', 'kanban content lab entry redirects to standalone service')
  assertIncludes(page, 'signLabToken', 'kanban signs standalone lab token after admin auth')
  assertIncludes(page, "role: 'ADMIN'", 'lab token is admin-scoped')
  assertIncludes(page, 'redirect(`${contentUrl}/admin/content-lab#labToken=', 'entry uses URL fragment to avoid token in request logs')
  assertIncludes(page, "roles.includes('AMC_PRINCIPAL')", 'principal users can open the Content Lab handoff')
  assertIncludes(permissions, "label: 'AI 角色库', icon: 'Sparkles', href: '/admin/content-lab'", 'AI role menu opens latest amc-content home')
  assertIncludes(userManagementPermissions, "label: 'AI 角色库', icon: 'Sparkles', href: '/admin/content-lab'", 'user-management menu opens latest amc-content home')
  assertIncludes(internalAdmin, "body.action === 'catalog'", 'internal admin bridge exposes catalog data')
  assertIncludes(internalAdmin, "body.action === 'logs'", 'internal admin bridge exposes review logs')
  assertIncludes(internalAdmin, "body.action === 'annotateLog'", 'internal admin bridge exposes log annotation')
  assertIncludes(internalAdmin, 'CONTENT_SERVICE_INTERNAL_TOKEN', 'internal admin bridge is service-token protected')
}

function testCopywriterFirstCreativeUi() {
  const postEditDrawer = read('src/components/dashboard/PostEditDrawer.tsx')
  const dashboardAssets = read('src/components/dashboard/DashboardAssets.tsx')
  const draftManagement = read('src/components/dashboard/DraftManagementView.tsx')
  const dashboardCalendar = read('src/components/dashboard/DashboardCalendar.tsx')
  const postPreviewModal = read('src/components/dashboard/PostPreviewModal.tsx')

  assertIncludes(postEditDrawer, 'COPYWRITER_ROSTER', 'post editor exposes copywriter roster selection')
  assertIncludes(postEditDrawer, 'draftAccountIdForCopywriter(copywriter, accounts)', 'post editor maps copywriters to draft targets')
  assertIncludes(postEditDrawer, '可先创作', 'post editor allows creation before publishing account setup')
  assertNotIncludes(postEditDrawer, 'PLATFORM_SLOTS', 'post editor no longer uses platform slots as the creative selector')
  assertNotIncludes(postEditDrawer, '创作平台', 'post editor is not platform-slot first')
  assertNotIncludes(postEditDrawer, '请选择发布平台账号', 'post editor does not block creation on publishing accounts')

  assertIncludes(dashboardAssets, 'COPYWRITER_ROSTER', 'asset schedule modal exposes copywriter roster')
  assertIncludes(dashboardAssets, 'scheduleSelectedCopywriterIds', 'asset schedule modal stores selected copywriters')
  assertIncludes(dashboardAssets, 'draftAccountIdForCopywriter(copywriter, brandAccounts)', 'asset schedule modal maps copywriters to draft targets')
  assertNotIncludes(dashboardAssets, '发布账号 (多选)', 'asset schedule modal is not account-first')
  assertNotIncludes(dashboardAssets, '请选择发布账号', 'asset schedule modal does not block creation on publishing accounts')

  assertIncludes(draftManagement, 'defaultCopywriterAccountIds(accounts)', 'draft management defaults new drafts to copywriter targets')
  assertNotIncludes(draftManagement, 'accounts.map(a => a.id)', 'draft management no longer defaults creative targets from publishing accounts')
  assertNotIncludes(dashboardCalendar, '请选择发布平台账号', 'calendar legacy creative path uses copywriter validation copy')
  assertIncludes(postPreviewModal, '请选择 Copywriter 以查看预览', 'preview modal empty state names copywriters')
}

function main() {
  testContentGenerateApi()
  testContentGenerationService()
  testLegacyEntrypointsUseFacade()
  testContentLabStandaloneEntry()
  testCopywriterFirstCreativeUi()
  console.log('SUCCESS: content engine integration guards passed')
}

main()
