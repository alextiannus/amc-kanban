'use client'

import React, { useEffect, useState } from 'react'
import { Calendar, Mail, Phone, RefreshCw, AlertTriangle } from 'lucide-react'

interface SalesLead {
  id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  notes: string | null
  createdAt: string
  daysActive?: number
  daysToExpiry?: number
}

const STATUS_OPTIONS = [
  ['NEW', '新线索'],
  ['CONTACTED', '已联系'],
  ['DEMO_SCHEDULED', '已预约演示'],
  ['ONBOARDED', '已入驻'],
  ['REJECTED', '已流失'],
]

function statusLabel(status: string) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] || status
}

export default function ContactLeadsPanel() {
  const [leads, setLeads] = useState<SalesLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadLeads = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mm/bd/leads?includeAll=true&source=officialWebsite')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setLeads(Array.isArray(data.leads) ? data.leads : [])
    } catch (err: any) {
      setError(err?.message || '加载官网联系记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [])

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    setError(null)
    try {
      const res = await fetch('/api/mm/bd/leads', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, status } : lead))
    } catch (err: any) {
      setError(err?.message || '更新线索状态失败')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-850 dark:text-slate-100">官网联系记录</h3>
          <p className="mt-1 text-xs font-semibold text-slate-400">来自 AMC official website Contact Us 表单的销售线索。</p>
        </div>
        <button
          type="button"
          onClick={loadLeads}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-150 dark:border-slate-800">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-slate-900 dark:text-slate-500">
            <tr>
              <th className="px-4 py-3">商户</th>
              <th className="px-4 py-3">联系方式</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">提交内容</th>
              <th className="px-4 py-3">提交时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-650 dark:divide-slate-800 dark:bg-slate-950 dark:text-slate-300">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-indigo-500" />
                  正在加载联系记录...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-semibold text-slate-400">暂无官网联系记录</td>
              </tr>
            ) : leads.map((lead) => (
              <tr key={lead.id} className="align-top transition hover:bg-slate-50/60 dark:hover:bg-slate-900/70">
                <td className="px-4 py-3">
                  <p className="font-black text-slate-850 dark:text-slate-100">{lead.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{lead.id}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="grid gap-1.5">
                    {lead.email && <span className="inline-flex items-center gap-1.5"><Mail size={12} />{lead.email}</span>}
                    {lead.phone && <span className="inline-flex items-center gap-1.5"><Phone size={12} />{lead.phone}</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.status}
                    disabled={updatingId === lead.id}
                    onChange={(event) => updateStatus(lead.id, event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-650 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    aria-label={`更新 ${lead.name} 状态`}
                  >
                    {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <p className="mt-1 text-[10px] font-bold text-slate-400">{statusLabel(lead.status)}</p>
                </td>
                <td className="max-w-md px-4 py-3">
                  <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-sans text-[11px] leading-5 text-slate-500 dark:bg-slate-900 dark:text-slate-400">{lead.notes || '-'}</pre>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-400">
                    <Calendar size={12} />
                    {new Date(lead.createdAt).toLocaleString('zh-CN')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
