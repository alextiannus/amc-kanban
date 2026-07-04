import { BasePlatformCopywriter, type BodyPromptContext, type HookPromptContext } from './base.ts'

export class XiaohongshuCopywriter extends BasePlatformCopywriter {
  profile = {
    platform: 'xiaohongshu' as const,
    name: 'Xiaohongshu Copywriter',
    version: 'xiaohongshu-copywriter@1.0.0',
    description: 'Chinese local lifestyle writer for Xiaohongshu posts with practical notes and native formatting.',
    bestFor: ['种草', '本地生活打卡', '实用攻略', '收藏转发'],
    promptStyle: '中文、具体、生活感、短段落、强本地信号',
    maxConcurrentJobs: 6,
  }

  protected hookDirectives(_context: HookPromptContext): string[] {
    return [
      '所有 hook 默认使用简体中文。',
      'Hook 要像真实小红书本地生活笔记，不要像广告口号。',
      '分别生成地理打卡、痛点共鸣、反常识/实用发现三个角度。',
      '避免“我不允许还有人不知道”等过度模板化表达。',
    ]
  }

  protected bodyDirectives(_context: BodyPromptContext): string[] {
    return [
      '正文使用简体中文，短段落，适合手机阅读。',
      '可以使用少量 emoji 做视觉分隔，但不要堆砌。',
      '先给真实场景，再给体验细节，最后给收藏/评论/咨询的自然动作。',
      '用“我会怎么选/适合谁/避坑点/本地动线”来增加真实感，不要只写品牌优点。',
      '重点写清楚本地场景、适合谁、为什么值得去/咨询/收藏。',
      '如果有地址或区域，使用自然的 📍 信息。',
      'Hashtags 使用中文本地生活标签，数量控制在 3-10 个。',
    ]
  }
}
