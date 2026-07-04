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
  const prismaLogger = read('src/lib/amc-content/loggerAdapter.ts')

  assertIncludes(service, "import { prisma } from '../prisma.ts'", 'service prisma access')
  assertIncludes(service, "import { tryGenerateWithAmcContent } from './legacyCopywriterBridge.ts'", 'service amc-content bridge')
  assertIncludes(service, "import { tryGenerateWithRemoteContentService } from './remoteContentService.ts'", 'service remote bridge')
  assertIncludes(service, 'export async function generateContentWithFallback', 'service public facade')
  assertIncludes(service, 'const remote = await tryGenerateWithRemoteContentService(input)', 'service tries remote first')
  assertIncludes(service, 'falling back local', 'service logs remote-to-local fallback')
  assertIncludes(service, 'const result = await tryGenerateWithAmcContent({', 'service primary engine')
  assertIncludes(service, "contentEngine: 'amc-content'", 'service amc-content result marker')
  assertIncludes(service, 'if (input.fallbackToLegacy === false)', 'service fallback opt-out')
  assertIncludes(service, "await import('../../agents/nodes/copywriter.ts')", 'service lazy legacy import')
  assertIncludes(service, 'skipAmcContent: true', 'service recursion guard')
  assertIncludes(service, "contentEngine: legacy.aiFailed ? 'rule-based-fallback' : 'legacy-copywriter'", 'service legacy engine marker')
  assertIncludes(service, 'async function resolveMediaUrls', 'service media resolver')

  assertIncludes(remoteClient, 'AMC_CONTENT_SERVICE_URL', 'remote client service url env')
  assertIncludes(remoteClient, 'AMC_CONTENT_REMOTE_ENABLED', 'remote client feature flag')
  assertIncludes(remoteClient, '/v1/content/generate', 'remote client generate endpoint')
  assertIncludes(remoteClient, "contentEngine: 'amc-content-remote'", 'remote client engine marker')
  assertIncludes(remoteClient, "headers['x-amc-actor-id']", 'remote client forwards actor id')

  assertIncludes(internalContextRoute, 'CONTENT_SERVICE_INTERNAL_TOKEN', 'internal context token env')
  assertIncludes(internalContextRoute, 'canSessionAccessBrandProject', 'internal context uses kanban ACL')
  assertIncludes(internalContextRoute, 'prisma.brand.findUnique', 'internal context returns brand context')
  assertIncludes(internalContextRoute, 'resolveMedia', 'internal context resolves media')

  assertIncludes(internalLogRoute, 'CONTENT_SERVICE_INTERNAL_TOKEN', 'internal log token env')
  assertIncludes(internalLogRoute, 'prisma.copywriterLog.create', 'internal log persists copywriter logs')
  assertIncludes(internalLogRoute, "engine: 'amc-content-remote'", 'internal log marks remote engine')
  assertIncludes(internalLogRoute, 'latencyMs: optionalInt(body.latencyMs)', 'internal log stores latency')
  assertIncludes(internalLogRoute, 'tokenEstimate: optionalInt(body.tokenEstimate)', 'internal log stores token estimates')
  assertIncludes(prismaLogger, 'prisma.copywriterLog.create', 'local content logger persists copywriter logs')
  assertIncludes(prismaLogger, 'latencyMs: event.latencyMs ?? null', 'local content logger stores latency')
  assertIncludes(internalLlmRoute, 'CONTENT_SERVICE_INTERNAL_TOKEN', 'internal LLM route token env')
  assertIncludes(internalLlmRoute, "callLLM(taskTag, prompt, maxTokens)", 'internal LLM route delegates to LLMConfig router')
  assertIncludes(internalLlmRoute, "'copywriting'", 'internal LLM route defaults to copywriting tag')
}

function testLegacyEntrypointsUseFacade() {
  const bulkRoute = read('src/app/api/brands/[id]/copywriter/bulk-generate/route.ts')
  const copywriterNode = read('src/agents/nodes/copywriter.ts')

  assertIncludes(bulkRoute, "import { generateContentWithFallback } from '@/lib/amc-content/contentGenerationService'", 'bulk route content facade import')
  assertIncludes(bulkRoute, 'const cwResult = await generateContentWithFallback({', 'bulk route content facade call')
  assertIncludes(bulkRoute, 'fallbackToLegacy: true', 'bulk route fallback flag')
  assertIncludes(bulkRoute, 'contentEngine = cwResult.contentEngine', 'bulk route engine propagation')
  assertIncludes(bulkRoute, '[via contentService/${contentEngine}]', 'bulk route generation log marker')
  assertNotIncludes(bulkRoute, "import { copywriterNode }", 'bulk route direct copywriter import')

  assertIncludes(copywriterNode, "import { tryGenerateWithAmcContent }", 'copywriter node bridge import')
  assertIncludes(copywriterNode, "!state.skipAmcContent && process.env.AMC_CONTENT_ENGINE_ENABLED !== 'false'", 'copywriter node feature gate and recursion guard')
  assertIncludes(copywriterNode, "contentEngine: 'amc-content'", 'copywriter node engine marker')
}

function testPlatformCopywriterRegistry() {
  const registry = read('packages/amc-content/src/copywriters/registry.ts')
  const pipeline = read('packages/amc-content/src/pipeline/createPlatformContent.ts')
  const index = read('packages/amc-content/src/index.ts')
  const modelProfiles = read('packages/amc-content/src/modelProfiles.ts')
  const modelRouterAdapter = read('src/lib/amc-content/modelRouterAdapter.ts')

  for (const provider of ['InstagramCopywriter', 'GoogleBusinessCopywriter', 'XiaohongshuCopywriter', 'FacebookCopywriter', 'TikTokCopywriter']) {
    assertIncludes(registry, provider, `copywriter registry includes ${provider}`)
  }

  for (const platform of ['instagram', 'google_business', 'xiaohongshu', 'facebook', 'tiktok']) {
    assertIncludes(registry, platform, `copywriter registry exposes ${platform}`)
  }

  assertIncludes(pipeline, 'const copywriter = getPlatformCopywriter(input.platform)', 'pipeline resolves platform copywriter')
  assertIncludes(pipeline, 'copywriter.buildHookPrompt', 'pipeline delegates hook prompt')
  assertIncludes(pipeline, 'copywriter.buildBodyPrompt', 'pipeline delegates body prompt')
  assertIncludes(pipeline, 'copywriter.buildRewritePrompt', 'pipeline delegates rewrite prompt')
  assertIncludes(pipeline, 'copywriter.validate(input, content)', 'pipeline delegates platform validation')
  assertIncludes(index, "export * from './copywriters/registry.ts'", 'package exports copywriter registry')
  assertIncludes(index, "export * from './modelProfiles.ts'", 'package exports model profiles')
  assertIncludes(modelProfiles, 'platformModelProfiles', 'model profile platform mapping')
  assertIncludes(modelProfiles, "google_business: {", 'model profile google mapping')
  assertIncludes(modelProfiles, "body_composition: 'local_seo_precise_v1'", 'google uses SEO precise profile')
  assertIncludes(modelProfiles, "xiaohongshu: {", 'model profile xhs mapping')
  assertIncludes(modelProfiles, "body_composition: 'local_social_creative_v1'", 'xhs uses creative profile')
  assertIncludes(pipeline, 'modelProfileId: bodyProfile.id', 'pipeline passes body model profile')
  assertIncludes(pipeline, 'modelProfileId: bodyProfile.id', 'provenance includes model profile')
  assertIncludes(modelRouterAdapter, 'callLLMWithContentModelProfile', 'adapter uses content model profile router')
  assertIncludes(modelRouterAdapter, "callLLM('copywriting'", 'adapter keeps legacy router fallback')
}

function testContentLabReviewUi() {
  const page = read('src/app/admin/content-lab/page.tsx')

  assertIncludes(page, 'type CopywriterLogRecord', 'content lab has copywriter log record type')
  assertIncludes(page, '/api/admin/copywriter-logs?', 'content lab loads log list')
  assertIncludes(page, '/annotate', 'content lab saves review annotations')
  assertIncludes(page, 'Review Logs', 'content lab exposes review logs UI')
  assertIncludes(page, 'Training Review', 'content lab exposes training review UI')
  assertIncludes(page, 'Corrected content', 'content lab exposes corrected content editor')
  assertIncludes(page, 'await loadReviewLogs()', 'content lab refreshes logs after generation')
}

function main() {
  testContentGenerateApi()
  testContentGenerationService()
  testLegacyEntrypointsUseFacade()
  testPlatformCopywriterRegistry()
  testContentLabReviewUi()
  console.log('SUCCESS: content engine integration guards passed')
}

main()
