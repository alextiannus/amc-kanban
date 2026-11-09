import { authenticateRequest } from "@/lib/auth-v2";
import { monthlyTokenUsage } from "@/lib/token-budget/report";
import { singaporeMonth, TOKEN_BUDGET_POLICY } from "@/lib/token-budget/policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const principal = await authenticateRequest(request);
  if (!principal)
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  try {
    const report = await monthlyTokenUsage(singaporeMonth());
    return Response.json(
      {
        policy: TOKEN_BUDGET_POLICY,
        month: report.month,
        asOf: report.asOf,
        usage: report.users.find((u) => u.userId === principal.userId) || null,
        coverage: report.coverage,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { policy: TOKEN_BUDGET_POLICY, error: "token_usage_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
