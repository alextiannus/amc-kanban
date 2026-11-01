/** Social Inbox writes require its human-confirmed, persisted-item flow. */
export function requiresSocialInbox(platform: unknown): boolean {
  return typeof platform === 'string' && ['instagram', 'tiktok', 'facebook', 'threads']
    .includes(platform.trim().toLowerCase())
}

export const SOCIAL_INBOX_REQUIRED = 'SOCIAL_INBOX_REQUIRED: Open Social Inbox and confirm this reply there. Legacy review tools cannot send replies for this platform.'

export function mcpActionPermission(name: string, input: { actionType?: unknown }): string | null {
  if (name !== 'execute_brand_action') return null
  if (input.actionType === 'publish_post') return 'content.publish'
  if (input.actionType === 'reply_review' || input.actionType === 'domestic_reply_review') return 'review.reply'
  return null
}

export function legacyMcpInboxWrite(name: string, input: { actionType?: unknown; platform?: unknown }): boolean {
  const reply = ['board_reply_review', 'reply_review', 'postfast_reply_review'].includes(name)
    || (name === 'execute_brand_action' && ['reply_review', 'domestic_reply_review'].includes(String(input.actionType)))
  return reply && requiresSocialInbox(input.platform)
}
