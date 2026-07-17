import Link from 'next/link'
import { ArrowLeft, Download, FileText, Sparkles } from 'lucide-react'
import { getSubscriptionTermsMarkdown } from '@/lib/subscription/terms'

export default function TermsOfService() {
  const markdown = getSubscriptionTermsMarkdown()

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
                Source: canonical Markdown service agreement
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/legal/service-terms?format=pdf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              <Download className="h-4 w-4" />
              PDF
            </a>
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back / 返回
            </Link>
          </div>
        </header>

        <section className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-bold">Service Agreement Acknowledgement</p>
            <p className="mt-1">
              By subscribing to AMC, paying for a subscription, creating a brand workspace, or continuing to use the
              service, the customer acknowledges and agrees to the full Service Terms, including GenAI risk, data rights
              and protection, IP responsibilities, content approval obligations and limitation of liability.
            </p>
          </div>

          <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-xs leading-6 text-slate-700">
            {markdown}
          </pre>
        </section>

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
