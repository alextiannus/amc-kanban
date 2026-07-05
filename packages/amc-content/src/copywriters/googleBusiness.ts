import { BasePlatformCopywriter, type BodyPromptContext, type HookPromptContext, type RewritePromptContext } from './base.ts'

export class GoogleBusinessCopywriter extends BasePlatformCopywriter {
  profile = {
    platform: 'google_business' as const,
    name: 'Google Business Copywriter',
    version: 'google-business-copywriter@1.0.0',
    description: 'Concise location-first writer for Google Business Profile and Google Maps local updates.',
    bestFor: ['local SEO', 'address/contact clarity', 'booking intent', 'offer/event updates'],
    promptStyle: 'professional, factual, concise, CTA-led',
    maxConcurrentJobs: 10,
  }

  protected hookDirectives(_context: HookPromptContext): string[] {
    return [
      'Hooks should read like useful Google Business update headlines, not social media clickbait.',
      'Default language can be English or Chinese. Match clear brand or brief language signals; if there is no signal, either is acceptable.',
      'Prioritize service, location, offer, or appointment value.',
      'Avoid emojis, hashtags, vague hype, and influencer language.',
    ]
  }

  protected bodyDirectives(_context: BodyPromptContext): string[] {
    return [
      'Keep the post concise, factual, and location-centric.',
      'Use English or Chinese naturally. Follow the brief language when obvious; otherwise either language is acceptable for Google Business.',
      'Include address or area when available.',
      'Include a direct CTA such as visit, book, contact, learn more, or use the Google Business call button.',
      'Do not write a phone number in the post text; Google Business Profile posts should use the native Call now button.',
      'Return an empty hashtags array because Google Business should not use hashtags.',
    ]
  }

  protected rewriteDirectives(_context: RewritePromptContext): string[] {
    return [
      'Remove hashtags and social slang.',
      'Remove phone numbers from the post text and refer to the native Call now button instead.',
      'Ensure the rewrite includes a clear CTA and address/location if available.',
    ]
  }
}
