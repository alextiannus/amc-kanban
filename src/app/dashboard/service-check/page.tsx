import Link from 'next/link'
import { CheckCircle2, ClipboardCheck, FileText, WalletCards } from 'lucide-react'
import {
  getAllowedDurationsForPlan,
  SUBSCRIPTION_ADDONS,
  SUBSCRIPTION_PLANS,
} from '@/lib/subscription/catalog'

const CHECK_SECTIONS = [
  {
    title: '签约与付款检查',
    icon: WalletCards,
    items: [
      '确认客户公司名称、UEN、联系人、邮箱和合同编号完整。',
      '确认套餐、周期、开始日期、到期日和总费用已写入订单或协议。',
      '合同采用一次性预付：3 个月 x 3，6 个月 x 6，12 个月 x 11。',
      '确认付款凭证已收到，并在 1 个工作日内完成内部确认。',
    ],
  },
  {
    title: '服务启动检查',
    icon: ClipboardCheck,
    items: [
      '签署后 7 个工作日内收齐品牌资料、账号授权和必要素材。',
      '账号接入后 14 个工作日内完成首批内容上线。',
      '确认审批人有权代表客户批准内容和服务决策。',
      '现场拍摄或探店服务需提前不少于 5 个工作日预约。',
    ],
  },
  {
    title: '内容与报告检查',
    icon: FileText,
    items: [
      'Essential 每月至少 12 次 Instagram / TikTok 图文内容，并提供月度舆情报告。',
      'Booster 至少 24 次图文和 12 次精品视频，并提供每周舆情报告。',
      'Google Map 配置、评论监控和打分优化按套餐范围执行。',
      '所有内容需完成事实、价格、活动规则和品牌适配检查后再发布。',
    ],
  },
]

export default function ServiceCheckPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">AMC Service Check</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">服务检查</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">
              用于内部在签约、付款、服务启动和内容交付前核对范围。页面内容与当前订阅套餐目录和商家合作协议同步。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/addon-services"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950"
            >
              查看增值服务
            </Link>
            <Link
              href="/terms"
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              查看协议
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <article key={plan.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black">{plan.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{plan.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black">S${plan.monthlyUsd.toLocaleString()}</p>
                  <p className="text-xs font-bold text-slate-500">/ 月</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {getAllowedDurationsForPlan(plan.id).map((months) => (
                  <span key={months} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {months} 个月
                  </span>
                ))}
                {getAllowedDurationsForPlan(plan.id).includes(12) && (
                  <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    12 个月按 11 个月收费
                  </span>
                )}
              </div>
              <ul className="mt-4 space-y-2">
                {plan.services.map((service) => (
                  <li key={service} className="flex gap-2 text-sm font-medium leading-6 text-slate-650 dark:text-slate-300">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{service}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {CHECK_SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <article key={section.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Icon className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                  </span>
                  <h2 className="text-sm font-black">{section.title}</h2>
                </div>
                <ul className="mt-4 space-y-3">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-black">加购服务检查</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SUBSCRIPTION_ADDONS.map((addon) => (
              <div key={addon.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-sm font-black">{addon.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{addon.pricing === 'monthly' ? '月费' : '单次'} · S${addon.usd.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
