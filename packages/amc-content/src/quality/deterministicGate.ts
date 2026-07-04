import type {
  BrandContext,
  ComposedContent,
  MediaAssetContext,
  PlatformType,
  QualityIssue,
  QualityResult,
} from '../types'
import { getPlatformProvider } from '../platforms/registry'
import { getVerticalSpec } from '../verticals/registry'
import type { IndustryVertical } from '../types'

export interface DeterministicGateInput {
  platform: PlatformType
  vertical: IndustryVertical
  brand: BrandContext
  media?: MediaAssetContext[]
  content: ComposedContent
}

export function runDeterministicGate(input: DeterministicGateInput): QualityResult {
  const provider = getPlatformProvider(input.platform)
  const vertical = getVerticalSpec(input.vertical)
  const issues: QualityIssue[] = [
    ...provider.validateText(input.content),
    ...validateBrandRules(input.brand, input.content.caption),
    ...validateRequiredFields(input),
    ...validateMediaRules(input),
  ]

  if (vertical.vertical === 'healthcare_clinic') {
    issues.push(...findAny(input.content.caption, ['cure', 'guaranteed results', 'diagnose'], 'healthcare_claim'))
  }
  if (vertical.vertical === 'education_training') {
    issues.push(...findAny(input.content.caption, ['guaranteed grades', 'guaranteed admission'], 'education_guarantee'))
  }
  if (vertical.vertical === 'home_renovation') {
    issues.push(...findAny(input.content.caption, ['cheapest', 'lowest price guaranteed'], 'price_claim'))
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const score = Math.max(0, 1 - errorCount * 0.25 - warningCount * 0.08)

  return {
    passed: errorCount === 0,
    score,
    issues,
    rewriteInstruction: issues.length
      ? `Rewrite to fix: ${issues.map((issue) => issue.message).join('; ')}`
      : undefined,
  }
}

function validateBrandRules(brand: BrandContext, caption: string): QualityIssue[] {
  const issues: QualityIssue[] = []
  for (const phrase of brand.negativePrompts ?? []) {
    if (caption.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push({
        code: 'brand_negative_prompt',
        severity: 'error',
        message: `Caption contains brand-banned phrase: ${phrase}`,
      })
    }
  }
  for (const term of brand.requiredTerms ?? []) {
    if (!caption.toLowerCase().includes(term.toLowerCase())) {
      issues.push({
        code: 'missing_required_term',
        severity: 'warning',
        message: `Caption is missing preferred brand term: ${term}`,
      })
    }
  }
  return issues
}

function validateRequiredFields(input: DeterministicGateInput): QualityIssue[] {
  const provider = getPlatformProvider(input.platform)
  const issues: QualityIssue[] = []
  if (provider.requiredFields?.includes('address') && !input.brand.address && !input.brand.location) {
    issues.push({
      code: 'missing_address',
      severity: 'error',
      message: `${provider.displayName} content needs an address or location.`,
    })
  }
  if (provider.requiredFields?.includes('website') && !input.brand.website) {
    issues.push({
      code: 'missing_website',
      severity: 'warning',
      message: `${provider.displayName} content should include a website when available.`,
    })
  }
  return issues
}

function validateMediaRules(input: DeterministicGateInput): QualityIssue[] {
  const provider = getPlatformProvider(input.platform)
  const media = input.media ?? []
  const issues: QualityIssue[] = []
  if (provider.mediaRules.required && media.length === 0) {
    issues.push({
      code: 'media_required',
      severity: 'error',
      message: `${provider.displayName} requires media.`,
    })
  }
  if (provider.mediaRules.maxItems !== undefined && media.length > provider.mediaRules.maxItems) {
    issues.push({
      code: 'too_many_media_items',
      severity: 'error',
      message: `${provider.displayName} allows at most ${provider.mediaRules.maxItems} media items.`,
    })
  }
  if (!provider.mediaRules.allowVideo && media.some((item) => item.mimeType?.startsWith('video/') || item.url.includes('.mp4'))) {
    issues.push({
      code: 'video_not_allowed',
      severity: 'error',
      message: `${provider.displayName} does not support video for this content type.`,
    })
  }
  return issues
}

function findAny(caption: string, phrases: string[], code: string): QualityIssue[] {
  return phrases
    .filter((phrase) => caption.toLowerCase().includes(phrase.toLowerCase()))
    .map((phrase) => ({
      code,
      severity: 'error' as const,
      message: `Caption contains restricted claim: ${phrase}`,
    }))
}
