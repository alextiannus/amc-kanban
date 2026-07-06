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
                Last updated: 6 July 2026 | 最后更新：2026 年 7 月 6 日
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
              These Service Terms apply to the use of AI Marketing Crew services and the AMC client portal at
              amc-mm.immedi.ai. By registering, requesting work or using the portal, you agree to these terms.
            </p>

            <TermsSection title="1. Services">
              AI Marketing Crew provides social media marketing management for local businesses, including content
              planning, copywriting, posting support, channel updates, review-response drafting, reporting and related
              coordination.
            </TermsSection>

            <TermsSection title="2. Client Responsibilities">
              <ul className="list-disc space-y-1 pl-5">
                <li>Provide accurate brand, product, outlet, menu, promotion, pricing and contact information.</li>
                <li>Confirm that you have the right to provide photos, videos, logos, trademarks, customer reviews and other materials.</li>
                <li>You remain responsible for final business decisions, approvals, promotions, offers and public statements.</li>
              </ul>
            </TermsSection>

            <TermsSection title="3. Platform Access">
              The portal may be used to submit brand information, upload materials, review content, send requests and
              follow service progress. You are responsible for keeping your account and login details secure.
            </TermsSection>

            <TermsSection title="4. Third-Party Platforms">
              Google Maps, Instagram, Facebook, TikTok and other channels are third-party platforms. Publishing,
              reach, access, review visibility and analytics may depend on their rules, APIs, moderation decisions and
              account permissions.
            </TermsSection>

            <TermsSection title="5. Fees and Scope">
              Fees, deliverables, monthly posting volume, covered channels and add-ons are confirmed in the relevant
              proposal, order, invoice or written agreement. Ad spend, influencer fees, platform charges, photo/video
              shoots and external production costs are excluded unless expressly agreed.
            </TermsSection>

            <TermsSection title="6. Intellectual Property">
              You retain ownership of materials you provide. Subject to payment of applicable fees, you may use final
              approved content prepared for your brand. We retain ownership of our templates, methods, workflows and
              non-confidential know-how.
            </TermsSection>

            <TermsSection title="7. Acceptable Use">
              You must not request unlawful, misleading, infringing, discriminatory, harmful or platform-prohibited
              content. We may decline, pause or remove work that creates legal, safety, platform or reputational risk.
            </TermsSection>

            <TermsSection title="8. Disclaimers">
              We do not guarantee follower growth, engagement, sales, search ranking, platform approval, account
              recovery or uninterrupted third-party platform access.
            </TermsSection>

            <TermsSection title="9. Suspension and Termination">
              Either party may end services according to the applicable package or written arrangement. We may suspend
              services for non-payment, misuse, security concerns or breach of these terms.
            </TermsSection>

            <TermsSection title="10. Governing Law">
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
              本服务条款适用于 AI Marketing Crew 服务以及 amc-mm.immedi.ai 的 AMC 客户门户。注册、提出服务请求或使用门户，即表示您同意本条款。
            </p>

            <TermsSection title="一、服务内容">
              AI Marketing Crew 为本地商家提供社交媒体营销管理服务，包括内容规划、文案撰写、发布支持、渠道更新、评价回复草稿、报告以及相关协调工作。
            </TermsSection>

            <TermsSection title="二、客户责任">
              <ul className="list-disc space-y-1 pl-5">
                <li>提供准确的品牌、产品、门店、菜单、促销、价格和联系方式。</li>
                <li>确认您有权提供照片、视频、logo、商标、客户评价及其他素材。</li>
                <li>您仍需对最终商业决定、审批、促销、优惠和公开表述负责。</li>
              </ul>
            </TermsSection>

            <TermsSection title="三、平台访问">
              客户门户可用于提交品牌信息、上传素材、查看内容、发送请求和跟进服务进度。您应妥善保管账号及登录信息。
            </TermsSection>

            <TermsSection title="四、第三方平台">
              Google Maps、Instagram、Facebook、TikTok 及其他渠道属于第三方平台。发布、触达、访问权限、评价可见性和数据分析可能受其规则、API、审核决定和账号权限影响。
            </TermsSection>

            <TermsSection title="五、费用与范围">
              费用、交付内容、每月发布量、覆盖渠道和附加服务以相关报价、订单、发票或书面协议为准。广告费、达人费用、平台收费、拍摄及外部制作费用不包含在内，除非另有明确约定。
            </TermsSection>

            <TermsSection title="六、知识产权">
              您保留所提供素材的所有权。在支付适用费用后，您可使用为您的品牌制作并最终确认的内容。我们保留模板、方法、工作流程和非保密经验的所有权。
            </TermsSection>

            <TermsSection title="七、可接受使用">
              您不得要求制作违法、误导、侵权、歧视、有害或违反平台规则的内容。若相关工作产生法律、安全、平台或声誉风险，我们可拒绝、暂停或移除。
            </TermsSection>

            <TermsSection title="八、免责声明">
              我们不保证粉丝增长、互动、销售、搜索排名、平台审批、账号恢复或第三方平台访问持续不中断。
            </TermsSection>

            <TermsSection title="九、暂停与终止">
              双方可按适用套餐或书面安排终止服务。如发生未付款、误用、安全问题或违反本条款，我们可暂停服务。
            </TermsSection>

            <TermsSection title="十、适用法律">
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
