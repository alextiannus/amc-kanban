function cutoffIsActive(value: string | undefined, now: number): boolean {
  if (!value) return false
  const cutoffAt = Date.parse(value)
  return Number.isFinite(cutoffAt) && now < cutoffAt
}

export function isLegacyKeyCompatibilityActive(now = Date.now()): boolean {
  return (
    process.env.AUTH_V2_LEGACY_KEYS === 'true' &&
    cutoffIsActive(process.env.AUTH_V2_LEGACY_KEY_CUTOFF_AT, now)
  )
}

export function isLegacySessionCompatibilityActive(now = Date.now()): boolean {
  return cutoffIsActive(process.env.AUTH_V2_LEGACY_SESSION_CUTOFF_AT, now)
}
