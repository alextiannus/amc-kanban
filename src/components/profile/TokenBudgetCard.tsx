"use client";
import { useEffect, useState } from "react";
export default function TokenBudgetCard({
  english = false,
}: {
  english?: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(false);
  const t = (zh: string, en: string) => (english ? en : zh);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile/token-budget", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <section
      aria-label={t("Token 费用预算", "Token spending budget")}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
    >
      <h2 className="text-lg font-semibold">
        {t("每月 Token 费用提醒", "Monthly Token spending reminder")}
      </h2>
      {error ? (
        <p role="status">
          {t(
            "暂时无法读取用量，请稍后重试。",
            "Usage is unavailable. Please try again later.",
          )}
        </p>
      ) : !data ? (
        <p role="status">{t("正在读取用量…", "Loading usage…")}</p>
      ) : (
        <>
          <p className="text-2xl font-semibold">
            USD {data.policy.amount}{" "}
            <span className="text-sm font-normal">
              {t("／人／月", "per person / month")}
            </span>
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              "按新加坡自然月计算，跨品牌合计。仅提醒，不会因达到此预算暂停调用。",
              "Singapore calendar months, across your brands. Reaching this budget only sends a reminder; calls continue.",
            )}
          </p>
          <p>
            {data.month} · {t("已记录 Token：", "Recorded tokens: ")}
            {data.usage?.totalTokens ?? t("待核对", "Unconfirmed")}
          </p>
          {data.usage?.costComplete ? (
            <p>
              {t("已估算费用：", "Estimated cost: ")}USD{" "}
              {data.usage.knownCostUsd}
            </p>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {data.usage?.knownCostUsd
                ? `${t("已核算部分：", "Priced portion: ")}USD ${data.usage.knownCostUsd}；`
                : ""}
              {t(
                "费用尚未完整核算，不能据此判断是否低于预算。",
                "Cost is incomplete; this does not prove spending is below budget.",
              )}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {t(
              "当前统计 AMC 助手已记录的模型调用，其他制作费用不计入此预算。",
              "Covers recorded AMC assistant model calls. Other production charges are outside this budget.",
            )}
          </p>
        </>
      )}
    </section>
  );
}
