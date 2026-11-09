import { prisma } from "../prisma";
import {
  TOKEN_BUDGET_POLICY,
  monthWindow,
  average,
  usageUsdNumerator,
  USD_DENOMINATOR,
  usdDisplay,
} from "./policy";
type Group = {
  userId: string | null;
  brandId: string | null;
  state: string;
  mode: string;
  costBasis: any;
  calls: string;
  knownCalls: string;
  inputTokens: string;
  outputTokens: string;
  cachedTokens: string;
  cacheReported: boolean;
};
function counter() {
  return {
    calls: 0,
    knownCalls: 0,
    pendingCalls: 0,
    releasedCalls: 0,
    unpricedCalls: 0,
    pricedCalls: 0,
    input: BigInt(0),
    output: BigInt(0),
    cached: BigInt(0),
    usd: BigInt(0),
    users: new Set<string>(),
  };
}
function add(t: ReturnType<typeof counter>, g: Group) {
  const calls = Number(g.calls),
    known = Number(g.knownCalls);
  if (g.state === "released") {
    t.releasedCalls += calls;
    return;
  }
  t.calls += calls;
  t.knownCalls += known;
  if (g.state !== "settled" || known !== calls) t.pendingCalls += calls - known;
  t.input += BigInt(g.inputTokens);
  t.output += BigInt(g.outputTokens);
  t.cached += BigInt(g.cachedTokens);
  if (known && g.userId) t.users.add(g.userId);
  const cost = usageUsdNumerator(g);
  if (cost === null) t.unpricedCalls += calls;
  else {
    t.usd += cost;
    t.pricedCalls += calls;
  }
}
function present(t: ReturnType<typeof counter>, days: number) {
  const total = t.input + t.output;
  return {
    calls: t.calls,
    knownUsageCalls: t.knownCalls,
    pendingOrMissingUsageCalls: t.pendingCalls,
    releasedCalls: t.releasedCalls,
    unpricedCalls: t.unpricedCalls,
    inputTokens: String(t.input),
    outputTokens: String(t.output),
    cachedInputTokens: String(t.cached),
    totalTokens: String(total),
    dailyAverageTokens: average(total, days),
    perCallAverageTokens: average(total, t.knownCalls),
    activeUsers: t.users.size,
    perActiveUserAverageTokens: average(total, t.users.size),
    pricedCalls: t.pricedCalls,
    knownCostUsd: t.pricedCalls || !t.calls ? usdDisplay(t.usd) : null,
    costKind: "usage_rate_estimate",
    costComplete: t.unpricedCalls === 0,
    usageComplete: t.pendingCalls === 0,
    budgetExceeded:
      t.usd >= BigInt(TOKEN_BUDGET_POLICY.amount) * USD_DENOMINATOR,
    budgetStatus:
      t.usd >= BigInt(TOKEN_BUDGET_POLICY.amount) * USD_DENOMINATOR
        ? "exceeded"
        : t.unpricedCalls
          ? "cost_unknown"
          : "within_budget",
  };
}
export function aggregateUsage(
  month: string,
  groups: Group[],
  brands: Array<{ id: string; name: string }>,
  users: Array<{ id: string }>,
) {
  const window = monthWindow(month),
    byBrand = new Map(brands.map((b) => [b.id, { ...b, counter: counter() }])),
    byUser = new Map(
      users.map((u) => [u.id, { id: u.id, counter: counter() }]),
    ),
    total = counter(),
    unattributed = counter();
  for (const g of groups) {
    add(total, g);
    const b = g.brandId && byBrand.get(g.brandId),
      u = g.userId && byUser.get(g.userId);
    if (b) add(b.counter, g);
    if (u) add(u.counter, g);
    if (!b || !u) add(unattributed, g);
  }
  const rows = [...byBrand.values()].map((b) => ({
      brandId: b.id,
      brandName: b.name,
      ...present(b.counter, window.days),
    })),
    totalPresent = present(total, window.days);
  return {
    month,
    timezone: TOKEN_BUDGET_POLICY.timezone,
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    calendarDays: window.days,
    policy: TOKEN_BUDGET_POLICY,
    coverage:
      "Native User AI confirmed Core ledger only; legacy/Content/Growth calls without this ledger are not included. Missing usage or USD prices are unknown, never zero.",
    definitions: {
      total:
        "input + output; cached input is a subset of input; reasoning is already in output",
      dailyAverage: "known total / calendar days",
      perCallAverage:
        "known total / calls with confirmed complete input and output",
      perActiveUserAverage: "known total / users with confirmed usage",
      brandAverage:
        "known total in existing brands / all existing brands, including zero-use brands",
    },
    totals: {
      ...totalPresent,
      brandCount: brands.length,
      averageTokensPerBrand: average(
        rows.reduce((n, r) => n + BigInt(r.totalTokens), BigInt(0)),
        brands.length,
      ),
    },
    brands: rows,
    users: [...byUser.values()].map((u) => ({
      userId: u.id,
      ...present(u.counter, window.days),
    })),
    unattributed: present(unattributed, window.days),
  };
}
/** Core is authoritative. Never sum task display receipts, grants, or executions a second time. */
export async function monthlyTokenUsage(month: string, db: any = prisma) {
  const w = monthWindow(month);
  const available = await db.$queryRawUnsafe(
    `SELECT to_regclass('amc_iaic.iaic_token_calls')::text AS calls,to_regclass('amc_iaic.iaic_token_entries')::text AS entries,to_regclass('amc_iaic.amc_ai_requests')::text AS requests`,
  );
  if (!available[0]?.calls || !available[0]?.entries || !available[0]?.requests)
    throw Object.assign(Error("token_ledger_unavailable"), { status: 503 });
  const groups: Group[] = await db.$queryRawUnsafe(
    `WITH attribution AS (
 SELECT DISTINCT ON (task_id) task_id::text AS task_id,subject_id,scope_id,intent->>'brandId' AS brand_id FROM amc_iaic.amc_ai_requests WHERE task_id IS NOT NULL ORDER BY task_id,created_at
 ), sources AS (
 SELECT a.subject_id AS "userId",a.brand_id AS "brandId",c.state,c.mode,c.cost_basis AS "costBasis",
 CASE WHEN c.state='settled' AND e.evidence->'usage'->>'input_tokens' ~ '^[0-9]{1,24}$' AND e.evidence->'usage'->>'output_tokens' ~ '^[0-9]{1,24}$' THEN e.evidence->'usage' ELSE NULL END AS usage
 FROM amc_iaic.iaic_token_calls c LEFT JOIN amc_iaic.iaic_token_entries e ON e.application_id=c.application_id AND e.subject_id=c.subject_id AND e.reference=c.request_id AND e.kind='settlement'
 LEFT JOIN attribution a ON a.task_id=c.attribution->>'taskId' AND a.scope_id=c.application_id AND c.subject_id='['||to_json(a.subject_id)::text||',"amc-mm-user-ai"]' WHERE c.created_at >=$1 AND c.created_at <$2
 ) SELECT "userId","brandId",state,mode,"costBasis",(usage->'input_tokens_details'->>'cached_tokens' ~ '^[0-9]{1,24}$') IS TRUE AS "cacheReported",count(*)::text AS calls,count(usage)::text AS "knownCalls",
 COALESCE(sum((usage->>'input_tokens')::numeric),0)::text AS "inputTokens",COALESCE(sum((usage->>'output_tokens')::numeric),0)::text AS "outputTokens",COALESCE(sum(CASE WHEN usage->'input_tokens_details'->>'cached_tokens' ~ '^[0-9]{1,24}$' THEN (usage->'input_tokens_details'->>'cached_tokens')::numeric END),0)::text AS "cachedTokens"
 FROM sources GROUP BY "userId","brandId",state,mode,"costBasis","cacheReported" LIMIT 20001`,
    w.startsAt,
    w.endsAt,
  );
  if (groups.length > 20000)
    throw Object.assign(Error("token_report_source_limit"), { status: 503 });
  const [brands, users] = await Promise.all([
    db.brand.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    db.user.findMany({
      where: { type: "HUMAN" },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return {
    ...aggregateUsage(month, groups, brands, users),
    asOf: new Date().toISOString(),
  };
}
