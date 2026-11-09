import {
  providerCostBasis,
  estimateProviderCost,
} from "@immedi/iaic-core/costs/provider.js";
export const TOKEN_BUDGET_POLICY = Object.freeze({
  amount: 100,
  currency: "USD",
  period: "calendar_month",
  timezone: "Asia/Singapore",
  mode: "notify_only",
  enforced: false,
});
export function singaporeMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .slice(0, 7);
}
export function monthWindow(month: string) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    Number(month.slice(0, 4)) < 2000 ||
    Number(month.slice(0, 4)) > 2200
  )
    throw Object.assign(Error("invalid_month"), { status: 400 });
  const [y, m] = month.split("-").map(Number),
    offset = 8 * 3600000;
  return {
    month,
    startsAt: new Date(Date.UTC(y, m - 1, 1) - offset),
    endsAt: new Date(Date.UTC(y, m, 1) - offset),
    days: new Date(Date.UTC(y, m, 0)).getUTCDate(),
  };
}
/** Snapshot the configured physical model price; Core's transport model is a policy alias. */
export function nativeCostBasis(model: any, version: number) {
  const basis = model.definition?.costMetadata?.providerCostBasis;
  if (!basis) return null;
  try {
    const valid = providerCostBasis(basis, {
      mode: "SYSTEM_MANAGED",
      model: model.definition.modelName,
    });
    return providerCostBasis(
      {
        ...valid,
        model: `amc-policy-${version}`,
        revision: `${valid.revision}:policy-${version}:${model.id}`,
      },
      { mode: "SYSTEM_MANAGED", model: `amc-policy-${version}` },
    );
  } catch {
    return null;
  }
}
export const USD_DENOMINATOR = BigInt(10) ** BigInt(18);
export function usageUsdNumerator(group: any): bigint | null {
  if (
    group.state !== "settled" ||
    group.knownCalls !== group.calls ||
    !group.costBasis
  )
    return null;
  try {
    const basis = providerCostBasis(group.costBasis, { mode: group.mode });
    if (basis.currency !== "USD") return null;
    const result = estimateProviderCost(
      {
        inputTokens: group.inputTokens,
        outputTokens: group.outputTokens,
        cachedInputTokens: group.cacheReported ? group.cachedTokens : null,
      },
      basis,
    );
    return result
      ? BigInt(result.minorUnitsNumerator) *
          BigInt(10) ** BigInt(6 - basis.minorUnitScale)
      : null;
  } catch {
    return null;
  }
}
export function average(value: bigint, denominator: number) {
  if (!denominator) return null;
  const n =
    (value * BigInt(100) + BigInt(denominator) / BigInt(2)) /
    BigInt(denominator);
  return `${n / BigInt(100)}.${(n % BigInt(100)).toString().padStart(2, "0")}`;
}
export function usdDisplay(value: bigint) {
  const micros =
    (value + BigInt(10) ** BigInt(12) / BigInt(2)) / BigInt(10) ** BigInt(12);
  return `${micros / BigInt(1000000)}.${(micros % BigInt(1000000)).toString().padStart(6, "0")}`;
}
