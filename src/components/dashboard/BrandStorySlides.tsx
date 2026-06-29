'use client'

import React, { useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, MapPin, Globe, Star, Users, Sparkles, Shield } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Account {
  uid: string
  platformId: string
  handle: string
  profileUrl?: string
  value: string
  delta: string
  deltaPositive: boolean
}

interface SlidesBrandDetail {
  description?: string | null
  website?: string | null
  phone?: string | null
  address?: string | null
  [key: string]: unknown
}

interface Subscription {
  planName?: string | null
  status?: string | null
  contractEndDate?: string | null
}

interface BrandStorySlidesProps {
  brandName: string
  brandLocation?: string | null
  brandDetail: SlidesBrandDetail | null
  accounts: Account[]
  subscription: Subscription | null
  onShowSettings: () => void
}

// ─── Slide Data ───────────────────────────────────────────────────────────────

type Slide = {
  id: string
  emoji: string
  label: string
  headline: string
  body: string
  gradient: string
  glowColor: string
  icon: React.ElementType
  link?: string
  linkLabel?: string
  isEmpty?: boolean
}

function buildSlides(params: {
  brandName: string
  brandLocation?: string | null
  brandDetail: SlidesBrandDetail | null
  accounts: Account[]
  subscription: Subscription | null
}): Slide[] {
  const { brandName, brandLocation, brandDetail, accounts, subscription } = params
  const slides: Slide[] = []

  // Slide 1 — 品牌故事
  const descParts = (brandDetail?.description ?? '').split(/[。！？.!?\n]/).filter(Boolean)
  const storyBody = descParts.slice(1, 4).join('。').trim()
  slides.push({
    id: 'story',
    emoji: '🏮',
    label: '品牌故事',
    headline: brandName,
    body: storyBody || (brandDetail?.description ? brandDetail.description.slice(0, 100) : '点击"配置"完善品牌介绍，让 AI 团队更好地了解您的品牌故事'),
    gradient: 'from-orange-600 via-red-600 to-rose-700',
    glowColor: 'rgba(234,88,12,0.4)',
    icon: Sparkles,
    isEmpty: !brandDetail?.description,
  })

  // Slide 2 — 目标客群 (从 description 里启发性提取，或空状态引导)
  const audienceKeywords = ['客群', '顾客', '适合', '年轻', '家庭', '白领', '华人', '本地', '留学生', '商务']
  const audienceSentence = (brandDetail?.description ?? '').split(/[。！？.!?\n]/)
    .find(s => audienceKeywords.some(k => s.includes(k)))
  slides.push({
    id: 'audience',
    emoji: '🎯',
    label: '目标客群',
    headline: audienceSentence ? '精准触达目标受众' : '客群定位',
    body: audienceSentence ?? '在品牌知识库中补充目标客群信息，AI 将为您精准策划每一条内容',
    gradient: 'from-blue-600 via-indigo-600 to-violet-700',
    glowColor: 'rgba(99,102,241,0.4)',
    icon: Users,
    isEmpty: !audienceSentence,
  })

  // Slide 3 — 品牌特色
  const featKeywords = ['特色', '独特', '招牌', '老字号', '传统', '正宗', '秘方', '创新', '地道', '经典']
  const featSentence = (brandDetail?.description ?? '').split(/[。！？.!?\n]/)
    .find(s => featKeywords.some(k => s.includes(k)))
  slides.push({
    id: 'highlights',
    emoji: '✨',
    label: '品牌特色',
    headline: featSentence ? '独特竞争优势' : '核心竞争力',
    body: featSentence ?? '完善品牌资料后，AI 团队将提炼您的核心差异化卖点，制作专属内容策略',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    glowColor: 'rgba(16,185,129,0.4)',
    icon: Star,
    isEmpty: !featSentence,
  })

  // Slide 4 — 门店地址
  if (brandLocation || brandDetail?.address) {
    const mapQuery = encodeURIComponent(brandDetail?.address ?? brandLocation ?? brandName)
    slides.push({
      id: 'location',
      emoji: '📍',
      label: '门店地址',
      headline: brandDetail?.address ?? brandLocation ?? '',
      body: brandLocation ? `📍 ${brandLocation}` : '',
      gradient: 'from-cyan-600 via-sky-600 to-blue-700',
      glowColor: 'rgba(14,165,233,0.4)',
      icon: MapPin,
      link: `https://www.google.com/maps/search/?api=1&query=${mapQuery}`,
      linkLabel: '在 Google Maps 查看',
    })
  }

  // Slide 5 — 官网 & 社交主页
  const topAccounts = accounts.slice(0, 3)
  if (brandDetail?.website || topAccounts.length > 0) {
    const platformNames = topAccounts.map(a => `@${a.handle}`).join(' · ')
    slides.push({
      id: 'social',
      emoji: '🌐',
      label: '社交主页',
      headline: brandDetail?.website
        ? brandDetail.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
        : '社交媒体矩阵',
      body: platformNames || '账号数据正在同步中…',
      gradient: 'from-violet-600 via-purple-600 to-pink-700',
      glowColor: 'rgba(139,92,246,0.4)',
      icon: Globe,
      link: brandDetail?.website ?? undefined,
      linkLabel: brandDetail?.website ? '访问官网' : undefined,
    })
  }

  // Slide 6 — 服务套餐
  const isActive = subscription?.status === 'ACTIVE'
  const expiry = subscription?.contractEndDate
    ? new Date(subscription.contractEndDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  slides.push({
    id: 'subscription',
    emoji: '💎',
    label: '服务套餐',
    headline: subscription?.planName ?? '暂无套餐',
    body: isActive
      ? expiry ? `服务有效期至 ${expiry}` : '订阅已激活，AI 团队全力运转中'
      : '套餐待激活，请联系 AMC 服务团队完成收款确认',
    gradient: isActive
      ? 'from-amber-500 via-yellow-500 to-orange-500'
      : 'from-slate-600 via-slate-700 to-slate-800',
    glowColor: isActive ? 'rgba(245,158,11,0.4)' : 'rgba(100,116,139,0.3)',
    icon: Shield,
  })

  return slides
}

// ─── Individual Slide ─────────────────────────────────────────────────────────

function StorySlide({ slide, onEmpty }: { slide: Slide; onEmpty?: () => void }) {
  const Icon = slide.icon
  return (
    <div
      className={`relative flex-shrink-0 w-72 lg:w-80 h-52 rounded-3xl overflow-hidden cursor-default select-none`}
      style={{
        background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
        boxShadow: `0 20px 60px -10px ${slide.glowColor}`,
      }}
    >
      {/* Gradient fill via class */}
      <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient}`} />

      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
      />

      {/* Spotlight blob */}
      <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl" />

      {/* Content */}
      <div className="relative h-full flex flex-col p-5 justify-between">
        <div>
          {/* Top row: emoji + label */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-4xl leading-none">{slide.emoji}</span>
            <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm border border-white/20 px-2 py-1 rounded-full">
              <Icon className="w-3 h-3 text-white/80" />
              <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">{slide.label}</span>
            </div>
          </div>

          {/* Headline */}
          <h3 className="text-base font-black text-white leading-tight line-clamp-2">
            {slide.headline}
          </h3>
        </div>

        {/* Body + link */}
        <div>
          <p className={`text-xs text-white/65 leading-relaxed line-clamp-2 ${slide.isEmpty ? 'italic' : ''}`}>
            {slide.body}
          </p>

          {slide.link && (
            <a
              href={slide.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-white/80 hover:text-white bg-white/15 hover:bg-white/25 border border-white/20 px-2 py-1 rounded-full transition-all"
              onClick={e => e.stopPropagation()}
            >
              {slide.linkLabel} →
            </a>
          )}

          {slide.isEmpty && onEmpty && (
            <button
              onClick={onEmpty}
              className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-white/80 hover:text-white bg-white/15 hover:bg-white/25 border border-white/20 px-2 py-1 rounded-full transition-all"
            >
              ✏️ 完善资料
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BrandStorySlides({
  brandName,
  brandLocation,
  brandDetail,
  accounts,
  subscription,
  onShowSettings,
}: BrandStorySlidesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const slides = buildSlides({ brandName, brandLocation, brandDetail, accounts, subscription })

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 8)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          品牌故事
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            id="story-scroll-left"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button
            id="story-scroll-right"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Scrollable slides track */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {slides.map(slide => (
          <div key={slide.id} className="snap-start">
            <StorySlide
              slide={slide}
              onEmpty={slide.isEmpty ? onShowSettings : undefined}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
