import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, FileText, Sparkles } from 'lucide-react'

const SERVICE_EMAIL = 'service@deliverychinatown.com'

export default function TermsOfService() {
  return (
    <main className="min-h-screen w-full bg-slate-50 px-4 py-6 text-slate-800 md:px-8 md:py-10">
      <article className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50">
              <FileText className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950 md:text-3xl">Service Terms / 服务条款</h1>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Last updated: 14 July 2026 | 最后更新：2026 年 7 月 14 日
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back / 返回
          </Link>
        </header>

        <div className="space-y-8 text-sm leading-7 text-slate-600">
          <section className="space-y-4">
            <p>
              These Service Terms apply to AI Marketing Crew digital marketing services, AMC portals and related
              subscription workflows, including amc.immedi.ai, amc-mm.immedi.ai and amc-kanban.immedi.ai. By
              registering, requesting work, subscribing to a package or using the portal, you agree to these terms.
            </p>

            <TermsSection title="1. Parties and Service Description">
              AI Marketing Crew (&quot;AMC&quot;) is provided by DeliveryChinatown Pte. Ltd. directly to the SME customer.
              AMC supports brand workspace setup, digital marketing needs analysis, strategy development, campaign
              workflow, AI-assisted content generation, content review, publishing coordination, usage reporting,
              campaign review and handover documentation.
            </TermsSection>

            <TermsSection title="2. Package Scope">
              The exact package, subscription term, deliverables, platform coverage, usage limits, fees, add-ons and
              payment milestones are stated in the accepted quotation, order form, Annex 3, invoice or statement of
              work. Any add-on service is included only if it is expressly stated in writing.
            </TermsSection>

            <TermsSection title="3. PSG Programme Context">
              Where the customer intends to apply for PSG support, the customer remains responsible for its own
              application, eligibility, declarations and grant compliance. AMC may provide supporting documents such as
              quotation, invoice, usage report, product information and screenshot evidence. PSG approval and claim
              outcome are not guaranteed by AMC.
            </TermsSection>

            <TermsSection title="4. Customer and User Obligations">
              <ul className="list-disc space-y-1 pl-5">
                <li>Provide accurate company, brand, outlet, product, pricing, promotion, menu and contact information.</li>
                <li>Provide timely access, permissions, materials, approvals and authorised decision makers.</li>
                <li>Confirm that supplied photos, videos, logos, trademarks, reviews and other materials are owned or properly licensed.</li>
                <li>Check factual accuracy, offer validity, pricing, restricted claims and suitability before approving content.</li>
                <li>Maintain the security of customer accounts, passwords, devices and authorised users.</li>
              </ul>
            </TermsSection>

            <TermsSection title="5. Content Approval and Publishing">
              Unless an autopilot or pre-approved publishing mode is expressly agreed in writing, all AI-generated or
              operator-prepared content remains draft content until approved by the customer or its authorised
              representative. AMC uses reasonable care but does not guarantee every platform, legal, regulatory, brand
              or commercial issue will be detected before publishing.
            </TermsSection>

            <TermsSection title="6. Third-Party Platforms">
              AMC may support Google Business Profile, Instagram, Facebook, TikTok, WhatsApp, websites, booking links,
              analytics tools and other third-party platforms. These terms are between AMC and the customer only. AMC is
              not responsible for third-party outages, policy enforcement, API changes, account suspensions, data delays
              or platform decisions.
            </TermsSection>

            <TermsSection title="7. Fees and Excluded Costs">
              Fees, payment milestones and billing frequency are stated in the accepted quotation, order form or invoice.
              Advertising media spend, ad buys, boosted posts, purchase of likes or followers, influencer/KOL fees,
              outbound marketing, third-party hosting, maintenance, SSL, domain fees, hardware, livestreaming equipment,
              third-party training courses, platform subscriptions and payment processing fees are excluded unless
              separately stated.
            </TermsSection>

            <TermsSection title="8. Reports and Handover">
              AMC may provide usage reports, campaign reports, digital asset logs, published content references,
              analytics summaries, recommendations and handover checklists. Upon completion or termination, subject to
              payment of outstanding fees, AMC will provide reasonable handover of customer-owned assets and relevant
              records where applicable.
            </TermsSection>

            <TermsSection title="9. Intellectual Property, Confidentiality and Data">
              Customer-supplied materials remain owned by the customer or its licensors. Final approved campaign
              materials created for the customer under the paid package may be used by the customer for its own business.
              AMC retains its platform, software, templates, workflows, prompts, methodologies and know-how. Both parties
              must protect confidential information and comply with applicable personal data protection obligations.
            </TermsSection>

            <TermsSection title="10. Support, Revisions and Delays">
              Standard support covers normal product usage, workflow assistance, package clarification and reasonable
              troubleshooting. If no revision limit is stated in the quotation, up to 2 revision rounds per campaign
              asset are included. Delays caused by missing customer access, materials, approvals, information or payment
              may affect delivery timelines.
            </TermsSection>

            <TermsSection title="11. Refunds, Cancellation and No Guaranteed Outcomes">
              Refunds and cancellations follow the accepted quotation, order form and applicable law. Fees for work
              already performed, activated subscription periods, completed reports, completed onboarding and delivered
              assets are non-refundable unless otherwise stated. AMC does not guarantee sales, revenue, profit, ROAS,
              conversion, reach, followers, engagement, search ranking, Google Maps ranking, review score improvement,
              PSG approval or third-party platform performance.
            </TermsSection>

            <TermsSection title="12. Governing Law">
              These terms are governed by Singapore law. Please first raise disputes or service concerns with us at{' '}
              <a className="font-semibold text-amber-700 hover:text-amber-800" href={`mailto:${SERVICE_EMAIL}`}>
                {SERVICE_EMAIL}
              </a>
              .
            </TermsSection>
          </section>

          <hr className="border-slate-200" />

          <section className="space-y-4">
            <p>
              本服务条款适用于 AI Marketing Crew 数字营销服务、AMC 门户及相关订阅流程，包括 amc.immedi.ai、amc-mm.immedi.ai
              和 amc-kanban.immedi.ai。注册、提出服务请求、订阅套餐或使用门户，即表示您同意本条款。
            </p>

            <TermsSection title="一、合同主体与服务说明">
              AI Marketing Crew（&quot;AMC&quot;）由 DeliveryChinatown Pte. Ltd. 直接向 SME 客户提供。AMC 支持品牌工作区设置、数字营销需求分析、策略制定、营销活动流程、AI 辅助内容生成、内容审核、发布协调、使用报告、活动复盘和交接文档。
            </TermsSection>

            <TermsSection title="二、套餐范围">
              具体套餐、订阅期限、交付内容、覆盖平台、使用限制、费用、附加服务和付款节点，以已接受的报价、订单、Annex 3、发票或工作说明为准。附加服务仅在书面列明时才包含。
            </TermsSection>

            <TermsSection title="三、PSG 项目背景">
              如客户计划申请 PSG 补贴，客户仍需自行负责申请、资格、声明和补贴合规。AMC 可协助提供报价单、发票、使用报告、产品资料和截图证据等支持文件。AMC 不保证 PSG 获批或报销结果。
            </TermsSection>

            <TermsSection title="四、客户与用户义务">
              <ul className="list-disc space-y-1 pl-5">
                <li>提供准确的公司、品牌、门店、产品、价格、促销、菜单和联系方式。</li>
                <li>及时提供账号权限、素材、审批和授权决策人。</li>
                <li>确认提供的照片、视频、logo、商标、评价及其他素材均为自有或已合法授权。</li>
                <li>在批准内容前核对事实准确性、优惠有效性、价格、限制性声明和适用性。</li>
                <li>维护客户账号、密码、设备和授权用户的安全。</li>
              </ul>
            </TermsSection>

            <TermsSection title="五、内容审批与发布">
              除非双方书面同意自动发布或预批准发布模式，所有 AI 生成或运营人员准备的内容，在客户或授权代表批准前均为草稿。AMC 会以合理谨慎提供服务，但不保证发布前能发现所有平台、法律、监管、品牌或商业问题。
            </TermsSection>

            <TermsSection title="六、第三方平台">
              AMC 可支持 Google Business Profile、Instagram、Facebook、TikTok、WhatsApp、网站、预订链接、数据分析工具等第三方平台。这些条款仅适用于 AMC 与客户之间。AMC 不对第三方平台故障、政策执行、API 变化、账号限制、数据延迟或平台决定负责。
            </TermsSection>

            <TermsSection title="七、费用与排除项目">
              费用、付款节点和账单频率以已接受的报价、订单或发票为准。广告费、投流、boosted posts、购买点赞或粉丝、达人/KOL 费用、外呼营销、第三方托管、维护、SSL、域名、硬件、直播设备、第三方培训课程、平台订阅和支付处理费均不包含，除非另有单独列明。
            </TermsSection>

            <TermsSection title="八、报告与交接">
              AMC 可提供使用报告、活动报告、数字资产记录、已发布内容链接、数据摘要、优化建议和交接清单。项目完成或终止时，在结清应付费用后，AMC 将合理交接客户自有资产和相关记录。
            </TermsSection>

            <TermsSection title="九、知识产权、保密与数据">
              客户提供的素材仍归客户或其授权方所有。付费套餐下为客户定制并最终确认的内容，客户可用于自身业务。AMC 保留平台、软件、模板、工作流、提示词、方法论和经验资产。双方应保护保密信息，并遵守适用的个人数据保护义务。
            </TermsSection>

            <TermsSection title="十、支持、修改与延误">
              标准支持包括正常产品使用、流程协助、套餐解释和合理故障排查。如报价未注明修改次数，每个营销资产包含最多 2 轮修改。客户未及时提供权限、素材、审批、信息或付款，可能影响交付时间。
            </TermsSection>

            <TermsSection title="十一、退款、取消与结果免责声明">
              退款和取消以已接受的报价、订单和适用法律为准。已完成工作、已激活订阅期、已完成报告、已完成 onboarding 和已交付资产的费用原则上不退款，除非另有约定。AMC 不保证销售额、收入、利润、ROAS、转化、触达、粉丝、互动、搜索排名、Google Maps 排名、评分提升、PSG 获批或第三方平台表现。
            </TermsSection>

            <TermsSection title="十二、适用法律">
              本条款受新加坡法律管辖。争议或服务问题请先通过{' '}
              <a className="font-semibold text-amber-700 hover:text-amber-800" href={`mailto:${SERVICE_EMAIL}`}>
                {SERVICE_EMAIL}
              </a>{' '}
              联系我们。
            </TermsSection>
          </section>
        </div>

        <footer className="mt-10 flex items-center justify-between border-t border-slate-200 pt-5 text-xs text-slate-500">
          <span>© 2026 Immedi.ai</span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            AI Marketing Crew
          </span>
        </footer>
      </article>
    </main>
  )
}

function TermsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="border-l-4 border-amber-500 pl-3 text-base font-bold text-slate-950">{title}</h2>
      <div>{children}</div>
    </section>
  )
}
