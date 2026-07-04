import { BasePlatformCopywriter, type BodyPromptContext, type HookPromptContext } from './base.ts'

export class InstagramCopywriter extends BasePlatformCopywriter {
  profile = {
    platform: 'instagram' as const,
    name: 'Instagram Copywriter',
    version: 'instagram-copywriter@1.0.0',
    description: 'Visual-first local lifestyle caption writer for polished Instagram feed posts and Reels captions.',
    bestFor: ['visual storytelling', 'brand feel', 'local discovery', 'save/share behavior'],
    promptStyle: 'premium, concrete, image-aware, lightly editorial',
    maxConcurrentJobs: 8,
  }

  protected hookDirectives(_context: HookPromptContext): string[] {
    return [
      'Hooks must be 80-125 characters and feel native to Instagram.',
      'Generate one benefit hook, one visual curiosity hook, and one local/social proof hook.',
      'Avoid clickbait, salesy openings, and generic lifestyle filler.',
    ]
  }

  protected bodyDirectives(_context: BodyPromptContext): string[] {
    return [
      'Write with clean line breaks and image-aware details.',
      'Put the strongest search keywords and local place terms naturally in the caption, not only in hashtags.',
      'Make the first 125 characters work above the fold.',
      'Use short bullets only when they improve scanning.',
      'End with a soft CTA for booking, visiting, saving, or sharing.',
      'Use only 3-5 highly relevant hashtags; mix local, vertical, and brand/search intent tags.',
    ]
  }
}
