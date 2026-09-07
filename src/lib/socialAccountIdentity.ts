export class SocialAccountBindingError extends Error {
  status: number
  code: string
  constructor(message: string, status = 409, code = 'ACCOUNT_BINDING_CONFLICT') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function accountPlatform(value: string) {
  const platform = value.toLowerCase().replace(/[\s_-]/g, '')
  return ['google', 'googlebusiness', 'googlebusinessprofile', 'googlemybusiness', 'googlemaps', 'gbp', 'gmb'].includes(platform)
    ? 'google' : platform === 'twitter' ? 'x' : platform
}

const handleKey = (value?: string | null) => (value || '').trim().replace(/^@/, '').toLowerCase()
const profileKey = (value?: string | null) => (value || '').trim().replace(/\/$/, '').toLowerCase()

export type AccountIdentity = {
  id: string
  platformId: string
  handle: string
  profileUrl?: string | null
  postfastAccountId?: string | null
  unboundAt?: Date | string | null
}

export function sameLegacyAccount(a: AccountIdentity, b: AccountIdentity) {
  return accountPlatform(a.platformId) === accountPlatform(b.platformId) && (
    (Boolean(handleKey(a.handle)) && handleKey(a.handle) === handleKey(b.handle)) ||
    (Boolean(profileKey(a.profileUrl)) && profileKey(a.profileUrl) === profileKey(b.profileUrl))
  )
}

export function uniqueAccount<T>(matches: T[]): T | undefined {
  if (matches.length > 1) throw new SocialAccountBindingError('账号身份存在歧义，请先核对账号绑定。', 409, 'ACCOUNT_IDENTITY_AMBIGUOUS')
  return matches[0]
}

export function localForProvider<T extends AccountIdentity>(locals: T[], remote: AccountIdentity) {
  const exact = uniqueAccount(locals.filter(a => a.postfastAccountId === remote.id))
  if (exact) return exact
  // A stable ID must never be replaced because a different account reused a handle.
  const legacy = uniqueAccount(locals.filter(a => sameLegacyAccount(a, remote)))
  if (legacy?.postfastAccountId && legacy.postfastAccountId !== remote.id) {
    throw new SocialAccountBindingError('账号名称与已有 PostFast 身份冲突，请先核对绑定。', 409, 'ACCOUNT_IDENTITY_AMBIGUOUS')
  }
  return legacy
}

export function providerForLocal<T extends AccountIdentity>(local: AccountIdentity, remotes: T[]) {
  return local.postfastAccountId
    ? uniqueAccount(remotes.filter(a => a.id === local.postfastAccountId))
    : uniqueAccount(remotes.filter(a => sameLegacyAccount(local, a)))
}

export function assertAccountBound(account: { unboundAt?: unknown } | null | undefined) {
  if (!account || account.unboundAt) {
    throw new SocialAccountBindingError('该账号已解除绑定或不可用，请先选择有效的绑定账号。', 409, 'ACCOUNT_UNBOUND')
  }
}
