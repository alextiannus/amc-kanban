'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CreditCard } from 'lucide-react'

export default function NewPrincipalBrandPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [dashboardRole, setDashboardRole] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.ok ? res.json() : null)
      .then((json) => setDashboardRole(json?.dashboardRole || null))
      .catch(() => setDashboardRole(null))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const brandName = name.trim()
    const brandOwnerEmail = ownerEmail.trim().toLowerCase()
    if (!brandName) {
      alert('请填写品牌名称')
      return
    }
    if (!brandOwnerEmail) {
      alert('请填写品牌主邮箱')
      return
    }

    const brandLocation = location.trim()

    if (dashboardRole === 'ADMIN') {
      setSubmitting(true)
      try {
        const res = await fetch('/api/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: brandName,
            location: brandLocation || undefined,
            ownerEmail: brandOwnerEmail,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          alert(json.error || '创建品牌失败')
          return
        }
        router.push('/profile/principal')
      } finally {
        setSubmitting(false)
      }
      return
    }

    const params = new URLSearchParams({
      newBrandName: brandName,
      newBrandOwnerEmail: brandOwnerEmail,
      returnTo: '/profile/principal',
    })
    if (brandLocation) params.set('newBrandLocation', brandLocation)
    router.push('/admin')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          onClick={() => router.push('/profile/principal')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> 返回主理人看板
        </button>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">New Brand</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">添加新品牌</h1>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">品牌名</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                placeholder="输入品牌名称"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">品牌主邮箱</span>
              <input
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                placeholder="owner@example.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">品牌位置</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                placeholder="可选"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700 md:w-auto"
            >
              <CreditCard className="h-4 w-4" /> {submitting ? '创建中...' : dashboardRole === 'ADMIN' ? '直接创建品牌' : '选择订阅套餐'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}