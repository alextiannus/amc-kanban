export interface AssignmentPoolConfig {
  id: string
  enabled: boolean
  overflowPolicy: 'fallback_only' | 'pending_queue' | 'allow_soft_overflow'
  rebalancePolicy: 'manual_only' | 'scheduled_daily'
  matchingOrder: 'industry_first' | 'region_first'
  fallbackAgentId: string | null
}

export interface AssignmentPoolMember {
  id: string
  agentId: string
  agentNickname: string | null
  agentEmail: string | null
  active: boolean
  capacity: number
  priority: number
  industries: string[]
  regions: string[]
  currentLoad: number
  availableSlots: number
  overloaded: boolean
}

export interface AssignmentDecision {
  id: string
  subjectType: string
  subjectId: string
  matchedBy: string | null
  selectedAgentId: string | null
  reason: string | null
  overflowHandled: boolean
  fallbackUsed: boolean
  createdAt: string
}
