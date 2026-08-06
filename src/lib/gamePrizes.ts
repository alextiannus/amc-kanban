export type PrizeIdentity = {
  name: string
  type: string
}

export type PrizeSnapshotSource = PrizeIdentity & {
  imageUrl?: string | null
}

export function hasPrizeIdentityChanged(
  existing: PrizeIdentity,
  incoming: PrizeIdentity,
): boolean {
  return existing.name !== incoming.name || existing.type !== incoming.type
}

export function buildPrizeSnapshot(prize: PrizeSnapshotSource) {
  return {
    prizeNameSnapshot: prize.name,
    prizeTypeSnapshot: prize.type,
    prizeImageSnapshot: prize.imageUrl ?? null,
  }
}
