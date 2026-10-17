export const DEFAULT_FOLLOW_REWARD_DESCRIPTION = '关注账号，可获赠饮品一份'
const DEFAULT_FOLLOW_REWARD_EN = 'Follow us and enjoy a complimentary drink.'

/** Null means not configured; an explicitly saved empty string disables the offer. */
export function followRewardDescription(value: string | null | undefined, locale: 'zh' | 'en' = 'zh') {
  const text = value?.trim() ?? DEFAULT_FOLLOW_REWARD_DESCRIPTION
  return text === DEFAULT_FOLLOW_REWARD_DESCRIPTION || text === DEFAULT_FOLLOW_REWARD_EN
    ? locale === 'en' ? DEFAULT_FOLLOW_REWARD_EN : DEFAULT_FOLLOW_REWARD_DESCRIPTION
    : text
}
