'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Store, Send, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

interface MockReview {
  id: string
  reviewer: string
  rating: number
  comment: string
  time: string
  replyText?: string
  repliedAt?: string
}

const INITIAL_REVIEWS: Record<string, MockReview[]> = {
  dianping: [
    { id: 'rev_dp_01', reviewer: '大客官小明', rating: 2, comment: '烤鱼烤得太焦了，服务等了40分钟，体验差。', time: '今天 12:30' },
  ],
  meituan: [
    { id: 'rev_mt_02', reviewer: '美团吃货', rating: 1, comment: '服务员态度很冷淡，倒杯水都叫不应。', time: '昨天 19:15' },
  ],
  xiaohongshu: [
    { id: 'rev_xhs_03', reviewer: '小红薯_998', rating: 5, comment: '这家店的波士顿大龙虾新品绝了！极力推荐！', time: '2小时前' },
  ],
  instagram: [
    { id: 'rev_ig_04', reviewer: 'insta_foodie', rating: 4, comment: 'Loved the lobster! Great presentation and super fresh.', time: '1 day ago' },
  ],
  tiktok: [
    { id: 'rev_tt_05', reviewer: 'tiktok_chef', rating: 3, comment: 'The food was decent, but waiting time was a bit too long.', time: '3 hours ago' },
  ],
}

interface Brand {
  id: string
  name: string
}

export default function MockPlatformMerchantPage() {
  const params = useParams()
  const rawPlatform = params?.platform as string || 'dianping'
  const platform = ['dianping', 'meituan', 'xiaohongshu', 'instagram', 'tiktok'].includes(rawPlatform)
    ? rawPlatform
    : 'dianping'

  const [reviews, setReviews] = useState<MockReview[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [triggeringReviewId, setTriggeringReviewId] = useState<string | null>(null)
  
  // Custom states for local mock inputs so extension typing triggers React updates
  const [customReply, setCustomReply] = useState<Record<string, string>>({})
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    setReviews(INITIAL_REVIEWS[platform] || [])
  }, [platform])

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
          message: '未检测到登录会话。请先在另一标签页中登录 AI Marketing Crew 看板，然后刷新此页面。',
        })
      })
      .finally(() => {
        setLoadingBrands(false)
      })
  }, [])

  const handleReplyChange = (id: string, text: string) => {
    setCustomReply((prev) => ({ ...prev, [id]: text }))
  }

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
          platform,
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

  // Define styling themes per platform
  const themes: Record<string, { bg: string; title: string; badge: string; accent: string }> = {
    dianping: { bg: 'bg-orange-950/20 border-orange-500/20 text-orange-400', title: '大众点评 商家中心 (模拟器)', badge: '大众点评', accent: 'bg-orange-600 hover:bg-orange-700' },
    meituan: { bg: 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400', title: '美团商家中心 (模拟器)', badge: '美团', accent: 'bg-emerald-600 hover:bg-emerald-700' },
    xiaohongshu: { bg: 'bg-rose-950/20 border-rose-500/20 text-rose-400', title: '小红书 创作者服务平台 (模拟器)', badge: '小红书', accent: 'bg-rose-600 hover:bg-rose-700' },
    instagram: { bg: 'bg-purple-950/20 border-purple-500/20 text-purple-400', title: 'Instagram Feed Manager (模拟器)', badge: 'Instagram', accent: 'bg-purple-600 hover:bg-purple-700' },
    tiktok: { bg: 'bg-slate-900 border-slate-700 text-slate-100', title: 'TikTok Creator Academy (模拟器)', badge: 'TikTok', accent: 'bg-cyan-600 hover:bg-cyan-700' },
  }

  const currentTheme = themes[platform] || themes.dianping

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-slate-900/80 border-b border-slate-800/80 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2.5">
            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${currentTheme.bg}`}>
              {currentTheme.badge}
            </span>
            {currentTheme.title}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            测试平台特定 DOM 选择器：<code className="font-mono text-indigo-400">/mock-merchant/{platform}</code>
          </p>
        </div>

        {/* Brand Selector */}
        <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 flex-shrink-0">
          <Store className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-300">测试品牌:</span>
          {loadingBrands ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
          ) : (
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded-xl px-3 py-1.5 text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">
              待处理消息 & 评价
            </h2>

            <div className="space-y-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  id={`review-${rev.id}`}
                  data-review-id={rev.id}
                  className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{rev.reviewer}</span>
                    <span className="text-[10px] text-slate-500">{rev.time}</span>
                  </div>

                  <p className="text-xs text-slate-350 leading-relaxed font-medium bg-slate-950/40 p-3.5 rounded-xl border border-slate-850/50">
                    &quot;{rev.comment}&quot;
                  </p>

                  <div className="pt-2 border-t border-slate-850">
                    {rev.replyText ? (
                      <div className="bg-slate-950/50 border border-indigo-950/50 rounded-xl p-3.5 mt-2 flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-extrabold text-emerald-400">已由 插件/AI 自动发表回复 (时间: {rev.repliedAt}):</p>
                          <p className="text-slate-400 mt-1">{rev.replyText}</p>
                        </div>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => handleLocalSubmit(rev.id, e)}
                        className="space-y-3 mt-2"
                      >
                        {/* Render platform-specific input elements matching extension script selectors */}
                        {platform === 'xiaohongshu' && (
                          <div className="comment-item" data-comment-id={rev.id}>
                            <textarea
                              value={customReply[rev.id] ?? ''}
                              onChange={(e) => handleReplyChange(rev.id, e.target.value)}
                              placeholder="输入回复..."
                              className="reply-input w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-650 focus:outline-none"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => handleTriggerReply(rev)}
                                className="reply-trigger-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white"
                              >
                                AI 自动响应测试
                              </button>
                              <button type="submit" className="publish-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 text-slate-200">
                                发送评论
                              </button>
                            </div>
                          </div>
                        )}

                        {platform === 'instagram' && (
                          <div className="instagram-container">
                            <textarea
                              value={customReply[rev.id] ?? ''}
                              onChange={(e) => handleReplyChange(rev.id, e.target.value)}
                              placeholder="Add a comment..."
                              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-650 focus:outline-none"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => handleTriggerReply(rev)}
                                className="reply-trigger-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                AI 自动响应测试
                              </button>
                              <button type="submit" className="reply-submit-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 text-slate-200">
                                Post
                              </button>
                            </div>
                          </div>
                        )}

                        {platform === 'tiktok' && (
                          <div className="tiktok-container">
                            <textarea
                              value={customReply[rev.id] ?? ''}
                              onChange={(e) => handleReplyChange(rev.id, e.target.value)}
                              placeholder="Add reply..."
                              className="comment-reply-input w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-650 focus:outline-none"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => handleTriggerReply(rev)}
                                className="reply-trigger-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-cyan-600 hover:bg-cyan-700 text-white"
                              >
                                AI 自动响应测试
                              </button>
                              <button type="submit" className="reply-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 text-slate-200">
                                Reply
                              </button>
                            </div>
                          </div>
                        )}

                        {['dianping', 'meituan'].includes(platform) && (
                          <div className="domestic-container" data-review-id={rev.id}>
                            <textarea
                              value={customReply[rev.id] ?? ''}
                              onChange={(e) => handleReplyChange(rev.id, e.target.value)}
                              placeholder="在此拟写或由插件直接注入回复文本..."
                              className="reply-textarea w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-650 focus:outline-none"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => handleTriggerReply(rev)}
                                className="reply-trigger-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-650 hover:bg-indigo-700 text-white"
                              >
                                AI 自动响应测试
                              </button>
                              <button type="submit" className="reply-submit-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 text-slate-200">
                                手动发送
                              </button>
                            </div>
                          </div>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Info Box */}
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">
              ⚙️ 调试控制台
            </h2>

            {alertInfo && (
              <div
                className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-2.5 ${
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

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-350">
                可测试的平台列表：
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {['dianping', 'meituan', 'xiaohongshu', 'instagram', 'tiktok'].map((p) => (
                  <a
                    key={p}
                    href={`/mock-merchant/${p}`}
                    className={`p-2.5 rounded-xl border text-center font-bold capitalize transition ${
                      p === platform
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400'
                        : 'bg-slate-900 border-slate-850 hover:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {p === 'xiaohongshu' ? '小红书' : p === 'dianping' ? '大众点评' : p}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
