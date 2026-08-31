export type Brand = {
  id: string
  name: string
  status?: string | null
}

export type InspirationBrief = {
  coreAngle?: string
  fitReason?: string
  [key: string]: unknown
}

export type Inspiration = {
  id: string
  title: string
  largeScene: string
  smallScene: string
  directionName: string
  reviewStatus: string
  score: number
  brief?: InspirationBrief
}

export type InspirationGap = {
  directionName: string
  missingFactKeys: string[]
}

export type InspirationLibrary = {
  id: string
  version: number
  state: string
  refreshAvailable: boolean
  gaps: InspirationGap[]
  inspirations: Inspiration[]
}

export type PromotionPlanItem = {
  id: string
  weekNumber: number
  suggestedDate: string
  platform: string
  contentFormat: string
  title: string
  coreAngle: string
  materialDueDate?: string | null
}

export type PromotionPlan = {
  id: string
  version: number
  periodDays: number
  startDate: string
  state: string
  items: PromotionPlanItem[]
}

export type MediaAsset = {
  id: string
  filename?: string | null
}

export type MaterialSubmission = {
  id: string
  status: string
  asset: MediaAsset
}

export type MaterialRequirement = {
  id: string
  remotePlanId: string
  requirementKey: string
  status: string
  specification: {
    subject?: string
    scene?: string
    quantity?: number
    aspectRatio?: string
  }
  submissions?: MaterialSubmission[]
}

export type PlanningData = {
  completeness?: { score?: number } | null
  libraries?: InspirationLibrary[]
  plans?: PromotionPlan[]
  requirements?: MaterialRequirement[]
  assets?: MediaAsset[]
}
