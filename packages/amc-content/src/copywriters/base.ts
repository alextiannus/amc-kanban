import { getPlatformProvider } from '../platforms/registry.ts'
import { getVerticalSpec } from '../verticals/registry.ts'
import { runDeterministicGate } from '../quality/deterministicGate.ts'
import type {
  ComposedContent,
  HookCandidate,
  KnowledgeEntry,
  PlatformContentInput,
  QualityResult,
} from '../types.ts'

export type CopywriterTask = 'hook_generation' | 'body_composition' | 'quality_rewrite'

export interface PlatformCopywriterProfile {
  platform: PlatformContentInput['platform']
  name: string
  version: string
  description: string
  bestFor: string[]
  promptStyle: string
  maxConcurrentJobs: number
}

export interface HookPromptContext {
  input: PlatformContentInput
  knowledge: KnowledgeEntry[]
}

export interface BodyPromptContext {
  input: PlatformContentInput
  hook: HookCandidate
  knowledge: KnowledgeEntry[]
}

export interface RewritePromptContext {
  input: PlatformContentInput
  hook: HookCandidate
  content: ComposedContent
  rewriteInstruction: string
}

export interface PlatformCopywriter {
  profile: PlatformCopywriterProfile
  buildHookPrompt(context: HookPromptContext): string
  buildBodyPrompt(context: BodyPromptContext): string
  buildRewritePrompt(context: RewritePromptContext): string
  validate(input: PlatformContentInput, content: ComposedContent): QualityResult
}

export abstract class BasePlatformCopywriter implements PlatformCopywriter {
  abstract profile: PlatformCopywriterProfile

  protected abstract hookDirectives(context: HookPromptContext): string[]
  protected abstract bodyDirectives(context: BodyPromptContext): string[]

  buildHookPrompt(context: HookPromptContext): string {
    const { input, knowledge } = context
    const provider = getPlatformProvider(input.platform)
    const vertical = getVerticalSpec(input.brief.industryVertical)
    return [
      `Copywriter provider: ${this.profile.name} v${this.profile.version}`,
      `Generate hook candidates for ${provider.displayName}.`,
      `Brand: ${input.brand.name}`,
      `Vertical: ${vertical.displayName}`,
      `Theme: ${input.brief.theme}`,
      `Angle: ${input.brief.angle ?? 'choose the strongest local-service angle'}`,
      input.brief.customerIntent ? `Customer intent: ${input.brief.customerIntent}` : '',
      input.brief.locationFocus ? `Location focus: ${input.brief.locationFocus}` : '',
      input.brief.mustAvoid?.length ? `Must avoid: ${input.brief.mustAvoid.join(', ')}` : '',
      `Allowed hook categories: ${provider.hookCategories.join(', ')}`,
      ...this.hookDirectives(context),
      `Return JSON: { "hooks": [{ "text": string, "category": string, "score": number, "reason": string }] }`,
      `Rules: avoid generic AI phrases, make every hook platform-native, and use a different category for each hook.`,
      formatMedia(input.media),
      formatKnowledge(knowledge),
    ].filter(Boolean).join('\n')
  }

  buildBodyPrompt(context: BodyPromptContext): string {
    const { input, hook, knowledge } = context
    const provider = getPlatformProvider(input.platform)
    const vertical = getVerticalSpec(input.brief.industryVertical)
    return [
      `Copywriter provider: ${this.profile.name} v${this.profile.version}`,
      `Compose a ${provider.displayName} caption for a ${vertical.displayName} local business.`,
      `Default language: ${provider.defaultLanguage}`,
      `Brand: ${input.brand.name}`,
      input.brand.description ? `Brand description: ${input.brand.description}` : '',
      input.brand.tone ? `Brand tone: ${input.brand.tone}` : '',
      input.brand.address ? `Address: ${input.brand.address}` : '',
      input.brand.location ? `Location: ${input.brand.location}` : '',
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
      ...this.bodyDirectives(context),
      `Max caption length: ${provider.maxCaptionLength}`,
      `Hashtag rule: allow=${provider.hashtagRules.allowHashtags}, min=${provider.hashtagRules.min ?? 0}, max=${provider.hashtagRules.max ?? 'none'}`,
      `Return JSON: { "caption": string, "hashtags": string[] }`,
      formatKnowledge(knowledge),
    ].filter(Boolean).join('\n')
  }

  buildRewritePrompt(context: RewritePromptContext): string {
    const { input, hook, content, rewriteInstruction } = context
    return [
      `Copywriter provider: ${this.profile.name} v${this.profile.version}`,
      `Rewrite the ${input.platform} content while preserving the brief, platform voice, and selected hook.`,
      `Hook: ${hook.text}`,
      `Current caption: ${content.caption}`,
      `Current hashtags: ${content.hashtags.join(', ')}`,
      rewriteInstruction,
      ...this.rewriteDirectives(context),
      `Return JSON: { "caption": string, "hashtags": string[] }`,
    ].join('\n')
  }

  validate(input: PlatformContentInput, content: ComposedContent): QualityResult {
    return runDeterministicGate({
      platform: input.platform,
      vertical: input.brief.industryVertical,
      brand: input.brand,
      media: input.media,
      content,
    })
  }

  protected rewriteDirectives(_context: RewritePromptContext): string[] {
    return ['Do not introduce new facts, unsupported offers, or claims that were not in the brief.']
  }
}

export function formatKnowledge(knowledge: KnowledgeEntry[]): string {
  if (knowledge.length === 0) return 'Knowledge: none'
  return `Knowledge:\n${knowledge.map((entry) => `- [${entry.category}] ${entry.title}: ${entry.content}`).join('\n')}`
}

export function formatMedia(media: PlatformContentInput['media']): string {
  if (!media?.length) return 'Media: none'
  return `Media:\n${media.map((item, index) => [
    `- Asset ${index + 1}: ${item.url}`,
    item.category ? `category=${item.category}` : '',
    item.tags?.length ? `tags=${item.tags.join(', ')}` : '',
    item.caption ? `caption=${item.caption}` : '',
  ].filter(Boolean).join('; ')).join('\n')}`
}
