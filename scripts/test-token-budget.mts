import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TokenLedger } from "@immedi/iaic-core";
import { prisma } from "../src/lib/prisma.ts";
import { initializeHost } from "../src/lib/ai-native/store.ts";
import {
  aggregateUsage,
  monthlyTokenUsage,
} from "../src/lib/token-budget/report.ts";
import {
  monthWindow,
  nativeCostBasis,
  usageUsdNumerator,
  USD_DENOMINATOR,
  TOKEN_BUDGET_POLICY,
  singaporeMonth,
} from "../src/lib/token-budget/policy.ts";
import { notifyMonthlyTokenBudgets } from "../src/lib/token-budget/notices.ts";
import { createSessionToken } from "../src/lib/auth-v2/session.ts";
import { GET as adminReport } from "../src/app/api/admin/token-usage/route.ts";
import { GET as ownBudget } from "../src/app/api/profile/token-budget/route.ts";
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname, "127.0.0.1");
assert(url.pathname.startsWith("/amc_lineage_test_"));
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c search_path=amc_iaic",
  }),
  suffix = randomUUID(),
  user = "budget-user-" + suffix,
  admin = "budget-admin-" + suffix,
  brand = "budget-brand-" + suffix,
  zeroBrand = "zero-brand-" + suffix;
const physical = {
  format: "iaic.provider-cost.v1",
  revision: "fixture-real-rate-v1",
  currency: "USD",
  minorUnitScale: 2,
  bearer: "platform",
  accountReference: "fixture-provider",
  model: "fixture-physical",
  inputPerMillionMinor: "10000000",
  cachedInputPerMillionMinor: "5000000",
  outputPerMillionMinor: "20000000",
  missingCachedInput: "incomplete",
};
const basis = nativeCostBasis(
  {
    id: "fixture-model",
    definition: {
      modelName: "fixture-physical",
      costMetadata: { providerCostBasis: physical },
    },
  },
  1,
);
assert.equal(basis.model, "amc-policy-1");
assert.equal(nativeCostBasis({ definition: { costMetadata: null } }, 1), null);
assert.equal(singaporeMonth(new Date("2026-10-31T16:00:00Z")), "2026-11");
assert.equal(
  monthWindow("2026-11").startsAt.toISOString(),
  "2026-10-31T16:00:00.000Z",
);
assert.equal(monthWindow("2026-02").days, 28);
assert.equal(monthWindow("2028-02").days, 29);
assert.throws(() => monthWindow("2026-13"), /invalid_month/);
const group = {
  userId: user,
  brandId: brand,
  state: "settled",
  mode: "SYSTEM_MANAGED",
  costBasis: basis,
  calls: "1",
  knownCalls: "1",
  inputTokens: "1000",
  outputTokens: "0",
  cachedTokens: "500",
  cacheReported: true,
};
assert.equal(
  usageUsdNumerator(group),
  75n * USD_DENOMINATOR,
  "cached input is already included in input; no double charge",
);
assert.equal(usageUsdNumerator({ ...group, costBasis: null }), null);
assert.equal(
  usageUsdNumerator({ ...group, costBasis: { ...basis, currency: "CNY" } }),
  null,
  "no implicit FX conversion",
);
assert.equal(
  usageUsdNumerator({ ...group, cacheReported: false }),
  null,
  "unknown cache split is not zero cost",
);
const malformed = aggregateUsage(
  "2026-11",
  [{ ...group, costBasis: null }],
  [{ id: brand, name: "brand" }],
  [{ id: user }],
);
assert.equal(malformed.users[0].knownCostUsd, null);
assert.equal(malformed.users[0].budgetStatus, "cost_unknown");
try {
  await prisma.user.createMany({
    data: [
      {
        id: user,
        email: user + "@example.invalid",
        type: "HUMAN",
        role: "USER",
        password: "fixture",
      },
      {
        id: admin,
        email: admin + "@example.invalid",
        type: "HUMAN",
        role: "ADMIN",
        password: "fixture",
      },
    ],
  });
  await prisma.brand.createMany({
    data: [
      { id: brand, name: "Fixture usage" },
      { id: zeroBrand, name: "Zero fixture" },
    ],
  });
  await initializeHost(pool);
  const ledger = new TokenLedger({ pool });
  await ledger.initialize();
  const scope = {
    applicationId: "budget-fixture",
    subjectId: JSON.stringify([user, "amc-mm-user-ai"]),
  };
  await ledger.grant(scope, {
    reference: "fixture-grant",
    amount: "1000000",
    evidence: { fixture: true },
  });
  async function call(
    state: "settled" | "unknown" | "released",
    at: string,
    price: any = basis,
  ) {
    const task = randomUUID(),
      request = randomUUID();
    await pool.query(
      "INSERT INTO amc_ai_requests(id,scope_id,subject_id,request_key,digest,intent,allowance,task_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,0,$7)",
      [
        task,
        scope.applicationId,
        user,
        task,
        "fixture",
        JSON.stringify({ brandId: brand }),
        task,
      ],
    );
    await ledger.reserve(scope, {
      requestId: request,
      mode: "SYSTEM_MANAGED",
      maximum: "10000",
      price: {
        revision: "platform-units-not-USD",
        input: 1,
        cachedInput: 1,
        output: 1,
      },
      costBasis: price,
      attribution: { taskId: task },
    });
    if (state === "settled")
      await ledger.settle(scope, {
        requestId: request,
        usage: {
          input_tokens: 1000,
          output_tokens: 0,
          input_tokens_details: { cached_tokens: 0 },
        },
        providerReference: "fixture-provider-" + request,
      });
    if (state === "unknown")
      await ledger.markUnknown(scope, {
        requestId: request,
        evidence: { fixture: true },
      });
    if (state === "released")
      await ledger.release(scope, {
        requestId: request,
        evidence: {
          providerAccepted: false,
          reference: "fixture-not-dispatched",
        },
      });
    await pool.query(
      "UPDATE iaic_token_calls SET created_at=$1 WHERE request_id=$2",
      [at, request],
    );
    return task
  }
  await call("settled", "2026-10-31T16:00:00Z");
  await call("unknown", "2026-11-01T01:00:00Z");
  await call("released", "2026-11-01T02:00:00Z");
  await call("settled", "2026-10-31T15:59:59.999Z");
  const orphan=await call("settled","2026-11-02T00:00:00Z");await pool.query("DELETE FROM amc_ai_requests WHERE id=$1",[orphan]);
  const report = await monthlyTokenUsage("2026-11"),
    b = report.brands.find((b) => b.brandId === brand)!,
    u = report.users.find((u) => u.userId === user)!;
  assert.equal(b.totalTokens, "1000");
  assert.equal(b.dailyAverageTokens, "33.33");
  assert.equal(b.perCallAverageTokens, "1000.00");
  assert.equal(b.activeUsers, 1);
  assert.equal(b.pendingOrMissingUsageCalls, 1);
  assert.equal(b.releasedCalls, 1);
  assert.equal(u.knownCostUsd, "200.000000");assert.equal(u.totalTokens,"2000");assert.equal(report.unattributed.totalTokens,"1000");
  assert.equal(u.costComplete, false);
  assert.equal(u.budgetExceeded, true);
  assert.equal(
    report.brands.find((b) => b.brandId === zeroBrand)?.totalTokens,
    "0",
  );
  assert.equal(report.totals.averageTokensPerBrand, "500.00");
  assert.deepEqual(report.policy, TOKEN_BUDGET_POLICY);
  assert.equal(report.policy.enforced, false);
  const notices = await Promise.all([
    notifyMonthlyTokenBudgets(prisma, new Date("2026-11-09T00:00:00Z")),
    notifyMonthlyTokenBudgets(prisma, new Date("2026-11-09T00:00:00Z")),
  ]);
  assert.equal(
    notices.reduce((n, r) => n + r.notified, 0),
    1,
  );
  assert.equal(await prisma.notification.count({ where: { userId: user } }), 1);
  assert.equal(
    (await prisma.user.findUnique({ where: { id: user } }))?.status,
    "ACTIVE",
  );
  const session = async (id: string) =>
    "session=" +
    (await createSessionToken({ userId: id, type: "HUMAN", authVersion: 1 }));
  assert.equal(
    (
      await adminReport(
        new Request(
          "https://fixture.invalid/api/admin/token-usage?month=2026-11",
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await adminReport(
        new Request(
          "https://fixture.invalid/api/admin/token-usage?month=2026-11",
          { headers: { cookie: await session(user) } },
        ),
      )
    ).status,
    403,
  );
  const adminResponse = await adminReport(
    new Request("https://fixture.invalid/api/admin/token-usage?month=2026-11", {
      headers: { cookie: await session(admin) },
    }),
  );
  assert.equal(adminResponse.status, 200);
  const own = await ownBudget(
    new Request("https://fixture.invalid/api/profile/token-budget", {
      headers: { cookie: await session(user) },
    }),
  );
  assert.equal(own.status, 200);
  const ownData = await own.json();
  assert.equal(ownData.policy.amount, 100);
  assert.equal(ownData.usage.userId, user);
  assert(!JSON.stringify(ownData).includes(admin));
  console.log(
    "PASS actual Core ledger → Singapore monthly brand/user totals, time boundary, cache/subtotals, unknown USD, zero-use brands, concurrent idempotent notify-only notices, no account suspension, admin/own endpoint isolation",
  );
} finally {
  await prisma.notification.deleteMany({ where: { userId: user } });
  await prisma.brand.deleteMany({ where: { id: { in: [brand, zeroBrand] } } });
  await prisma.user.deleteMany({ where: { id: { in: [user, admin] } } });
  await pool.end();
  await prisma.$disconnect();
}
