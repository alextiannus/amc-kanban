import { BasePlatformCopywriter, type BodyPromptContext, type HookPromptContext } from './base.ts'

export class TikTokCopywriter extends BasePlatformCopywriter {
  profile = {
    platform: 'tiktok' as const,
    name: 'TikTok Copywriter',
    version: 'tiktok-copywriter@1.0.0',
    description: 'Short video caption writer for punchy local discovery and action-oriented TikTok posts.',
    bestFor: ['short video captions', 'fast hooks', 'local discovery', 'trend-adjacent posts'],
    promptStyle: 'short, direct, spoken, video-aware',
    maxConcurrentJobs: 6,
  }

  protected hookDirectives(_context: HookPromptContext): string[] {
    return [
      'Hooks must be very short and sound natural when spoken.',
      'Generate one FOMO hook, one pain-point hook, and one counter-intuitive hook.',
      'Avoid long setup and avoid generic trend language unless the brief provides it.',
    ]
  }

  protected bodyDirectives(_context: BodyPromptContext): string[] {
    return [
      'Caption must be short and video-first.',
      'Use one simple CTA, not a long sales paragraph.',
      'Hashtags should be 2-5 compact tags.',
      'Do not explain too much; leave room for the video to carry the story.',
    ]
  }
}
