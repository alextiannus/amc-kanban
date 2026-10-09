export const MARKETING_PLAN_OUTPUT_TOKENS = 8192
export const MARKETING_PLAN_REPAIR_TOKENS = 4096

export function marketingPlanLLMFailureCode(error: unknown, repairTrace?: unknown) {
  const repair = repairTrace && typeof repairTrace === 'object' ? repairTrace as Record<string, unknown> : {}
  return error === 'Text provider output token limit reached' || repair.error === 'Text provider output token limit reached'
    ? 'marketing_plan_output_limit'
    : 'marketing_plan_llm_failed'
}
