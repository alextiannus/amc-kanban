'use client'

import Link from 'next/link'
import { ArrowLeft, FileText, Sparkles } from 'lucide-react'

export default function TermsOfService() {
  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-800 p-6 md:p-12 relative flex justify-center">
      {/* Background aurora glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-400/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-purple-400/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl bg-white/80 border border-slate-200/80 rounded-3xl p-8 md:p-12 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200/60 pb-8 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm">
              <FileText className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="font-manrope font-bold text-2xl md:text-3xl text-slate-900">Terms of Service / 服务条款</h1>
              <p className="font-hanken text-xs text-slate-500 mt-1">Last Updated: July 6, 2026 | Governing Law: Singapore</p>
            </div>
          </div>
          <Link
            href="/"
            className="self-start md:self-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login / 返回登录
          </Link>
        </div>

        <div className="prose prose-slate max-w-none space-y-8 font-hanken text-sm leading-relaxed text-slate-600">
          {/* English Version */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">1. Acceptance of Terms</h2>
            <p>
              By creating an account, registering, or accessing the AI Marketing Crew (AMC) platform operated by Immedi.ai, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not register for or use the services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">2. Description of Services</h2>
            <p>
              AMC is an AI-powered autonomous operations and marketing platform. Our services include provisioning autonomous AI Agents ("AI Staff") that generate copy, schedule social media posts, retrieve client reviews, and post replies on authorized channels on behalf of the user.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">3. Autonomous Publishing and User Responsibility</h2>
            <p>
              You acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>By connecting third-party platforms (e.g. Google Business Profile, Instagram, etc.), you authorize our AI Agents to publish content and execute replies on your behalf.</li>
              <li>You are solely responsible for ensuring you have the legal right to bind the respective merchant accounts.</li>
              <li>While you may enable "Autopilot" mode, you maintain ultimate ownership of the content generated. You are advised to review drafts and verify compliance with local advertising laws and guidelines.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">4. Limitation of Liability</h2>
            <p>
              Immedi.ai and the AMC platform make no warranties regarding the absolute accuracy, engagement, or SEO outcomes of the AI-generated copy. We are not liable for any temporary or permanent bans, suspensions, or penalties imposed on your merchant accounts by third-party social media platforms, or for any brand damage resulting from automated review replies.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">5. Governing Law</h2>
            <p>
              These Terms of Service shall be governed by and construed in accordance with the laws of Singapore. Any disputes arising out of or in connection with these terms shall be subject to the exclusive jurisdiction of the courts of Singapore.
            </p>
          </section>

          <hr className="border-slate-200/60 my-10" />

          {/* Chinese Version */}
          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">一、 条款接受</h2>
            <p>
              通过在 Immedi.ai 运营的 AI Marketing Crew (AMC) 平台注册、登录或使用服务，即表示您同意接受本服务条款的约束。如果您不同意本条款，请勿注册或使用本服务。
            </p>
          </section>

          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">二、 服务描述</h2>
            <p>
              AMC 是一个基于人工智能驱动的营销自动运营平台。我们的服务包括提供自治 AI 员工（AI Staff），代为撰写文案、排期发布社交媒体内容、拉取客户评价并代表用户在已授权的社交和门店平台上发布回复。
            </p>
          </section>

          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">三、 自主发布与用户责任</h2>
            <p>
              您知悉并同意以下事项：
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>通过绑定第三方平台（如 Google 商家页面、Instagram 等），即表示您授权我们的 AI 代理代表您发布内容并执行回复。</li>
              <li>您对确保自己拥有绑定对应商户账号的合法权利承担全部责任。</li>
              <li>尽管您可以启用“自动驾驶 (Autopilot)”模式，但您对生成的内容拥有最终的所有权和控制权。建议您定期审查草稿，并确保发布的内容符合当地的广告法律法规。</li>
            </ul>
          </section>

          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">四、 免责与责任限制</h2>
            <p>
              Immedi.ai 和 AMC 平台对 AI 生成内容的绝对准确性、互动量或搜索排名结果不做任何保证。对于因第三方平台对您的商户账号实施的任何暂停、封禁、降权或处罚，或因自动回复评论引起的任何品牌公关争议，我们不承担任何赔偿责任。
            </p>
          </section>

          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">五、 准据法与管辖权</h2>
            <p>
              本服务条款应受新加坡法律管辖并按其解释。因本条款引起或与之相关的任何争议，应提交新加坡法院专属管辖。
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-200/60 flex items-center justify-between font-jetbrains text-xs text-slate-400">
          <span>© 2026 Immedi.ai. All rights reserved.</span>
          <div className="flex gap-2 items-center">
            <Sparkles className="h-3 w-3 text-indigo-500" />
            <span>AI Staff Portal</span>
          </div>
        </div>
      </div>
    </div>
  )
}
