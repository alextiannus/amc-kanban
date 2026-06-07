export interface Prize {
  id: string
  name: string
  type: string
  probability: number
  totalInventory: number | null
  claimedCount: number
  imageUrl: string | null
}

export interface GameConfig {
  title: string
  description: string
  themeColor: string
  taskPhotoEnabled: boolean
  taskReviewEnabled: boolean
  taskGoogleMapsEnabled: boolean
  taskXiaohongshuEnabled: boolean
  taskInstagramEnabled: boolean
  maxSpinsPerUserDay: number
  templateType: 'WHEEL' | 'GRID'
  brand?: {
    name: string
    location: string | null
    googlePlaceId: string | null
    googleBusinessUrl?: string | null
    googleReviewUrl?: string | null
    accounts: Array<{
      platformId: string
      profileUrl: string | null
      handle: string
    }>
  }
}

export interface UnclaimedPrize {
  logId: string
  prizeName: string
  prizeType: string
  redemptionCode: string
  createdAt: string
}

export type ConfettiParticle = {
  x: number
  y: number
  r: number
  d: number
  color: string
  tilt: number
  tiltAngleIncremental: number
  tiltAngle: number
}

export function allocateGridSlots(prizesList: Prize[]): Prize[] {
  const activePrizes = prizesList.filter((p) => p.probability > 0 || p.name)
  if (activePrizes.length === 0) return []

  if (activePrizes.length <= 8) {
    const allocatedCounts = activePrizes.map(() => 1)
    let remainingSlots = 8 - activePrizes.length

    while (remainingSlots > 0) {
      let bestIndex = -1
      let maxDeficit = -Infinity

      for (let i = 0; i < activePrizes.length; i++) {
        const targetFraction = 8 * activePrizes[i].probability
        const deficit = targetFraction - allocatedCounts[i]
        if (deficit > maxDeficit) {
          maxDeficit = deficit
          bestIndex = i
        }
      }

      if (bestIndex !== -1) {
        allocatedCounts[bestIndex]++
        remainingSlots--
      } else {
        break
      }
    }

    const rawSlots: Prize[] = []
    activePrizes.forEach((prize, idx) => {
      const count = allocatedCounts[idx]
      for (let c = 0; c < count; c++) {
        rawSlots.push(prize)
      }
    })

    const counts: { [key: string]: number } = {}
    rawSlots.forEach((item) => {
      const key = item.id || item.name
      counts[key] = (counts[key] || 0) + 1
    })

    const uniquePrizes = [...activePrizes].sort((a, b) => {
      const keyA = a.id || a.name
      const keyB = b.id || b.name
      return counts[keyB] - counts[keyA]
    })

    const orderedSlots: Prize[] = new Array(8).fill(null)
    const order = [0, 2, 4, 6, 1, 3, 5, 7]

    const sortedSlots: Prize[] = []
    uniquePrizes.forEach((prize) => {
      const key = prize.id || prize.name
      const count = counts[key] || 0
      for (let i = 0; i < count; i++) {
        sortedSlots.push(prize)
      }
    })

    for (let i = 0; i < 8; i++) {
      orderedSlots[order[i]] = sortedSlots[i]
    }

    return orderedSlots
  }

  const sorted = [...activePrizes].sort((a, b) => b.probability - a.probability)
  return sorted.slice(0, 8)
}
