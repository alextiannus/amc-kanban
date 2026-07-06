import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, Shield, Sparkles } from 'lucide-react'

const SERVICE_EMAIL = 'service@deliverychinatown.com'

export default function PrivacyAgreement() {
  return (
    <main className="min-h-screen w-full bg-slate-50 px-4 py-6 text-slate-800 md:px-8 md:py-10">
      <article className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-200 bg-teal-50">
              <Shield className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950 md:text-3xl">Privacy Agreement / 隐私协议</h1>
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
              This Privacy Agreement explains how AI Marketing Crew collects, uses, discloses, protects and retains
              personal data in connection with our website, client portal and social media marketing services. It is
              designed with reference to Singapore&apos;s Personal Data Protection Act 2012.
            </p>

            <PrivacySection title="1. Personal Data We Collect">
              We may collect business contact details, account login details, brand owner or staff names, email
              addresses, phone numbers, outlet details, billing information, uploaded photos or videos, support
              messages, approval records, usage logs and service information.
            </PrivacySection>

            <PrivacySection title="2. Purposes">
              <ul className="list-disc space-y-1 pl-5">
                <li>Create and manage client accounts and service requests.</li>
                <li>Plan, prepare, review and coordinate marketing work.</li>
                <li>Communicate about approvals, reports, billing, support and updates.</li>
                <li>Maintain security, audit trails, service quality and legal or regulatory compliance.</li>
              </ul>
            </PrivacySection>

            <PrivacySection title="3. Consent and Withdrawal">
              Where required, we collect, use or disclose personal data with consent or as permitted by law. You may
              withdraw consent by contacting{' '}
              <a className="font-semibold text-teal-700 hover:text-teal-800" href={`mailto:${SERVICE_EMAIL}`}>
                {SERVICE_EMAIL}
              </a>
              , though withdrawal may affect our ability to provide services or portal access.
            </PrivacySection>

            <PrivacySection title="4. Disclosure">
              We may disclose personal data to authorized staff, service providers, hosting providers, communication
              tools, payment or billing providers, professional advisers and third-party platforms where necessary to
              provide services or meet legal obligations.
            </PrivacySection>

            <PrivacySection title="5. Accuracy, Access and Correction">
              Please keep your information accurate and updated. You may request access to or correction of your
              personal data, subject to identity verification and applicable legal exceptions.
            </PrivacySection>

            <PrivacySection title="6. Protection and Retention">
              We use reasonable administrative, technical and operational safeguards to protect personal data. We retain
              data only as long as needed for service delivery, business records, legal obligations, dispute handling
              and operational purposes.
            </PrivacySection>

            <PrivacySection title="7. Transfers Outside Singapore">
              If personal data is processed outside Singapore, we take reasonable steps to ensure comparable protection
              in line with PDPA requirements, including contractual and operational safeguards where appropriate.
            </PrivacySection>

            <PrivacySection title="8. Data Breaches">
              If a data incident occurs, we will assess the impact and, where required by law, notify the Personal Data
              Protection Commission and affected individuals.
            </PrivacySection>

            <PrivacySection title="9. Marketing Communications">
              We may send service updates or marketing communications where permitted. You may opt out of promotional
              messages, though service-related communications may still be sent.
            </PrivacySection>

            <PrivacySection title="10. Contact">
              For privacy, access, correction, withdrawal of consent or data protection questions, contact us at{' '}
              <a className="font-semibold text-teal-700 hover:text-teal-800" href={`mailto:${SERVICE_EMAIL}`}>
                {SERVICE_EMAIL}
              </a>
              .
            </PrivacySection>
          </section>

          <hr className="border-slate-200" />

          <section className="space-y-4">
            <p>
              本隐私协议说明 AI Marketing Crew 如何在官网、客户门户和社交媒体营销服务中收集、使用、披露、保护和保留个人数据。本协议参考新加坡《个人数据保护法 2012》（PDPA）制定。
            </p>

            <PrivacySection title="一、我们收集的个人数据">
              我们可能收集商业联系人资料、账号登录信息、品牌负责人或员工姓名、电子邮件、电话号码、门店资料、账单信息、上传的照片或视频、支持消息、审批记录、使用日志和服务信息。
            </PrivacySection>

            <PrivacySection title="二、使用目的">
              <ul className="list-disc space-y-1 pl-5">
                <li>创建和管理客户账号及服务请求。</li>
                <li>规划、准备、审核和协调营销工作。</li>
                <li>就审批、报告、账单、支持和更新进行沟通。</li>
                <li>维护安全、审计记录、服务质量以及法律或监管合规。</li>
              </ul>
            </PrivacySection>

            <PrivacySection title="三、同意与撤回">
              在需要时，我们会基于同意或法律允许收集、使用或披露个人数据。您可通过{' '}
              <a className="font-semibold text-teal-700 hover:text-teal-800" href={`mailto:${SERVICE_EMAIL}`}>
                {SERVICE_EMAIL}
              </a>{' '}
              联系我们撤回同意，但撤回可能影响我们继续提供服务或门户访问。
            </PrivacySection>

            <PrivacySection title="四、披露">
              为提供服务或履行法律义务，我们可能向授权员工、服务供应商、托管服务商、通信工具、支付或账单服务商、专业顾问以及必要的第三方平台披露个人数据。
            </PrivacySection>

            <PrivacySection title="五、准确性、访问与更正">
              请确保您提供的信息准确并及时更新。您可请求访问或更正个人数据，但需通过身份验证，并受适用法律例外限制。
            </PrivacySection>

            <PrivacySection title="六、保护与保留">
              我们采取合理的行政、技术和运营保护措施保护个人数据。数据仅在服务交付、业务记录、法律义务、争议处理和运营所需期间保留。
            </PrivacySection>

            <PrivacySection title="七、跨境传输">
              如个人数据在新加坡境外处理，我们会采取合理措施，确保其获得符合 PDPA 要求的同等保护，包括适当的合同和运营保障。
            </PrivacySection>

            <PrivacySection title="八、数据泄露">
              如发生数据事件，我们会评估影响，并在法律要求时通知新加坡个人数据保护委员会及受影响个人。
            </PrivacySection>

            <PrivacySection title="九、营销通信">
              在法律允许范围内，我们可能发送服务更新或营销通信。您可选择退出推广信息，但服务相关通信仍可能继续发送。
            </PrivacySection>

            <PrivacySection title="十、联系我们">
              如有隐私、访问、更正、撤回同意或数据保护问题，请通过{' '}
              <a className="font-semibold text-teal-700 hover:text-teal-800" href={`mailto:${SERVICE_EMAIL}`}>
                {SERVICE_EMAIL}
              </a>{' '}
              联系我们。
            </PrivacySection>
          </section>
        </div>

        <footer className="mt-10 flex items-center justify-between border-t border-slate-200 pt-5 text-xs text-slate-500">
          <span>© 2026 Immedi.ai</span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-teal-600" />
            AI Marketing Crew
          </span>
        </footer>
      </article>
    </main>
  )
}

function PrivacySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="border-l-4 border-teal-500 pl-3 text-base font-bold text-slate-950">{title}</h2>
      <div>{children}</div>
    </section>
  )
}
