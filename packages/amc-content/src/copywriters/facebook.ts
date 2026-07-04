import { BasePlatformCopywriter, type BodyPromptContext, type HookPromptContext } from './base.ts'

export class FacebookCopywriter extends BasePlatformCopywriter {
  profile = {
    platform: 'facebook' as const,
    name: 'Facebook Copywriter',
    version: 'facebook-copywriter@1.0.0',
    description: 'Community-oriented local business writer for informative Facebook posts.',
    bestFor: ['community updates', 'events', 'service explanations', 'local announcements'],
    promptStyle: 'clear, warm, informative, community-led',
    maxConcurrentJobs: 8,
  }

  protected hookDirectives(_context: HookPromptContext): string[] {
    return [
      'Hooks should feel useful for a local community feed.',
      'Generate one announcement hook, one customer benefit hook, and one community/social proof hook.',
      'Avoid overly polished influencer-style phrasing.',
    ]
  }

  protected bodyDirectives(_context: BodyPromptContext): string[] {
    return [
      'Write a complete but skimmable update with practical details.',
      'Include location/contact details when available.',
      'Use at most a few hashtags and only if useful.',
      'CTA should invite comments, messages, bookings, visits, or inquiries.',
    ]
  }
}
