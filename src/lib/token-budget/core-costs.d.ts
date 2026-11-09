/** Public Core candidate.114 monetary port; mirrors costs/provider.js. */
declare module "@immedi/iaic-core/costs/provider.js" {
  export type ProviderCostBasis = {
    format: "iaic.provider-cost.v1";
    revision: string;
    currency: string;
    minorUnitScale: number;
    bearer: "platform" | "user";
    accountReference: string;
    model: string;
    inputPerMillionMinor: string;
    cachedInputPerMillionMinor: string;
    outputPerMillionMinor: string;
    missingCachedInput: "uncached" | "incomplete";
  };
  export function providerCostBasis(
    value: unknown,
    options?: { mode?: string; model?: string | null },
  ): ProviderCostBasis;
  export function estimateProviderCost(
    usage: {
      inputTokens: string | number;
      outputTokens: string | number;
      cachedInputTokens?: string | number | null;
    },
    basis: unknown,
  ): {
    kind: "usage_rate_estimate";
    currency: string;
    minorUnitScale: number;
    minorUnitsNumerator: string;
    denominator: string;
    cacheUsage: string;
  } | null;
}
