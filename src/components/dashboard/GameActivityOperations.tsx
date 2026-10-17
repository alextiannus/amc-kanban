'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarClock, Loader2, Plus, RefreshCw, Search, TicketCheck, Trash2, Save } from 'lucide-react'
import { activityPrimary, activitySecondary, activityDanger } from './activityUi'

interface ActivityRound {
  id: string
  startsAt: string
  endsAt: string
  createdAt: string
  updatedAt: string
}

interface ShareDraftPoolStatus {
  targetSize: number
  locales: Record<'zh' | 'en', {
    available: number
    reserved: number
    status: string
    lastGeneratedAt: string | null
    lastError: string | null
  }>
}

function zonedDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0)
  return { year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour'), minute: pick('minute'), second: pick('second') }
}

function utcToRoundInput(value: string, timeZone: string) {
  const parts = zonedDateParts(new Date(value), timeZone)
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

function roundInputToUtc(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('请填写完整的活动日期和时间。')
  const desired = match.slice(1).map(Number)
  const wallClockUtc = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4])
  let candidate = wallClockUtc
  for (let index = 0; index < 3; index += 1) {
    const shown = zonedDateParts(new Date(candidate), timeZone)
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute)
    candidate += wallClockUtc - shownAsUtc
  }
  const finalParts = zonedDateParts(new Date(candidate), timeZone)
  if ([finalParts.year, finalParts.month, finalParts.day, finalParts.hour, finalParts.minute].some((part, index) => part !== desired[index])) {
    throw new Error('该本地时间在品牌时区中不存在，请选择其他时间。')
  }
  return new Date(candidate).toISOString()
}

function activityRoundStatus(round: ActivityRound) {
  const now = Date.now()
  if (new Date(round.endsAt).getTime() <= now) return 'ENDED' as const
  if (new Date(round.startsAt).getTime() <= now) return 'ACTIVE' as const
  return 'UPCOMING' as const
}


export default function GameActivityOperations({ brandId }: { brandId: string }) {
  const [config, setConfig] = useState<{ clerkPin: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activityRounds, setActivityRounds] = useState<ActivityRound[]>([])
  const [brandTimezone, setBrandTimezone] = useState('Asia/Singapore')
  const [newRoundStartsAt, setNewRoundStartsAt] = useState('')
  const [newRoundEndsAt, setNewRoundEndsAt] = useState('')
  const [roundEdits, setRoundEdits] = useState<Record<string, { startsAt: string; endsAt: string }>>({})
  const [roundBusy, setRoundBusy] = useState<string | null>(null)
  const [shareDraftPool, setShareDraftPool] = useState<ShareDraftPoolStatus | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolError, setPoolError] = useState('')

  const [redemptionCode, setRedemptionCode] = useState('')
  const [redemptionLoading, setRedemptionLoading] = useState(false)
  const [redemptionMessage, setRedemptionMessage] = useState('')
  const [redemptionError, setRedemptionError] = useState('')
  const [redemptionResult, setRedemptionResult] = useState<{
    redemptionCode: string
    status: string
    prizeName: string
    prizeType: string
    createdAt?: string
    claimedAt?: string | null
  } | null>(null)

  const fetchShareDraftPool = useCallback(async (showLoading = false) => {
    if (showLoading) setPoolLoading(true)
    try {
      const response = await fetch(`/api/game/share-draft-pool?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as { pool?: ShareDraftPoolStatus; error?: string }
      if (!response.ok || !data.pool) throw new Error(data.error || '无法读取 分享文案库存')
      setShareDraftPool(data.pool)
      setPoolError('')
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : '无法读取 分享文案库存')
    } finally {
      if (showLoading) setPoolLoading(false)
    }
  }, [brandId])


  const loadOperations = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const response = await fetch(`/api/game/config?brandId=${encodeURIComponent(brandId)}&initialize=false`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '无法读取活动配置')
      if (!data.id) { setConfig(null); return }
      setConfig({ clerkPin: data.clerkPin })
      const roundsResponse = await fetch(`/api/game/rounds?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
      const rounds = await roundsResponse.json()
      if (!roundsResponse.ok) throw new Error(rounds.error || '无法读取活动轮次')
      const timezone = rounds.timezone || 'Asia/Singapore'
      setBrandTimezone(timezone); setActivityRounds(rounds.rounds)
      setRoundEdits(Object.fromEntries(rounds.rounds.map((round: ActivityRound) => [round.id, { startsAt: utcToRoundInput(round.startsAt, timezone), endsAt: utcToRoundInput(round.endsAt, timezone) }])))
      await fetchShareDraftPool()
    } catch (err) { setError(err instanceof Error ? err.message : '无法读取运营数据') }
    finally { setLoading(false) }
  }, [brandId, fetchShareDraftPool])
  useEffect(() => { queueMicrotask(() => void loadOperations()) }, [loadOperations])
  useEffect(() => {
    if (!shareDraftPool || !Object.values(shareDraftPool.locales).some(item => ['PENDING', 'GENERATING'].includes(item.status))) return
    const timer = window.setInterval(() => void fetchShareDraftPool(), 3000)
    return () => window.clearInterval(timer)
  }, [fetchShareDraftPool, shareDraftPool])
  const upsertRound = useCallback((round: ActivityRound) => {
    setActivityRounds((current) => [...current.filter((item) => item.id !== round.id), round]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()))
    setRoundEdits((current) => ({
      ...current,
      [round.id]: {
        startsAt: utcToRoundInput(round.startsAt, brandTimezone),
        endsAt: utcToRoundInput(round.endsAt, brandTimezone),
      },
    }))
  }, [brandTimezone])

  const createActivityRound = async () => {
    setError(null)
    setRoundBusy('new')
    try {
      const startsAt = roundInputToUtc(newRoundStartsAt, brandTimezone)
      const endsAt = roundInputToUtc(newRoundEndsAt, brandTimezone)
      const response = await fetch('/api/game/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, startsAt, endsAt }),
      })
      const data = await response.json().catch(() => ({})) as { round?: ActivityRound; error?: string }
      if (!response.ok || !data.round) throw new Error(data.error || 'Unable to create activity round')
      upsertRound(data.round)
      setNewRoundStartsAt('')
      setNewRoundEndsAt('')
      window.setTimeout(() => void fetchShareDraftPool(), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create activity round')
    } finally {
      setRoundBusy(null)
    }
  }

  const updateActivityRound = async (round: ActivityRound) => {
    const edit = roundEdits[round.id]
    if (!edit) return
    const status = activityRoundStatus(round)
    setError(null)
    setRoundBusy(round.id)
    try {
      const payload: { brandId: string; roundId: string; startsAt?: string; endsAt: string } = {
        brandId,
        roundId: round.id,
        endsAt: roundInputToUtc(edit.endsAt, brandTimezone),
      }
      if (status === 'UPCOMING') payload.startsAt = roundInputToUtc(edit.startsAt, brandTimezone)
      const response = await fetch('/api/game/rounds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({})) as { round?: ActivityRound; error?: string }
      if (!response.ok || !data.round) throw new Error(data.error || 'Unable to update activity round')
      upsertRound(data.round)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update activity round')
    } finally {
      setRoundBusy(null)
    }
  }

  const deleteActivityRound = async (round: ActivityRound) => {
    if (!confirm('确定删除这个尚未开始的活动轮次吗？')) return
    setError(null)
    setRoundBusy(round.id)
    try {
      const response = await fetch(`/api/game/rounds?brandId=${encodeURIComponent(brandId)}&roundId=${encodeURIComponent(round.id)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to delete activity round')
      setActivityRounds((current) => current.filter((item) => item.id !== round.id))
      setRoundEdits((current) => {
        const next = { ...current }
        delete next[round.id]
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete activity round')
    } finally {
      setRoundBusy(null)
    }
  }

  const refillShareDraftPool = async () => {
    setPoolLoading(true)
    setPoolError('')
    try {
      const response = await fetch('/api/game/share-draft-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || '无法提交文案补充任务')
      setShareDraftPool((current) => current ? {
        ...current,
        locales: {
          zh: { ...current.locales.zh, status: 'PENDING', lastError: null },
          en: { ...current.locales.en, status: 'PENDING', lastError: null },
        },
      } : current)
      window.setTimeout(() => void fetchShareDraftPool(), 1000)
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : '无法提交文案补充任务')
    } finally {
      setPoolLoading(false)
    }
  }

  const lookupRedemption = async () => {
    if (!config || !redemptionCode.trim()) return
    setRedemptionLoading(true)
    setRedemptionError('')
    setRedemptionMessage('')
    setRedemptionResult(null)
    try {
      const params = new URLSearchParams({
        brandId,
        code: redemptionCode.trim().toUpperCase(),
        pinCode: config.clerkPin,
      })
      const res = await fetch(`/api/game/redemptions?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '查询失败')
      const item = data.redemptions?.[0]
      if (!item) throw new Error('未找到该兑奖码')
      setRedemptionResult(item)
    } catch (err) {
      setRedemptionError(err instanceof Error ? err.message : '查询失败')
    } finally {
      setRedemptionLoading(false)
    }
  }

  const claimRedemption = async () => {
    if (!config || !redemptionCode.trim()) return
    setRedemptionLoading(true)
    setRedemptionError('')
    setRedemptionMessage('')
    try {
      const res = await fetch('/api/game/redemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          redemptionCode: redemptionCode.trim().toUpperCase(),
          pinCode: config.clerkPin,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '核销失败')
      setRedemptionResult(data.redemption)
      setRedemptionMessage(data.redemption?.alreadyClaimed ? '该兑换码此前已核销，不会重复使用。' : '核销成功，系统已存档。')
    } catch (err) {
      setRedemptionError(err instanceof Error ? err.message : '核销失败')
    } finally {
      setRedemptionLoading(false)
    }
  }


  return <div className="space-y-4 pt-4">
    <button type="button" onClick={() => void loadOperations()} disabled={loading} className={activitySecondary}><RefreshCw size={14}/>刷新运营数据</button>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <p role="status" className="text-sm text-slate-500">正在读取运营数据…</p> : !config ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">保存抽奖轮盘配置后，可在这里管理活动轮次、分享文案和奖品核销。关注活动无需配置抽奖。</p> : <>
          {/* Activity rounds */}
          <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  <CalendarClock size={15} className="text-blue-500" />
                  活动轮次
                </h3>
                <p className="mt-1 text-xs leading-4 text-slate-400">
                  按品牌时区 {brandTimezone} 排期；没有进行中的轮次时，顾客端自动暂停，永久二维码不变。
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${activityRounds.some((round) => activityRoundStatus(round) === 'ACTIVE') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {activityRounds.some((round) => activityRoundStatus(round) === 'ACTIVE') ? '活动进行中' : '当前暂停'}
              </span>
            </div>

            <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-950/10">
              <p className="mb-2 text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">新增活动轮次</p>
              <p className="mb-2 text-xs leading-4 text-slate-500">开始时间可以早于当前时间；只要结束时间仍在未来，创建后会立即生效。</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-bold text-slate-500">
                  开始时间
                  <input
                    type="datetime-local"
                    value={newRoundStartsAt}
                    onChange={(event) => setNewRoundStartsAt(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-500">
                  结束时间
                  <input
                    type="datetime-local"
                    value={newRoundEndsAt}
                    onChange={(event) => setNewRoundEndsAt(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void createActivityRound()}
                disabled={!newRoundStartsAt || !newRoundEndsAt || roundBusy !== null}
                className={activityPrimary}
              >
                {roundBusy === 'new' ? <Loader2 size={14} className={activityPrimary} /> : <Plus size={14} />}
                创建轮次
              </button>
            </div>

            {activityRounds.length === 0 ? (
              <div className="rounded-xl bg-amber-50 px-3 py-4 text-center text-xs font-bold text-amber-700">
                尚未配置活动轮次，活动保持暂停。
              </div>
            ) : (
              <div className="space-y-2">
                {activityRounds.map((round) => {
                  const status = activityRoundStatus(round)
                  const edit = roundEdits[round.id] || {
                    startsAt: utcToRoundInput(round.startsAt, brandTimezone),
                    endsAt: utcToRoundInput(round.endsAt, brandTimezone),
                  }
                  const readonly = status === 'ENDED'
                  const startLocked = status !== 'UPCOMING'
                  const statusCopy = status === 'ACTIVE' ? '进行中' : status === 'UPCOMING' ? '未开始' : '已结束'
                  const statusStyle = status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : status === 'UPCOMING' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                  return (
                    <div key={round.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${statusStyle}`}>{statusCopy}</span>
                        <span className="text-xs font-mono text-slate-400">{round.id.slice(-8)}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1 text-xs font-bold text-slate-500">
                          开始时间 {status === 'ACTIVE' && '（已锁定）'}
                          <input
                            type="datetime-local"
                            value={edit.startsAt}
                            disabled={startLocked}
                            onChange={(event) => setRoundEdits((current) => ({ ...current, [round.id]: { ...edit, startsAt: event.target.value } }))}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-bold text-slate-500">
                          结束时间
                          <input
                            type="datetime-local"
                            value={edit.endsAt}
                            disabled={readonly}
                            onChange={(event) => setRoundEdits((current) => ({ ...current, [round.id]: { ...edit, endsAt: event.target.value } }))}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          />
                        </label>
                      </div>
                      {!readonly && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void updateActivityRound(round)}
                            disabled={roundBusy !== null}
                            className={activityPrimary}
                          >
                            {roundBusy === round.id ? <Loader2 size={12} className={activitySecondary} /> : <Save size={12} />}
                            保存轮次
                          </button>
                          {status === 'UPCOMING' && (
                            <button
                              type="button"
                              onClick={() => void deleteActivityRound(round)}
                              disabled={roundBusy !== null}
                              className={activityDanger}
                              aria-label="删除轮次"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* AI review draft pool */}
          <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  <RefreshCw size={15} className="text-violet-500" />
                  分享文案库存
                </h3>
                <p className="mt-1 text-xs leading-4 text-slate-400">
                  顾客分享时使用已准备的文案；中文、英文各维持 {shareDraftPool?.targetSize || 5} 组，使用后自动补充。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refillShareDraftPool()}
                disabled={poolLoading}
                className={activitySecondary}
              >
                <RefreshCw size={12} className={poolLoading ? 'animate-spin' : ''} />
                补充至 5 组
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(['zh', 'en'] as const).map((localeKey) => {
                const item = shareDraftPool?.locales[localeKey]
                const statusCopy = item?.status === 'GENERATING' ? '生成中' : item?.status === 'PENDING' ? '待生成' : item?.status === 'ERROR' ? '生成失败' : '库存正常'
                const statusStyle = item?.status === 'ERROR' ? 'bg-red-50 text-red-700' : ['PENDING', 'GENERATING'].includes(item?.status || '') ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                return (
                  <div key={localeKey} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-100">{localeKey === 'zh' ? '中文文案' : 'English drafts'}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${statusStyle}`}>{statusCopy}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900">
                        <p className="text-xs font-bold text-slate-400">可用</p>
                        <p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{item?.available ?? 0}</p>
                      </div>
                      <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900">
                        <p className="text-xs font-bold text-slate-400">已锁定</p>
                        <p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{item?.reserved ?? 0}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-4 text-slate-400">
                      最近生成：{item?.lastGeneratedAt ? new Date(item.lastGeneratedAt).toLocaleString('zh-CN') : '尚未生成'}
                    </p>
                    {item?.lastError && <p className="mt-1 break-words text-xs leading-4 text-red-600">{item.lastError}</p>}
                  </div>
                )
              })}
            </div>
            {poolError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{poolError}</p>}
          </div>

          {/* Redemption */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
            <div>
              <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">兑奖查询 / 核销</h3>
              <p className="mt-1 text-xs leading-4 text-slate-400">输入顾客手机上的兑奖码，查询奖品状态并核销；核销记录可供后续查询。</p>
            </div>
            <div className="flex gap-2">
              <input
                value={redemptionCode}
                onChange={(event) => setRedemptionCode(event.target.value.toUpperCase())}
                placeholder="输入中奖码"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black tracking-widest text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={lookupRedemption}
                disabled={redemptionLoading || !redemptionCode.trim()}
                className={activitySecondary}
                title="查询"
              >
                {redemptionLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>
            {redemptionResult && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-800 dark:text-slate-100">{redemptionResult.prizeName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${
                    redemptionResult.status === 'CLAIMED'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : redemptionResult.status === 'UNCLAIMED'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>{redemptionResult.status}</span>
                </div>
                <p className="mt-1 font-mono text-xs font-bold tracking-widest text-slate-500">{redemptionResult.redemptionCode}</p>
                {redemptionResult.claimedAt && <p className="mt-1 text-xs text-slate-400">已核销：{new Date(redemptionResult.claimedAt).toLocaleString()}</p>}
              </div>
            )}
            {redemptionError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:bg-red-950/30 dark:text-red-300">{redemptionError}</p>}
            {redemptionMessage && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{redemptionMessage}</p>}
            <button
              onClick={claimRedemption}
              disabled={redemptionLoading || !redemptionCode.trim() || redemptionResult?.status === 'CLAIMED'}
              className={activityPrimary}
            >
              {redemptionLoading ? <Loader2 size={14} className="animate-spin" /> : <TicketCheck size={14} />}
              确认核销并存档
            </button>
          </div>
    </>}
  </div>
}
