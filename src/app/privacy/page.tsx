'use client'

import Link from 'next/link'
import { ArrowLeft, Shield, Sparkles } from 'lucide-react'

export default function PrivacyPolicy() {
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
            <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shadow-sm">
              <Shield className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="font-manrope font-bold text-2xl md:text-3xl text-slate-900">Privacy Policy / 隐私政策</h1>
              <p className="font-hanken text-xs text-slate-500 mt-1">Last Updated: July 6, 2026 | Compliant with Singapore PDPA 2012</p>
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
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">1. Collection of Personal Data</h2>
            <p>
              In connection with your onboarding and use of the AI Marketing Crew (AMC) platform, we collect and process personal data in compliance with the Singapore Personal Data Protection Act 2012 (PDPA). The data we collect includes:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account profile details (Name, email address, contact phone number, country/city of operation).</li>
              <li>Brand details and marketing assets (Brand name, descriptions, business URLs, and logos).</li>
              <li>Connected social media API credentials and OAuth tokens (Google Maps/Business Profile, Yelp, Instagram, TikTok, etc.) to automate digital operations.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">2. Purposes of Processing</h2>
            <p>
              We collect, use, and disclose your personal data solely for the following purposes:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Managing and verifying your account and subscription plans.</li>
              <li>Powering our autonomous AI agents to write, schedule, and publish marketing content on your authorized platforms.</li>
              <li>Monitoring and retrieving customer reviews, and executing replies either directly or via the extension bridge.</li>
              <li>Generating operational analytics, performance benchmarks, and dashboard insights.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">3. Data Security and Storage</h2>
            <p>
              All sensitive third-party integration credentials (API keys, Client Secrets, and OAuth Refresh Tokens) are encrypted at rest and transmitted securely. We employ appropriate administrative, physical, and technical safeguards to prevent unauthorized access, alteration, or disclosure.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">4. Access, Correction, and Contact</h2>
            <p>
              Under the PDPA, you have the right to request access to or correction of your personal data held by us, or withdraw consent to its processing. For any requests or privacy concerns, please contact our Data Protection Officer at: <strong>dpo@immedi.ai</strong>.
            </p>
          </section>

          <hr className="border-slate-200/60 my-10" />

          {/* Chinese Version */}
          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">一、 个人数据收集</h2>
            <p>
              在您注册、登录及使用 AI Marketing Crew (AMC) 平台的过程中，我们根据新加坡《个人数据保护法 2012》（PDPA）的要求收集并处理您的个人数据。收集的数据范围包括：
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>账户基础信息（姓名、电子邮件地址、联系电话、运营国家/城市）。</li>
              <li>品牌相关信息与营销素材（品牌名称、业务描述、网站链接及徽标图片等）。</li>
              <li>授权绑定的第三方社交媒体及门店 API 凭证与 OAuth 令牌（包括 Google Maps/Business Profile, Yelp, Instagram, TikTok 等），用于自动化运营。</li>
            </ul>
          </section>

          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">二、 数据使用目的</h2>
            <p>
              我们仅出于以下目的收集、使用或披露您的个人数据：
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>管理和验证您的账户登录及订阅方案。</li>
              <li>支持平台自治的 AI 员工（AI Agents）为您撰写、排期和发布营销内容。</li>
              <li>检索并监控顾客对您店铺的评论，并通过 API 或浏览器插件执行回复。</li>
              <li>生成运营数据看板、活动洞察及平台指标分析。</li>
            </ul>
          </section>

          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">三、 数据安全与存储</h2>
            <p>
              所有敏感的第三方集成凭据（包括 API 密钥、客户端密钥和 OAuth 刷新令牌）在数据库中均会进行加密存储，并在传输过程中进行加密处理。我们采取适当的行政、技术和物理安全措施，防止未经授权的访问、篡改或泄露。
            </p>
          </section>

          <section className="space-y-4 lang-zh">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-purple-500 pl-3">四、 访问、更正与退出权</h2>
            <p>
              根据 PDPA，您有权向我们查询或更正您被存储的个人数据，或撤回对相关数据处理的同意。如有任何请求或关于隐私安全的咨询，请联系我们的数据保护官：<strong>dpo@immedi.ai</strong>。
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-200/60 flex items-center justify-between font-jetbrains text-xs text-slate-400">
          <span>© 2026 Immedi.ai. All rights reserved.</span>
          <div className="flex gap-2 items-center">
            <Sparkles className="h-3 w-3 text-purple-500" />
            <span>AI Staff Portal</span>
          </div>
        </div>
      </div>
    </div>
  )
}
