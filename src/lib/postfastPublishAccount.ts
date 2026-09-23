import { postfastFetchAccounts } from './integrations/postfast.ts'
import { resolveLocalPublishAccount, withBoundAccount, SocialAccountBindingError } from './socialAccountBinding.ts'
import { providerForLocal } from './socialAccountIdentity.ts'
import { postfastAccountHealthError } from './postfastAccountHealth.ts'

/** Live provider check; use before deleting an old schedule and again before delivery. */
export async function checkPostfastPublishAccount(input: { apiKey: string; platform: string; accountId?: string; brandId?: string }, timeoutMs = 5_000) {
  const result = await postfastFetchAccounts(input.apiKey, timeoutMs)
  if (!result.success) return { success: false as const, status: 503, code: 'POSTFAST_ACCOUNT_CHECK_FAILED', error: `无法确认发布账号状态，未继续排期。${result.error || '请稍后重试。'}` }
  try {
    const binding = await resolveLocalPublishAccount(input, result.accounts)
    await withBoundAccount(binding.local.id, async (current, tx) => {
      if (current.brandId !== binding.local.brandId || !providerForLocal(current, [binding.remote])) throw new SocialAccountBindingError('账号绑定已变化，请刷新后重试。')
      await tx.socialAccount.update({ where: { id: current.id }, data: {
        connectionStatus: binding.remote.connectionStatus,
        disabledReason: binding.remote.connectionStatus === 'CONNECTED' ? null : binding.remote.disabledReason || null,
      } })
    })
    const issue = postfastAccountHealthError(binding.remote)
    if (issue) return { success: false as const, status: 409, ...issue }
    return { success: true as const, binding, accounts: result.accounts }
  } catch (error) {
    return { success: false as const, status: error instanceof SocialAccountBindingError ? error.status : 503,
      code: error instanceof SocialAccountBindingError ? error.code : 'ACCOUNT_BINDING_UNAVAILABLE',
      error: error instanceof Error ? error.message : '无法确认账号绑定状态。' }
  }
}
