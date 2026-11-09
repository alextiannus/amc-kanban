import { prisma } from "../prisma";
import { monthlyTokenUsage } from "./report";
import { TOKEN_BUDGET_POLICY, singaporeMonth } from "./policy";
/** One self-addressed notice per user/month. No execution gate, emails or chat sends. */
export async function notifyMonthlyTokenBudgets(
  db: any = prisma,
  now = new Date(),
) {
  const report = await monthlyTokenUsage(singaporeMonth(now), db);
  let notified = 0;
  for (const user of report.users) {
    if (!user.budgetExceeded) continue;
    const account = await db.user.findUnique({
      where: { id: user.userId },
      select: { status: true, type: true },
    });
    if (account?.status !== "ACTIVE" || account.type !== "HUMAN") continue;
    const result = await db.notification.createMany({
      data: [
        {
          id: `token-budget-${report.month}-${user.userId}`,
          userId: user.userId,
          type: "WARNING",
          title: "本月 Token 费用已达到提醒预算",
          message: `${report.month} 已可核算的 Token 费用估计为 USD ${user.knownCostUsd}，达到每人每月 USD ${TOKEN_BUDGET_POLICY.amount} 提醒预算。${user.costComplete ? "" : "仍有调用尚未完成计价。"}这只是提醒，不会暂停调用。`,
          actionUrl: "https://amc-kanban.immedi.ai/profile/ai",
        },
      ],
      skipDuplicates: true,
    });
    notified += result.count;
  }
  return {
    month: report.month,
    notified,
    unpricedCalls: report.totals.unpricedCalls,
    usageComplete: report.totals.usageComplete,
  };
}
const globalWorker = globalThis as typeof globalThis & {
  amcTokenBudgetWorker?: boolean;
};
export function startTokenBudgetWorker() {
  if (globalWorker.amcTokenBudgetWorker) return;
  globalWorker.amcTokenBudgetWorker = true;
  let busy = false,
    stopped = false;
  const run = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await notifyMonthlyTokenBudgets();
    } catch {
      console.warn("[token-budget] usage check deferred; calls remain enabled");
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void run(), 5 * 60000);
  timer.unref();
  void run();
  process.once("SIGTERM", () => {
    stopped = true;
    clearInterval(timer);
  });
}
