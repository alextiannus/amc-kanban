'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Plus, Trash2, ArrowRight } from 'lucide-react'

interface ContentDraft {
  id: string
  caption: string
  mediaUrls: string[]
  scheduledAt?: string | null
  status: string
  platform: string
}

interface MediaAsset {
  id: string
  url: string
  filename?: string | null
  aiCategory?: string | null
  aiCaption?: string | null
  aiTags: string[]
}

interface MMSubPageOverlayProps {
  activeSubPage: 'calendar' | 'market' | 'assets' | 'settings' | null
  onClose: () => void
  // Calendar props
  now: Date
  drafts: ContentDraft[]
  selectedDay: Date
  setSelectedDay: (d: Date) => void
  // Assets props
  assets: MediaAsset[]
  uploading: boolean
  onUploadClick: () => void
  onConvertAssetToPost: (asset: MediaAsset) => void
  // Settings props
  brandTone: string
  setBrandTone: (v: string) => void
  slangDict: Record<string, string>
  setSlangDict: (v: Record<string, string>) => void
  onSaveSettings: () => Promise<void>
  // Toast
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function MMSubPageOverlay({
  activeSubPage,
  onClose,
  now,
  drafts,
  selectedDay,
  setSelectedDay,
  assets,
  uploading,
  onUploadClick,
  onConvertAssetToPost,
  brandTone,
  setBrandTone,
  slangDict,
  setSlangDict,
  onSaveSettings,
  showToast,
}: MMSubPageOverlayProps) {
  if (!activeSubPage) return null

  // --- Calendar calculations ---
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate()
  const monthCells = [
    ...Array(firstDayIndex).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1)
  ]
  const monthDrafts = drafts.filter(draft => {
    if (!draft.scheduledAt) return false
    const d = new Date(draft.scheduledAt)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const selectedDayDrafts = drafts.filter(draft => {
    if (!draft.scheduledAt) return false
    const d = new Date(draft.scheduledAt)
    return d.getDate() === selectedDay.getDate() &&
           d.getMonth() === selectedDay.getMonth() &&
           d.getFullYear() === selectedDay.getFullYear()
  })
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return {
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateNum: d.getDate(),
      fullDate: d,
    }
  })

  const subPageTitle = {
    calendar: 'Campaign Calendar',
    assets: 'Media Library',
    market: '预约服务',
    settings: 'AI Character Settings',
  }[activeSubPage] || ''

  return (
    <div className="fixed inset-0 z-50 bg-[#f7f9fb] dark:bg-slate-950 overflow-y-auto pb-10 flex flex-col">
      {/* Subpage Header */}
      <header className="sticky top-0 w-full z-40 bg-[#f7f9fb]/90 dark:bg-slate-950/90 backdrop-blur-md shadow-sm h-16 flex items-center justify-between px-4 border-b border-slate-200/50 dark:border-slate-800/50">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 active:scale-95 transition-all"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          <span>Back to Chat</span>
        </button>
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
          {subPageTitle}
        </h2>
        <div className="w-20" />
      </header>

      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">

        {/* ─── CALENDAR ──────────────────────────────────────────────────── */}
        {activeSubPage === 'calendar' && (
          <>
            <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-2">
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} className="h-11" />
                  const cellDate = new Date(currentYear, currentMonth, day)
                  const isToday = day === now.getDate() && currentMonth === now.getMonth() && currentYear === now.getFullYear()
                  const isSelected = selectedDay.getDate() === day && selectedDay.getMonth() === currentMonth && selectedDay.getFullYear() === currentYear
                  const hasDraft = drafts.some(draft => {
                    if (!draft.scheduledAt) return false
                    const dd = new Date(draft.scheduledAt)
                    return dd.getDate() === day && dd.getMonth() === currentMonth && dd.getFullYear() === currentYear
                  })
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(cellDate)}
                      className={`h-11 rounded-lg flex flex-col items-center justify-between p-1 text-[11px] transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-white font-bold shadow-md shadow-primary/20 scale-105'
                          : isToday
                            ? 'bg-indigo-50 border border-primary/30 text-primary font-bold'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{day}</span>
                      {hasDraft && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400'}`} />}
                    </button>
                  )
                })}
              </div>
              <div className="pt-4 border-t border-slate-100 space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                <p className="text-xs font-bold text-slate-400">Scheduled Posts This Month</p>
                {monthDrafts.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 italic">No campaign posts scheduled for this month.</div>
                ) : (
                  monthDrafts.map(draft => (
                    <div key={draft.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-between text-xs mb-1.5 last:mb-0">
                      <span className="font-medium text-slate-700 truncate max-w-[200px]">{draft.caption || 'Campaign Post'}</span>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase">
                        {new Date(draft.scheduledAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Weekly Planner</h3>
                <span className="text-[10px] text-slate-400 font-bold">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(Date.now() + 6*24*60*60*1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
                <div className="flex justify-between overflow-x-auto gap-2 no-scrollbar">
                  {weekDates.map(day => {
                    const isSelected = selectedDay.getDate() === day.fullDate.getDate() &&
                                       selectedDay.getMonth() === day.fullDate.getMonth() &&
                                       selectedDay.getFullYear() === day.fullDate.getFullYear()
                    return (
                      <button
                        key={day.dateNum}
                        onClick={() => setSelectedDay(day.fullDate)}
                        className={`flex flex-col items-center gap-1.5 px-3.5 py-2.5 rounded-xl transition-all ${
                          isSelected
                            ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="text-[9px] font-extrabold uppercase opacity-80">{day.dayName}</span>
                        <span className="text-sm font-black">{day.dateNum}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-2">
                  {selectedDayDrafts.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400 italic">No campaign posts scheduled for this day.</div>
                  ) : (
                    selectedDayDrafts.map(draft => (
                      <div key={draft.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-primary">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{draft.caption || 'Weekly Feast Special'}</h4>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase">{draft.platform} • Scheduled</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-tight ${
                          draft.status === 'published' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {draft.status === 'published' ? 'Published' : 'Pending Review'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* ─── ASSETS ────────────────────────────────────────────────────── */}
        {activeSubPage === 'assets' && (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Quick Upload</h3>
              </div>
              <button
                onClick={onUploadClick}
                disabled={uploading}
                className="w-full bg-white border-dashed border-2 border-primary/20 hover:border-primary/40 p-4 rounded-2xl flex items-center justify-center gap-3 transition-colors active:bg-slate-50/60 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-700">
                  {uploading ? 'Processing File...' : 'Upload Fresh Dish Photos'}
                </span>
              </button>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {assets.length === 0 ? (
                  <div className="w-full text-center py-6 text-xs text-slate-400 italic">No recent photo assets. Upload some above!</div>
                ) : (
                  assets.map(asset => (
                    <div key={asset.id} className="flex-shrink-0 w-44 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm flex flex-col justify-between">
                      <div className="relative h-40 w-full bg-slate-50">
                        <img src={asset.url} alt={asset.filename || 'Uploaded asset'} className="w-full h-full object-cover" />
                        {asset.aiCategory && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] bg-slate-900/70 text-white font-semibold backdrop-blur-sm">
                            {asset.aiCategory}
                          </span>
                        )}
                      </div>
                      <div className="p-2 border-t border-slate-50">
                        <button
                          onClick={() => onConvertAssetToPost(asset)}
                          className="w-full bg-primary text-white py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          To Instagram Post
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Media Library Grid</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {assets.length === 0 ? (
                  <div className="col-span-2 text-center py-10 text-xs text-slate-400 italic">No assets in library. Upload files.</div>
                ) : (
                  assets.map(asset => (
                    <div key={asset.id} className="border border-slate-100 rounded-xl overflow-hidden shadow-sm flex flex-col bg-slate-50 group relative">
                      <div className="h-32 w-full bg-slate-100">
                        <img src={asset.url} alt={asset.filename || 'Media Library asset'} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2 bg-white flex flex-col justify-between flex-1">
                        <p className="text-[10px] text-slate-500 truncate mb-2">{asset.filename || 'Untitled Asset'}</p>
                        <button
                          onClick={() => onConvertAssetToPost(asset)}
                          className="w-full bg-primary/10 hover:bg-primary/20 text-primary py-1.5 rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" /> Create Post
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {/* ─── MARKET ────────────────────────────────────────────────────── */}
        {activeSubPage === 'market' && (
          <div className="space-y-4 pb-4">
            <div className="flex items-center gap-3 pb-1">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-800">预约服务</h2>
                <p className="text-[10px] text-slate-400 font-medium">选择服务，一键发起预约申请</p>
              </div>
            </div>

            {/* 素材拍摄 */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 p-4 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">专业素材拍摄</h3>
                    <p className="text-[10px] text-white/70 mt-0.5">预约摄影团队上门拍摄菜品 / 环境照</p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-2 text-xs text-slate-600">
                  {['菜品精修图（最多 20 道菜）', '门店环境 / 氛围照 5 张', '短视频素材（30 秒 Reel 原素材）', '所有素材自动同步至素材库'].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => showToast('预约申请已提交，我们的团队将在 24 小时内联系您。', 'success')}
                  className="w-full bg-violet-500 hover:bg-violet-600 text-white font-bold py-3 rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-violet-500/20"
                >
                  立即预约拍摄
                </button>
              </div>
            </div>

            {/* 大众点评 */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 p-4 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">大众点评运营</h3>
                    <p className="text-[10px] text-white/70 mt-0.5">提升口碑评分，优化店铺曝光排名</p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-2 text-xs text-slate-600">
                  {['差评监控与智能回复建议', '好评引导话术 + 二维码物料设计', '每月口碑数据分析报告', '店铺主页优化建议（图片 / 文案）'].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => showToast('大众点评运营咨询已提交，顾问将在 1 个工作日内联系您。', 'success')}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-orange-500/20"
                >
                  预约顾问咨询
                </button>
              </div>
            </div>

            {/* 预约探店 */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">预约探店</h3>
                    <p className="text-[10px] text-white/70 mt-0.5">邀请 KOL / 达人到店实地探店种草</p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-2 text-xs text-slate-600">
                  {['匹配本地小红书 / 抖音达人', '达人到店体验 + 内容发布排期', '探店笔记审核 + 数据追踪', '曝光保障（粉丝量 > 5000）'].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => showToast('探店预约申请已提交，BD 团队将在 24 小时内联系您。', 'success')}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20"
                >
                  预约探店合作
                </button>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-slate-500 font-medium">如需定制服务或了解更多套餐详情</p>
              <p className="text-xs font-bold text-primary mt-1">联系您的专属运营顾问</p>
            </div>
          </div>
        )}

        {/* ─── SETTINGS ──────────────────────────────────────────────────── */}
        {activeSubPage === 'settings' && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Brand Character Settings</h3>
            <p className="text-xs text-slate-400">
              Teach the AI companion about your store tone, menu items, and target slang dictionary.
            </p>
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Brand Voice Style</label>
                <textarea
                  value={brandTone}
                  onChange={e => setBrandTone(e.target.value)}
                  placeholder="A casual, engaging restaurant tone using local Singlish slang."
                  rows={3}
                  className="w-full text-xs p-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Local Slang Dictionary</label>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                  {Object.keys(slangDict).length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No slang terms configured. Add one below!</p>
                  ) : (
                    Object.entries(slangDict).map(([term, definition]) => (
                      <div key={term} className="flex justify-between items-center border-b border-slate-200/60 pb-1.5 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700">&quot;{term}&quot;</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-slate-600">{definition}</span>
                        </div>
                        <button
                          onClick={() => {
                            const nextDict = { ...slangDict }
                            delete nextDict[term]
                            setSlangDict(nextDict)
                          }}
                          className="text-slate-400 hover:text-rose-500 transition-colors p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="text" placeholder='Slang term (e.g., Bojio)' id="mm-slang-term"
                    className="flex-1 text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                  <input type="text" placeholder="Meaning (e.g., Don't invite)" id="mm-slang-meaning"
                    className="flex-1 text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button
                    onClick={() => {
                      const termInput = document.getElementById('mm-slang-term') as HTMLInputElement
                      const meaningInput = document.getElementById('mm-slang-meaning') as HTMLInputElement
                      const term = termInput?.value?.trim()
                      const meaning = meaningInput?.value?.trim()
                      if (term && meaning) {
                        setSlangDict({ ...slangDict, [term]: meaning })
                        termInput.value = ''
                        meaningInput.value = ''
                      }
                    }}
                    className="px-2 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-indigo-tint transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={onSaveSettings}
              className="w-full bg-primary text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition-all mt-4 cursor-pointer"
            >
              Save AI Instructions
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
