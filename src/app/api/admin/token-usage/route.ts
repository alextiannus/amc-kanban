import { authenticateRequest } from "@/lib/auth-v2";
import { monthlyTokenUsage } from "@/lib/token-budget/report";
import { singaporeMonth } from "@/lib/token-budget/policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const principal = await authenticateRequest(request);
  if (!principal)
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  if (!principal.globalRoles.includes("ADMIN"))
    return Response.json(
      { error: "Forbidden" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  try {
    return Response.json(
      await monthlyTokenUsage(
        new URL(request.url).searchParams.get("month") || singaporeMonth(),
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const status = (e as any)?.status === 400 ? 400 : 503;
    return Response.json(
      { error: status === 400 ? "invalid_month" : "token_usage_unavailable" },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}
