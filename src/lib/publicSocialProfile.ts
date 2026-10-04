export type RecordedPublicSocialProfile = {
  displayName: string | null
  followerCount: number | null
  profileUrl: string | null
  snapshotAt: Date | null
  followerCountUpdatedAt: Date | null
}

export function publicSocialProfileResponse(input: {
  platform: 'instagram' | 'facebook'
  handle: string
  account: RecordedPublicSocialProfile | null
}) {
  const { platform, handle, account } = input
  const observedAt = account?.followerCountUpdatedAt ?? account?.snapshotAt ?? null
  const displayName = account?.displayName?.trim() || null
  const profileUrl = account?.profileUrl?.trim() || null

  return {
    success: true,
    platform,
    handle,
    displayName,
    followerCount: account?.followerCount ?? null,
    postCount: null,
    avgEngagementRate: null,
    bio: null,
    profileUrl,
    source: account ? 'database_record' : 'unavailable',
    availabilityStatus: account ? 'RECORDED' : 'MISSING',
    verificationStatus: 'UNVERIFIED',
    displayStatus: account ? '已记录，未实时验证' : '未验证／待补充',
    requiresVerification: true,
    observedAt: observedAt?.toISOString() ?? null,
    missingFields: [
      ...(!displayName ? ['displayName'] : []),
      ...(account?.followerCount == null ? ['followerCount'] : []),
      'postCount',
      'avgEngagementRate',
      'bio',
      ...(!profileUrl ? ['profileUrl'] : []),
    ],
  }
}
