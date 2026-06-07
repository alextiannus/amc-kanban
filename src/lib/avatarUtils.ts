/**
 * Convert a user/agent record's binary avatar data to a data URI.
 * Works for any object that may have avatarData + avatarMimeType fields.
 * Returns the data URI string, or falls back to the legacy `avatar` field, or null.
 */
export function resolveAvatarUrl(entity: {
  avatar?: string | null
  avatarData?: Buffer | Uint8Array | null
  avatarMimeType?: string | null
}): string | null {
  if (entity.avatarData && entity.avatarMimeType) {
    const base64 = Buffer.from(entity.avatarData).toString('base64')
    return `data:${entity.avatarMimeType};base64,${base64}`
  }
  return entity.avatar ?? null
}

/**
 * The Prisma select fields needed to support resolveAvatarUrl.
 */
export const avatarSelect = {
  avatar: true,
  avatarData: true,
  avatarMimeType: true,
} as const

type AvatarEntity = {
  avatar?: string | null
  avatarData?: Buffer | Uint8Array | null
  avatarMimeType?: string | null
}

/**
 * Strip raw binary avatar fields from a response object and inject resolved URL.
 */
export function withResolvedAvatar<T extends AvatarEntity>(
  entity: T
): Omit<T, 'avatarData' | 'avatarMimeType'> & { avatar: string | null } {
  const { avatarData, avatarMimeType, ...rest } = entity
  return {
    ...rest,
    avatar: resolveAvatarUrl({ avatar: entity.avatar, avatarData, avatarMimeType }),
  }
}
