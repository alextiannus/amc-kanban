import { getPlatformProvider } from '../platforms/registry'
import { getVerticalSpec } from '../verticals/registry'
import { runDeterministicGate } from '../quality/deterministicGate'
import type {
  ComposedContent,
  HookCandidate,
  KnowledgeEntry,
  PlatformContentInput,
  PlatformContentResult,
} from '../types'

const PROMPT_VERSION = 'amc-content-v0.1'

export async function createPlatformContent(input: PlatformContentInput): Promise<PlatformContentResult> {
  const provider = getPlatformProvider(input.platform)
  const vertical = getVerticalSpec(input.brief.industryVertical)
  const knowledge = await input.adapters.knowledgeRepository?.retrieve({
    brandId: input.brand.id,
    platform: input.platform,
    vertical: input.brief.industryVertical,
    theme: input.brief.theme,
    categories: ['hook', 'template', 'example', 'format_rule', 'compliance_rule'],
    limit: 8,
  }) ?? []

  const hookModel = await input.adapters.modelRouter.generateJson<{ hooks: HookCandidate[] }>({
    task: 'hook_generation',
    platform: input.platform,
    vertical: input.brief.industryVertical,
    prompt: buildHookPrompt(input, knowledge),
    maxTokens: 900,
  })

  const selectedHook = selectHook(hookModel.data.hooks, input.recentHooks)

  const bodyModel = await input.adapters.modelRouter.generateJson<ComposedContent>({
    task: 'body_composition',
    platform: input.platform,
    vertical: input.brief.industryVertical,
    prompt: buildBodyPrompt(input, selectedHook, knowledge),
    maxTokens: 1400,
  })

  let content = bodyModel.data
  let quality = runDeterministicGate({
    platform: input.platform,
    vertical: input.brief.industryVertical,
    brand: input.brand,
    media: input.media,
    content,
  })

  if (!quality.passed && quality.rewriteInstruction) {
    const rewriteModel = await input.adapters.modelRouter.generateJson<ComposedContent>({
      task: 'quality_rewrite',
      platform: input.platform,
      vertical: input.brief.industryVertical,
      prompt: buildRewritePrompt(input, selectedHook, content, quality.rewriteInstruction),
      maxTokens: 1400,
    })
    content = rewriteModel.data
    quality = runDeterministicGate({
      platform: input.platform,
      vertical: input.brief.industryVertical,
      brand: input.brand,
      media: input.media,
      content,
    })
  }

  const provenance = {
    platformSkillVersion: provider.skillVersion,
    verticalSkillVersion: vertical.skillVersion,
    knowledgeEntryIds: knowledge.map((entry) => entry.id),
    modelId: bodyModel.modelId ?? hookModel.modelId,
    promptVersion: PROMPT_VERSION,
  }

  const result: PlatformContentResult = {
    platform: input.platform,
    vertical: input.brief.industryVertical,
    caption: content.caption,
    hashtags: content.hashtags,
    hook: selectedHook,
    quality,
    provenance,
  }

  await input.adapters.logger?.logGeneration({
    brandId: input.brand.id,
    platform: input.platform,
    vertical: input.brief.industryVertical,
    draftId: input.draftId,
    promptVersion: PROMPT_VERSION,
    modelId: provenance.modelId,
    input: {
      brandId: input.brand.id,
      brief: input.brief,
      media: input.media,
      knowledgeEntryIds: provenance.knowledgeEntryIds,
    },
    output: result,
    quality,
    provenance,
  })

  return result
}

function selectHook(hooks: HookCandidate[], recentHooks: HookCandidate[] = []): HookCandidate {
  const candidates = hooks.length > 0
    ? hooks
    : [{ text: 'A local favorite worth checking out.', category: 'benefit' as const, score: 0.5 }]
  const recentCategories = new Set(recentHooks.slice(0, 10).map((hook) => hook.category))
  const filtered = candidates.filter((hook) => !recentCategories.has(hook.category))
  const pool = filtered.length > 0 ? filtered : candidates
  return [...pool].sort((a, b) => b.score - a.score)[0]
}

function buildHookPrompt(input: PlatformContentInput, knowledge: KnowledgeEntry[]): string {
  const provider = getPlatformProvider(input.platform)
  const vertical = getVerticalSpec(input.brief.industryVertical)
  return [
    `Generate hook candidates for ${provider.displayName}.`,
    `Brand: ${input.brand.name}`,
    `Vertical: ${vertical.displayName}`,
    `Theme: ${input.brief.theme}`,
    `Angle: ${input.brief.angle ?? 'choose the strongest local-service angle'}`,
    `Allowed hook categories: ${provider.hookCategories.join(', ')}`,
    `Return JSON: { "hooks": [{ "text": string, "category": string, "score": number, "reason": string }] }`,
    formatKnowledge(knowledge),
  ].join('\n')
}

function buildBodyPrompt(input: PlatformContentInput, hook: HookCandidate, knowledge: KnowledgeEntry[]): string {
  const provider = getPlatformProvider(input.platform)
  const vertical = getVerticalSpec(input.brief.industryVertical)
  return [
    `Compose a ${provider.displayName} caption for a ${vertical.displayName} local business.`,
    `Default language: ${provider.defaultLanguage}`,
    `Brand: ${input.brand.name}`,
    input.brand.description ? `Brand description: ${input.brand.description}` : '',
    input.brand.tone ? `Brand tone: ${input.brand.tone}` : '',
    input.brand.address ? `Address: ${input.brand.address}` : '',
    input.brand.website ? `Website: ${input.brand.website}` : '',
    input.brand.phone ? `Phone: ${input.brand.phone}` : '',
    `Brief theme: ${input.brief.theme}`,
    input.brief.customerIntent ? `Customer intent: ${input.brief.customerIntent}` : '',
    input.brief.localProof?.length ? `Local proof: ${input.brief.localProof.join(', ')}` : '',
    `Use this hook: ${hook.text}`,
    `Max caption length: ${provider.maxCaptionLength}`,
    `Hashtag rule: allow=${provider.hashtagRules.allowHashtags}, max=${provider.hashtagRules.max ?? 'none'}`,
    `Return JSON: { "caption": string, "hashtags": string[] }`,
    formatKnowledge(knowledge),
  ].filter(Boolean).join('\n')
}

function buildRewritePrompt(
  input: PlatformContentInput,
  hook: HookCandidate,
  content: ComposedContent,
  rewriteInstruction: string,
): string {
  return [
    `Rewrite the ${input.platform} content while preserving the brief and hook.`,
    `Hook: ${hook.text}`,
    `Current caption: ${content.caption}`,
    `Current hashtags: ${content.hashtags.join(', ')}`,
    rewriteInstruction,
    `Return JSON: { "caption": string, "hashtags": string[] }`,
  ].join('\n')
}

function formatKnowledge(knowledge: KnowledgeEntry[]): string {
  if (knowledge.length === 0) return 'Knowledge: none'
  return `Knowledge:\n${knowledge.map((entry) => `- [${entry.category}] ${entry.title}: ${entry.content}`).join('\n')}`
}
