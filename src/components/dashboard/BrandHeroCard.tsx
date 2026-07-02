'use client'

import React from 'react'
import {
  Store, Settings, FileText, ExternalLink, CreditCard,
  Zap, AlertCircle, Globe, Phone, MapPin, Wifi, WifiOff,
} from 'lucide-react'
import { type Brand } from '@/components/layout/BrandSwitcher'

// ─── Types ──────────────────────────────────────────────────────────────────

interface HeroBrandDetail {
  description?: string | null
  website?: string | null
  phone?: string | null
  address?: string | null
  autoPilot?: boolean
  postfastSync?: { ok: boolean; error?: string } | null
  _count?: { contents?: number }
  [key: string]: unknown
}

interface Subscription {
  planName?: string | null
  status?: string | null
  contractEndDate?: string | null
}

interface BrandHeroCardProps {
  brand: Brand
  brandDetail: HeroBrandDetail | null
  subscription: Subscription | null
  pendingReviewCount: number
  urgentCount: number
  autoPilot: boolean
  onShowSettings: () => void
  onShowKnowledge: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTagline(description?: string | null): string {
  if (!description) return ''
  // First sentence or first 60 chars
  const firstSentence = description.split(/[。！？.!?\n]/)[0]
  return firstSentence.length > 72
    ? firstSentence.slice(0, 72) + '…'
    : firstSentence
}

function extractBody(description?: string | null): string {
  if (!description) return ''
  const parts = description.split(/[。！？.!?\n]/)
  if (parts.length <= 1) return ''
  return parts.slice(1).join('。').replace(/^[。\s]+/, '').trim()
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BrandHeroCard({
  brand,
  brandDetail,
  subscription,
  pendingReviewCount,
  urgentCount,
  autoPilot,
  onShowSettings,
  onShowKnowledge,
}: BrandHeroCardProps) {
  const tagline = extractTagline(brandDetail?.description)
  const bodyText = extractBody(brandDetail?.description)
  const isActive = subscription?.status === 'ACTIVE'
  const expiryDate = formatDate(subscription?.contractEndDate)

  return (
    <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/10">
      {/* ── Background gradient ─────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950" />
      {/* Noise overlay for texture */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }} />
      {/* Spotlight blobs */}
      <div className="absolute top-0 right-0 w-96 h-64 bg-indigo-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-16 w-72 h-48 bg-blue-500/15 rounded-full blur-3xl translate-y-1/3" />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="relative px-8 pt-8 pb-7">

        {/* Top row: brand name + status pills */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Brand icon */}
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center flex-shrink-0 shadow-lg">
              <Store className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-black text-white leading-tight tracking-tight">
                  {brand.name}
                </h2>
                {brand.location && (
                  <span className="text-sm text-white/50 font-medium">· {brand.location as string}</span>
                )}
              </div>
              {/* Status row */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {/* AI 在线状态 */}
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  AI 在线
                </span>

                {/* AutoPilot */}
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  autoPilot
                    ? 'bg-blue-500/15 border-blue-400/30 text-blue-300'
                    : 'bg-white/5 border-white/15 text-white/40'
                }`}>
                  {autoPilot ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {autoPilot ? '全自动' : '手动审核'}
                </span>

                {/* Pending review */}
                {pendingReviewCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[11px] font-bold px-2.5 py-1 rounded-full">
                    <Zap className="w-3 h-3" />
                    {pendingReviewCount} 待审核
                  </span>
                )}

                {/* Urgent */}
                {urgentCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-red-500/15 border border-red-400/30 text-red-300 text-[11px] font-bold px-2.5 py-1 rounded-full">
                    <AlertCircle className="w-3 h-3" />
                    {urgentCount} 差评
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons (top-right) */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="hero-brand-link"
              onClick={() => window.open(`/dashboard/brand-owner?brandId=${brand.id}`, '_blank')}
              className="flex items-center gap-1.5 bg-white/8 hover:bg-white/15 border border-white/15 hover:border-white/30 text-white/70 hover:text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              品牌主端
            </button>
            <button
              id="hero-settings"
              onClick={onShowSettings}
              className="flex items-center gap-1.5 bg-white/8 hover:bg-white/15 border border-white/15 hover:border-white/30 text-white/70 hover:text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all"
            >
              <Settings className="w-3 h-3" />
              配置
            </button>
            <button
              id="hero-knowledge"
              onClick={onShowKnowledge}
              className="flex items-center gap-1.5 bg-white/8 hover:bg-white/15 border border-white/15 hover:border-white/30 text-white/70 hover:text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all"
            >
              <FileText className="w-3 h-3" />
              知识库
            </button>

          </div>
        </div>

        {/* ── Brand Story Text ──────────────────────────────────────── */}
        <div className="mt-7 border-t border-white/10 pt-7">
          {tagline ? (
            <>
              <p className="text-[22px] lg:text-[26px] font-black text-white leading-snug tracking-tight max-w-3xl">
                {tagline}
              </p>
              {bodyText && (
                <p className="mt-3 text-sm lg:text-base text-white/55 leading-relaxed max-w-2xl line-clamp-3">
                  {bodyText}
                </p>
              )}
            </>
          ) : (
            <button
              onClick={onShowSettings}
              className="flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/15 group-hover:bg-white/15 group-hover:border-white/30 flex items-center justify-center transition-all">
                <Store className="w-5 h-5 text-white/40 group-hover:text-white/70 transition-colors" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white/50 group-hover:text-white/80 transition-colors">
                  ✏️ 添加品牌故事
                </p>
                <p className="text-xs text-white/30 mt-0.5">
                  品牌一句话定位、特色介绍、目标客群…
                </p>
              </div>
            </button>
          )}
        </div>

        {/* ── Contact info strip ────────────────────────────────────── */}
        {(brandDetail?.address || brandDetail?.website || brandDetail?.phone) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {brandDetail.address && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                <MapPin className="w-3 h-3 text-white/30" />
                {brandDetail.address}
              </span>
            )}
            {brandDetail.website && (
              <a
                href={brandDetail.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-blue-300/70 hover:text-blue-300 bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg transition-colors max-w-[200px] truncate"
              >
                <Globe className="w-3 h-3 flex-shrink-0" />
                {brandDetail.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {brandDetail.phone && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                <Phone className="w-3 h-3 text-white/30" />
                {brandDetail.phone}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Postfast error banner */}
      {brandDetail?.postfastSync && !brandDetail.postfastSync.ok && (
        <div className="relative px-8 py-3 bg-amber-500/10 border-t border-amber-400/20 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-300">
            PostFast 账号同步失败，可能导致 Google Business 未显示。请在集成配置中更新 PostFast API Key 后重试。
          </span>
        </div>
      )}
    </div>
  )
}
