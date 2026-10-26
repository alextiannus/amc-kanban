import { SocialAccountBindingError } from './socialAccountIdentity.ts'

export async function lockAccountBinding(tx: any, accountId: string) {
  const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${`social-account:${accountId}`}, 0)) AS locked`
  if (!rows[0]?.locked) throw new SocialAccountBindingError('该账号正在同步或发布，请稍后重试。', 409, 'ACCOUNT_BUSY')
}

export async function lockBrandSync(tx: any, brandId: string, wait = false) {
  const key = `social-account-sync:${brandId}`
  // Draft creation waits for another short local writer instead of racing a
  // find/create pair. Return a boolean, not PostgreSQL's unsupported void type.
  const rows = wait
    ? await tx.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS account_lock`
    : await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`
  if (!rows[0]?.locked) throw new SocialAccountBindingError('账号绑定正在更新，请稍后重试。', 409, 'ACCOUNT_BUSY')
}
