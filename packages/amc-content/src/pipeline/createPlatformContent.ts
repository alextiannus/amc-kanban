import { getPlatformProvider } from '../platforms/registry.ts'
import { getVerticalSpec } from '../verticals/registry.ts'
import { getPlatformCopywriter } from '../copywriters/registry.ts'
import { resolveContentModelProfile } from '../modelProfiles.ts'
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
  const startedAt = Date.now()
  const provider = getPlatformProvider(input.platform)
  const copywriter = getPlatformCopywriter(input.platform)
  const vertical = getVerticalSpec(input.brief.industryVertical)
  const hookProfile = resolveContentModelProfile(input.platform, 'hook_generation')
  const bodyProfile = resolveContentModelProfile(input.platform, 'body_composition')
  const rewriteProfile = resolveContentModelProfile(input.platform, 'quality_rewrite')
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
    prompt: await withTuningNotes(input, 'hook_generation', copywriter.buildHookPrompt({ input, knowledge })),
    modelProfileId: hookProfile.id,
    maxTokens: hookProfile.maxTokensByTask.hook_generation ?? 900,
  })

  const selectedHook = selectHook(normalizeHookCandidates(hookModel.data.hooks, input), input.recentHooks)

  const bodyModel = await input.adapters.modelRouter.generateJson<ComposedContent>({
    task: 'body_composition',
    platform: input.platform,
    vertical: input.brief.industryVertical,
    prompt: await withTuningNotes(input, 'body_composition', copywriter.buildBodyPrompt({ input, hook: selectedHook, knowledge })),
    modelProfileId: bodyProfile.id,
    maxTokens: bodyProfile.maxTokensByTask.body_composition ?? 1400,
  })

  let content = normalizeComposedContent(bodyModel.data, input.platform)
  let quality = copywriter.validate(input, content)

  if (!quality.passed && quality.rewriteInstruction) {
    const rewriteModel = await input.adapters.modelRouter.generateJson<ComposedContent>({
      task: 'quality_rewrite',
      platform: input.platform,
      vertical: input.brief.industryVertical,
      prompt: await withTuningNotes(
        input,
        'quality_rewrite',
        copywriter.buildRewritePrompt({
          input,
          hook: selectedHook,
          content,
          rewriteInstruction: quality.rewriteInstruction,
        }),
      ),
      modelProfileId: rewriteProfile.id,
      maxTokens: rewriteProfile.maxTokensByTask.quality_rewrite ?? 1400,
    })
    content = normalizeComposedContent(rewriteModel.data, input.platform)
    quality = copywriter.validate(input, content)
  }

  const provenance = {
    platformSkillVersion: copywriter.profile.version,
    verticalSkillVersion: vertical.skillVersion,
    knowledgeEntryIds: knowledge.map((entry) => entry.id),
    modelId: bodyModel.modelId ?? hookModel.modelId,
    modelProfileId: bodyProfile.id,
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
    latencyMs: Date.now() - startedAt,
    input: {
      brandId: input.brand.id,
      brief: input.brief,
      media: input.media,
      platformCopywriter: copywriter.profile,
      modelProfiles: {
        hook: hookProfile.id,
        body: bodyProfile.id,
        rewrite: rewriteProfile.id,
      },
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
