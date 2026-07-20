'use client'

import { useEffect, useMemo, useState } from 'react'

type Prize = {
  id?: string
  name: string
  type: 'COUPON' | 'PHYSICAL' | 'POINTS' | 'THANKS'
  probability: number
  totalInventory: number | null
  claimedCount?: number
  imageUrl?: string | null
}

type GameConfig = {
  title: string
  description: string | null
  themeColor: string
  taskGoogleMapsEnabled: boolean
  taskXiaohongshuEnabled: boolean
  taskInstagramEnabled: boolean
  templateType: 'WHEEL' | 'GRID'
  prizes: Prize[]
  brand?: {
    name?: string
    location?: string | null
    googleReviewUrl?: string | null
    googleBusinessUrl?: string | null
    accounts?: { platformId: string; profileUrl?: string | null; handle?: string | null }[]
  }
}

type GameStatus = {
  pointsBalance: number
  unclaimedPrizes: {
    logId: string
    prizeName: string
    prizeType: string
    redemptionCode: string
  }[]
}

type SpinResult = {
  prize: { name: string; type: string; imageUrl?: string | null }
  redemptionCode: string
  pointsBalance: number
}

function getSessionId(brandId: string): string {
  const key = `amc-game-session:${brandId}`
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const next = crypto.randomUUID()
  window.localStorage.setItem(key, next)
  return next
}

function platformUrl(config: GameConfig | null, platform: 'GOOGLE' | 'XIAOHONGSHU' | 'INSTAGRAM'): string | undefined {
  if (!config) return undefined
  if (platform === 'GOOGLE') return config.brand?.googleReviewUrl || config.brand?.googleBusinessUrl || undefined
  const account = config.brand?.accounts?.find((item) => item.platformId.toLowerCase() === platform.toLowerCase())
  return account?.profileUrl || undefined
}

export default function CustomerGameClient({ brandId }: { brandId: string }) {
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [status, setStatus] = useState<GameStatus | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)

  const accent = config?.themeColor || '#2563eb'
  const activePrizes = useMemo(() => (config?.prizes || []).filter((prize) => prize.name), [config])

  useEffect(() => {
    const id = getSessionId(brandId)
    setSessionId(id)

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [configRes, statusRes] = await Promise.all([
          fetch(`/api/game/config?brandId=${encodeURIComponent(brandId)}&public=true`, { cache: 'no-store' }),
          fetch(`/api/game/status?brandId=${encodeURIComponent(brandId)}&sessionId=${encodeURIComponent(id)}`, { cache: 'no-store' }),
        ])
        if (!configRes.ok) throw new Error('This activity is not ready yet.')
        if (!statusRes.ok) throw new Error('Unable to load your game status.')
        setConfig(await configRes.json())
        setStatus(await statusRes.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to open this activity.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [brandId])

  async function submitReview(platform: 'GOOGLE' | 'XIAOHONGSHU' | 'INSTAGRAM') {
    if (!sessionId) return
    if (!agreed) {
      setError('Please confirm the copyright and participation agreement first.')
      return
    }
    setError('')
    setMessage('')
    const form = new FormData()
    form.set('brandId', brandId)
    form.set('sessionId', sessionId)
    form.set('taskType', 'REVIEW_SUBMIT')
    form.set('reviewPlatform', platform)
    form.set('copyrightAgreed', 'true')
    const response = await fetch('/api/game/tasks', { method: 'POST', body: form })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error || 'Submission failed.')
      return
    }
    setMessage('Submitted. Please show this screen to the staff for confirmation.')
  }

  async function spin() {
    if (!sessionId || spinning) return
    setError('')
    setMessage('')
    setSpinResult(null)
    setSpinning(true)
    const response = await fetch('/api/game/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, sessionId }),
    })
    const data = await response.json().catch(() => ({}))
    setSpinning(false)
    if (!response.ok) {
      setError(data.error || 'Spin failed.')
      return
    }
    setSpinResult(data)
    setStatus((prev) => prev ? { ...prev, pointsBalance: data.pointsBalance } : prev)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          <p className="text-sm font-semibold text-white/70">Loading activity...</p>
        </div>
      </main>
    )
  }

  if (error && !config) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center text-slate-900">
          <h1 className="text-lg font-black">Activity unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-900">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50">
        <header className="px-5 pb-8 pt-8 text-white" style={{ background: accent }}>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/70">{config?.brand?.name || 'AMC Activity'}</p>
          <h1 className="mt-3 text-3xl font-black leading-tight">{config?.title || 'Scan & Win'}</h1>
          {config?.description && <p className="mt-3 text-sm leading-6 text-white/85">{config.description}</p>}
        </header>

        <div className="-mt-5 flex-1 space-y-4 rounded-t-[28px] bg-slate-50 px-5 pb-8 pt-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase text-slate-400">Points</p>
              <p className="mt-1 text-3xl font-black" style={{ color: accent }}>{status?.pointsBalance ?? 0}</p>
            </div>
            <button
              onClick={spin}
              disabled={spinning}
              className="rounded-2xl px-4 py-3 text-left font-black text-white shadow-sm disabled:opacity-60"
              style={{ background: accent }}
            >
              <span className="block text-[11px] uppercase text-white/70">Cost: 5 points</span>
              {spinning ? 'Spinning...' : 'Spin Now'}
            </button>
          </div>

          {spinResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase text-emerald-700">You won</p>
              <h2 className="mt-1 text-xl font-black text-emerald-950">{spinResult.prize.name}</h2>
              <p className="mt-2 rounded-xl bg-white px-3 py-2 text-center text-2xl font-black tracking-[0.2em] text-emerald-700">{spinResult.redemptionCode}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">Show this code to store staff.</p>
            </div>
          )}

          {status?.unclaimedPrizes?.length ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase text-slate-400">Unclaimed rewards</p>
              <div className="mt-3 space-y-2">
                {status.unclaimedPrizes.map((prize) => (
                  <div key={prize.logId} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-sm font-bold">{prize.prizeName}</span>
                    <span className="font-black tracking-widest" style={{ color: accent }}>{prize.redemptionCode}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black">Earn points</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Leave a review or follow the merchant channel, then ask staff to confirm your submission.</p>
            <label className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
              <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5" />
              I confirm I own the content I submit and agree it may be used by the merchant for marketing.
            </label>
            <div className="mt-3 grid gap-2">
              {config?.taskGoogleMapsEnabled && (
                <a href={platformUrl(config, 'GOOGLE')} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-black">
                  Open Google review
                </a>
              )}
              {config?.taskXiaohongshuEnabled && (
                <a href={platformUrl(config, 'XIAOHONGSHU')} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-black">
                  Open Xiaohongshu
                </a>
              )}
              {config?.taskInstagramEnabled && (
                <a href={platformUrl(config, 'INSTAGRAM')} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-black">
                  Open Instagram
                </a>
              )}
              <button onClick={() => submitReview('GOOGLE')} className="rounded-xl px-3 py-3 text-sm font-black text-white" style={{ background: accent }}>
                I completed the task
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black">Prize pool</h2>
            <div className="mt-3 grid gap-2">
              {activePrizes.map((prize) => (
                <div key={prize.id || prize.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-sm font-bold">{prize.name}</span>
                  <span className="text-xs font-bold text-slate-400">{prize.type}</span>
                </div>
              ))}
            </div>
          </div>

          {(error || message) && (
            <div className={`rounded-2xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              {error || message}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
