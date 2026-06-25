'use client'

import React, { useState, useEffect } from 'react'
import { Store, Send, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

interface MockReview {
  id: string
  platform: 'dianping' | 'meituan'
  reviewer: string
  rating: number
  comment: string
  time: string
  replyText?: string
  repliedAt?: string
}

const MOCK_REVIEWS_INITIAL: MockReview[] = [
  {
    id: 'rev_dp_01',
    platform: 'dianping',
    reviewer: '小明同学',
    rating: 2,
    comment: '昨晚去吃烤鱼，等了足足40分钟！而且鱼烤得太焦了，服务态度也一般，必须差评。',
    time: '今天 12:30',
  },
  {
    id: 'rev_mt_02',
    platform: 'meituan',
    reviewer: '吃货二哈',
    rating: 1,
    comment: '味道还可以，但是服务员根本叫不应。倒杯水都推三阻四，希望能整改。',
    time: '昨天 19:15',
  },
  {
    id: 'rev_dp_03',
    platform: 'dianping',
    reviewer: '莉莉安',
    rating: 5,
    comment: '新品波士顿龙虾味道好极了！分量很足，环境也不错，全五星推荐！',
    time: '2026-05-22 18:00',
  },
]

interface Brand {
  id: string
  name: string
  location?: string | null
}

export default function MockMerchantPage() {
  const [reviews, setReviews] = useState<MockReview[]>(MOCK_REVIEWS_INITIAL)
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [triggeringReviewId, setTriggeringReviewId] = useState<string | null>(null)
  const [customReply, setCustomReply] = useState<Record<string, string>>({})
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Fetch human user's brands list to associate the simulated action
  useEffect(() => {
    fetch('/api/brands?assignedOnly=true')
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized')
        return res.json()
      })
      .then((data) => {
        setBrands(data)
        if (data.length > 0) {
          setSelectedBrandId(data[0].id)
        }
      })
      .catch((e) => {
        console.error(e)
        setAlertInfo({
          type: 'error',
          message: '未检测到登录会话。请先在另一标签页中登录 AI Marketing Crew，然后刷新此页面。',
        })
      })
      .finally(() => {
        setLoadingBrands(false)
      })
  }, [])

  // Handle local text inputs (updates UI when the extension simulates typing)
  const handleReplyChange = (id: string, text: string) => {
    setCustomReply((prev) => ({ ...prev, [id]: text }))
  }

  // Handle submission of reply (updates UI state when extension clicks submit)
  const handleLocalSubmit = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const text = customReply[id] || ''
    if (!text.trim()) return

    setReviews((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, replyText: text, repliedAt: new Date().toLocaleTimeString() }
          : r
      )
    )
  }

  // Helper to trigger backend execution (submits test trigger to endpoint)
  const handleTriggerReply = async (review: MockReview) => {
    if (!selectedBrandId) {
      alert('请先选择关联的品牌项目！')
      return
    }

    const defaultReply = review.rating <= 3
      ? `非常抱歉给您带来不好的就餐体验。我是本店的店长，已将您反映的意见传达给服务组整改。我们为您提供了一份专属心意补偿，请前往查看：http://localhost:3000/game/${selectedBrandId}`
      : '非常感谢您对我们门店和产品的支持！期待您的下次光临。'

    setTriggeringReviewId(review.id)
    setAlertInfo(null)

    try {
      const res = await fetch('/api/integrations/extension/test-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrandId,
          platform: review.platform,
          reviewId: review.id,
          replyText: defaultReply,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setAlertInfo({
          type: 'success',
          message: `自动回复成功！扩展已通过 SSE 通道拦截命令，在 0.5s 内安全注入本页面 DOM 并提交了回复。`,
        })
      } else {
        throw new Error(data.error || '未收到扩展响应，请确保插件已安装并连接。')
      }
    } catch (e: unknown) {
      setAlertInfo({
        type: 'error',
        message: `触发失败: ${e instanceof Error ? e.message : String(e)}`,
      })
    } finally {
      setTriggeringReviewId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Banner */}
      <div className="bg-slate-950 border-b border-slate-800 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-orange-600/20 text-orange-500 text-sm">Simulator</span>
            大众点评/美团 商家中心后台 (模拟页面)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            供本地开发者在 localhost 调试 Chrome 插件桥接 (SSE + DOM 自动化回复)
          </p>
        </div>

        {/* Brand Selector for Testing */}
        <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 flex-shrink-0">
          <Store className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-300">关联测试品牌:</span>
          {loadingBrands ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>载入中...</span>
            </div>
          ) : brands.length > 0 ? (
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded-xl px-3 py-1.5 text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id.substring(0, 6)}...)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-rose-400 font-bold">请先登录</span>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Mock Reviews Container */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">
              📥 店铺最新待回复评价 ({reviews.filter((r) => !r.replyText).length})
            </h2>

            <div className="space-y-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  id={`review-${rev.id}`}
                  data-review-id={rev.id}
                  className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 hover:border-slate-800 transition-all space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          rev.platform === 'dianping'
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {rev.platform === 'dianping' ? '大众点评' : '美团'}
                      </span>
                      <span className="text-xs font-bold text-slate-200">{rev.reviewer}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">{rev.time}</span>
                  </div>

                  {/* Rating Stars */}
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-sm ${
                          i < rev.rating ? 'text-amber-400' : 'text-slate-700'
                        }`}
                      >
                        ★
                      </span>
                    ))}
                  </div>

                  {/* Comment */}
                  <p className="text-xs text-slate-350 leading-relaxed font-medium bg-slate-950/40 p-3.5 rounded-xl border border-slate-850/50">
                    &quot;{rev.comment}&quot;
                  </p>

                  {/* Reply Input Section (matching runDomesticReplyInPage selectors) */}
                  <div className="pt-2 border-t border-slate-850">
                    {rev.replyText ? (
                      <div className="bg-slate-950/50 border border-indigo-950/50 rounded-xl p-3.5 mt-2 flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-extrabold text-emerald-400">已由 插件/AI 自动发表回复 (时间: {rev.repliedAt}):</p>
                          <p className="text-slate-400 mt-1 leading-relaxed">{rev.replyText}</p>
                        </div>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => handleLocalSubmit(rev.id, e)}
                        className="space-y-3 mt-2"
                      >
                        <div className="relative">
                          {/* Matches: textarea */}
                          <textarea
                            value={customReply[rev.id] ?? ''}
                            onChange={(e) => handleReplyChange(rev.id, e.target.value)}
                            placeholder="在此拟写或由插件直接注入回复文本..."
                            className="reply-textarea w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            rows={3}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-slate-500">
                            插件查找元素路径: <code className="font-mono text-indigo-400">[data-review-id=&quot;{rev.id}&quot;] .reply-textarea</code>
                          </p>
                          <div className="flex gap-2">
                            {/* Simulator button */}
                            <button
                              type="button"
                              disabled={triggeringReviewId !== null}
                              onClick={() => handleTriggerReply(rev)}
                              className="reply-trigger-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition active:scale-95 shadow-sm shadow-indigo-500/20"
                            >
                              {triggeringReviewId === rev.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              AI 自动响应测试
                            </button>
                            {/* Matches: button[type="submit"] or .reply-submit-btn */}
                            <button
                              type="submit"
                              className="reply-submit-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                            >
                              手动发送
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Column: Simulation Console */}
        <div className="space-y-6">
          {/* Debug Console Panel */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">
              ⚙️ 插件桥接器调试控制台
            </h2>

            {/* Alert Status Banners */}
            {alertInfo && (
              <div
                className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-2.5 animate-in fade-in duration-300 ${
                  alertInfo.type === 'success'
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-400'
                    : 'bg-rose-950/20 border-rose-800/40 text-rose-400'
                }`}
              >
                {alertInfo.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{alertInfo.message}</span>
              </div>
            )}

            {/* Step Guides */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-350">
                联调测试步骤指南：
              </h3>
              <div className="space-y-3.5 text-xs text-slate-400 leading-relaxed font-medium">
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-extrabold flex items-center justify-center shrink-0">1</span>
                  <p>
                    在 Chrome 扩展中加载当前项目的 <code className="font-mono text-white">chrome-extension</code>。
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-extrabold flex items-center justify-center shrink-0">2</span>
                  <p>
                    打开您的 <a href="/board" target="_blank" className="text-indigo-400 hover:underline font-bold">AI Marketing Crew 品牌主看板</a> 并选择同一个测试品牌，这会触发插件与之建立 SSE 连接。
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-extrabold flex items-center justify-center shrink-0">3</span>
                  <p>
                    保持当前模拟器页面打开（它就是代表商户电脑前已经打开的大众点评/美团后台标签页）。
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-extrabold flex items-center justify-center shrink-0">4</span>
                  <p>
                    在左侧选择对应评价，点击 <span className="text-indigo-400 font-bold">&quot;AI 自动响应测试&quot;</span> 按钮。系统将模拟 AI 调用 MCP 工具，下发回复命令。
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-extrabold flex items-center justify-center shrink-0">5</span>
                  <p>
                    观察本页面输入框会被插件自动填入回复语，并触发发送按钮，测试整个闭环双向连通性！
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
