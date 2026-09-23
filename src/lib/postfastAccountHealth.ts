/** Shared UI/server presentation of provider account health. Never treat a revoked token as an AMC session error. */
export function postfastAccountHealthError(account: {
  connectionStatus?: string | null; disabledReason?: string | null; connected?: boolean;
  platformId?: string | null; handle?: string | null; displayName?: string | null;
}) {
  const status = (account.connectionStatus || '').toUpperCase()
  if (!['DISABLED', 'EXPIRED', 'DISCONNECTED'].includes(status) && account.connected !== false) return null
  const label = [account.platformId, account.handle || account.displayName].filter(Boolean).join(' / ') || '所选社交账号'
  const reason = (account.disabledReason || '').toUpperCase()
  const description = reason === 'TOKEN_REVOKED' ? '发布授权已被撤销'
    : reason === 'PERMISSION_REVOKED' ? '发布权限已被撤销'
    : reason === 'ACCOUNT_SUSPENDED' ? '被平台暂停使用'
    : status === 'EXPIRED' ? '发布授权已过期'
    : status === 'DISCONNECTED' || account.connected === false ? '已断开连接' : '已暂停发布'
  const recovery = reason === 'ACCOUNT_SUSPENDED'
    ? '请先在社交平台恢复账号，再到品牌设置重新连接并重试排期。'
    : '请由账号持有人前往品牌设置重新连接该账号，完成授权后再重试排期。'
  return { code: 'POSTFAST_ACCOUNT_DISABLED' as const, error: `${label} ${description}，暂时无法排期或发布。${recovery}` }
}
