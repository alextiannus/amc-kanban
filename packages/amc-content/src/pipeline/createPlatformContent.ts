import { getPlatformProvider } from '../platforms/registry.ts'
import { getVerticalSpec } from '../verticals/registry.ts'
import { runDeterministicGate } from '../quality/deterministicGate.ts'
import type {
  ComposedContent,
  HookCandidate,
  HookCategory,
  KnowledgeEntry,
  PlatformContentInput,
  PlatformContentResult,
} from '../types.ts'

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
    prompt: await withTuningNotes(input, 'hook_generation', buildHookPrompt(input, knowledge)),
    maxTokens: 900,
  })

  const selectedHook = selectHook(normalizeHookCandidates(hookModel.data.hooks, input), input.recentHooks)

  const bodyModel = await input.adapters.modelRouter.generateJson<ComposedContent>({
    task: 'body_composition',
    platform: input.platform,
    vertical: input.brief.industryVertical,
    prompt: await withTuningNotes(input, 'body_composition', buildBodyPrompt(input, selectedHook, knowledge)),
    maxTokens: 1400,
  })

  let content = normalizeComposedContent(bodyModel.data, input.platform)
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
      prompt: await withTuningNotes(
        input,
        'quality_rewrite',
        buildRewritePrompt(input, selectedHook, content, quality.rewriteInstruction),
      ),
      maxTokens: 1400,
    })
    content = normalizeComposedContent(rewriteModel.data, input.platform)
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

async function withTuningNotes(
  input: PlatformContentInput,
  task: 'hook_generation' | 'body_composition' | 'quality_rewrite',
  prompt: string,
): Promise<string> {
  const notes = await input.adapters.promptTuningRepository?.getTuningNotes({
    task,
    platform: input.platform,
    vertical: input.brief.industryVertical,
  })
  if (!notes?.trim()) return prompt
  return [
    prompt,
    '',
    '--- ADMIN PROMPT TUNING NOTES ---',
    notes.trim(),
    '--- END ADMIN PROMPT TUNING NOTES ---',
  ].join('\n')
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

function normalizeHookCandidates(
  hooks: HookCandidate[] | undefined,
  input: PlatformContentInput,
): HookCandidate[] {
  const provider = getPlatformProvider(input.platform)
  const allowedCategories = new Set<HookCategory>(provider.hookCategories)
  const normalized = (hooks ?? [])
    .filter((hook) => hook && typeof hook.text === 'string' && hook.text.trim().length > 0)
    .map((hook) => ({
      text: hook.text.trim(),
      category: allowedCategories.has(hook.category) ? hook.category : provider.hookCategories[0],
      score: clampScore(hook.score),
      reason: hook.reason,
    }))

  return normalized.length > 0
    ? normalized
    : [{
      text: fallbackHookText(input),
      category: provider.hookCategories[0],
      score: 0.5,
      reason: 'Fallback hook generated because the model returned no usable hook candidates.',
    }]
}

function normalizeComposedContent(content: ComposedContent, platform: PlatformContentInput['platform']): ComposedContent {
  const provider = getPlatformProvider(platform)
  const caption = (content.caption ?? '').trim()
  const seen = new Set<string>()
  const hashtags = (content.hashtags ?? [])
    .map((tag) => String(tag).trim().replace(/^#+/, '').replace(/\s+/g, ''))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return {
    caption,
    hashtags: provider.hashtagRules.allowHashtags ? hashtags : [],
  }
}

function clampScore(score: number | undefined): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0.5
  return Math.max(0, Math.min(1, score))
}

function fallbackHookText(input: PlatformContentInput): string {
  return input.platform === 'xiaohongshu'
    ? `${input.brand.name} 本地生活新灵感`
    : `${input.brand.name}: a local update worth checking out`
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
    input.brief.customerIntent ? `Customer intent: ${input.brief.customerIntent}` : '',
    input.brief.locationFocus ? `Location focus: ${input.brief.locationFocus}` : '',
    input.brief.mustAvoid?.length ? `Must avoid: ${input.brief.mustAvoid.join(', ')}` : '',
    `Allowed hook categories: ${provider.hookCategories.join(', ')}`,
    `Return JSON: { "hooks": [{ "text": string, "category": string, "score": number, "reason": string }] }`,
    `Rules: avoid generic AI phrases, make every hook platform-native, and use a different category for each hook.`,
    formatMedia(input.media),
    formatKnowledge(knowledge),
  ].filter(Boolean).join('\n')
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
    input.brief.mustMention?.length ? `Must mention: ${input.brief.mustMention.join(', ')}` : '',
    input.brief.mustAvoid?.length ? `Must avoid: ${input.brief.mustAvoid.join(', ')}` : '',
    vertical.complianceNotes.length ? `Vertical compliance: ${vertical.complianceNotes.join(' ')}` : '',
    formatMedia(input.media),
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

function formatMedia(media: PlatformContentInput['media']): string {
  if (!media?.length) return 'Media: none'
  return `Media:\n${media.map((item, index) => [
    `- Asset ${index + 1}: ${item.url}`,
    item.category ? `category=${item.category}` : '',
    item.tags?.length ? `tags=${item.tags.join(', ')}` : '',
    item.caption ? `caption=${item.caption}` : '',
  ].filter(Boolean).join('; ')).join('\n')}`
}
