'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type ProfileData = {
  type: string
  dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  userRoles?: string[]
}

const baseUrl = 'https://amc-kanban.immedi.ai'

export default function ConnectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [copiedMcp, setCopiedMcp] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/profile')
        if (!res.ok) {
          router.replace('/')
          return
        }
        const data = await res.json() as ProfileData
        const roles = data.userRoles || (
          data.dashboardRole === 'ADMIN'
            ? ['ADMIN']
            : data.dashboardRole === 'BRAND_OWNER'
              ? ['BRAND_OWNER']
              : data.dashboardRole === 'BRAND_DIRECTOR'
                ? ['AMC_PRINCIPAL']
                : []
        )

        const canAccess = data.type === 'HUMAN' && (roles.includes('ADMIN') || roles.includes('BRAND_OWNER'))
        if (!active) return
        setAllowed(canAccess)
      } catch {
        if (active) router.replace('/')
        return
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [router])

  const pageTitle = useMemo(() => 'Connect to AMC Kanban (Owner Setup)', [])
  const mcpConfig = useMemo(() => `{
  "mcpServers": {
    "amc-kanban": {
      "url": "${baseUrl}/api/mcp",
      "headers": {
        "Authorization": "Bearer <AGENT_API_KEY>"
      }
    }
  }
}`, [])

  const copyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfig)
      setCopiedMcp(true)
      window.setTimeout(() => setCopiedMcp(false), 1800)
    } catch {
      setCopiedMcp(false)
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-950 p-8 text-slate-200">Loading access...</main>
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h1 className="text-3xl font-bold">Access Restricted</h1>
          <p className="mt-4 text-slate-300">
            This page is only available to Brand Owners (and Admin users). Please contact your AMC admin if you need access.
          </p>
          <div className="mt-6">
            <Link href="/board" className="text-cyan-300 underline hover:text-cyan-200">
              Back to Board
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <div className="inline-block rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
            Owner-Only Integration Guide
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            For Brand Owners to connect their own AI tools to AMC Kanban with their own Agent API Key.
            You can use REST API, MCP protocol, and Skill/SOP metadata endpoints.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-6">
          <h2 className="text-2xl font-semibold">Before You Start</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-200">
            <li>Create or select your AI agent in AMC dashboard.</li>
            <li>Use your own Agent API Key (do not share keys across teams).</li>
            <li>Bind your agent to the brands you own before running write operations.</li>
          </ol>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-2xl font-semibold">1. REST API (HTTP)</h2>
          <p className="mt-2 text-slate-300">
            Best for scripts, backend services, Dify HTTP nodes, and systems that do not support MCP.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950 p-4">
            <pre className="text-sm text-slate-200">
{`curl -X GET "${baseUrl}/api/agent/brand-config" \
  -H "Authorization: Bearer <AGENT_API_KEY>" \
  -H "Content-Type: application/json"`}
            </pre>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Core docs endpoint: <code className="text-cyan-300">{baseUrl}/api/meta/openapi</code>
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-2xl font-semibold">2. MCP (Recommended)</h2>
          <p className="mt-2 text-slate-300">
            Best for Claude Desktop/OpenClaw/Hermes and any runtime with remote MCP support.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={copyMcpConfig}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700"
            >
              {copiedMcp ? 'Copied' : 'Copy MCP Config'}
            </button>
            <span className="text-xs text-slate-400">Paste into your MCP client config and replace &lt;AGENT_API_KEY&gt;.</span>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950 p-4">
            <pre className="text-sm text-slate-200">
{mcpConfig}
            </pre>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            MCP endpoint: <code className="text-cyan-300">{baseUrl}/api/mcp</code>
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-2xl font-semibold">3. Skill/SOP Metadata</h2>
          <p className="mt-2 text-slate-300">
            Use these endpoints to bootstrap agent behavior, execution constraints, and integration context.
          </p>
          <ul className="mt-4 space-y-2 text-slate-200">
            <li>
              OpenAPI: <code className="text-cyan-300">{baseUrl}/api/meta/openapi</code>
            </li>
            <li>
              SOP: <code className="text-cyan-300">{baseUrl}/api/meta/sop</code>
            </li>
            <li>
              Integrations Skill: <code className="text-cyan-300">{baseUrl}/api/meta/skills/amc-integrations</code>
            </li>
            <li>
              Avatar Guide: <code className="text-cyan-300">{baseUrl}/api/meta/avatar-guide</code>
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-6">
          <h2 className="text-xl font-semibold text-amber-200">Security Notes</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-amber-100">
            <li>Never expose full API keys in logs, browser console, or public docs.</li>
            <li>All brand-level operations should pass explicit brandId.</li>
            <li>Prefer MCP first; use REST as fallback when MCP is unavailable.</li>
          </ul>
        </section>

        <footer className="mt-10 flex items-center justify-between text-sm text-slate-400">
          <span>Owner setup complete, then connect your own AI runtime with the same key.</span>
          <Link href="/board" className="text-cyan-300 hover:text-cyan-200 underline">
            Back to Board
          </Link>
        </footer>
      </div>
    </main>
  )
}
