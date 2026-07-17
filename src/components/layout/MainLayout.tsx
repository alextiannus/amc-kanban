'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, GraduationCap, Languages } from 'lucide-react'
import Sidebar from './Sidebar'
import UserMenu from './UserMenu'
import { type Brand } from './BrandSwitcher'
import { resolveRoles, type BoardView } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

interface MainLayoutProps {
  children: React.ReactNode
  currentView: BoardView
  setCurrentView: (view: BoardView) => void
  brands: Brand[]
  activeBrand: Brand | null
  setActiveBrand: (brand: Brand) => void
  user: {
    id: string
    email: string
    role: string
    dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
    userRoles?: string[]
    nickname?: string | null
    avatar?: string | null
  } | null
  onShowSettings: () => void
  onShowSystemLog: () => void
  onNewAgentKeyGenerated: (key: string) => void
  onTasksCleared: () => void
}

const VIEW_LABEL_MAP: Record<BoardView, { zh: string; en: string }> = {
  dashboard: { zh: '品牌故事', en: 'Brand Story' },
  calendar: { zh: '发布日历', en: 'Publishing Calendar' },
  drafts: { zh: '发布内容', en: 'Post Drafts' },
  assets: { zh: '素材库', en: 'Asset Library' },
  game: { zh: '店内活动', en: 'In-store Campaigns' },
  socialInsight: { zh: '数据分析', en: 'Growth Analytics' },
  dataAnalysis: { zh: '账号快照', en: 'Account Snapshot' },
  agents: { zh: '历史 AI 序列', en: 'AI Workflow History' },
  logs: { zh: '工作日志', en: 'Work Logs' },
  managementOverview: { zh: '主理人总览', en: 'Principal Overview' },
}

export default function MainLayout({
  children,
  currentView,
  setCurrentView,
  brands,
  activeBrand,
  setActiveBrand,
  user,
  onShowSettings,
  onShowSystemLog,
  onNewAgentKeyGenerated,
  onTasksCleared,
}: MainLayoutProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { language, setLanguage, t } = useI18n()
  const currentTheme = resolvedTheme || theme || 'light'
  const userRoles = resolveRoles(user)
  const viewLabel = VIEW_LABEL_MAP[currentView]

  // Mobile: sidebar drawer state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Close drawer on outside click
  useEffect(() => {
    if (!mobileSidebarOpen) return
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMobileSidebarOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mobileSidebarOpen])

  // Suppress unused prop warnings (kept for API compatibility)
  void onShowSettings; void onShowSystemLog; void onNewAgentKeyGenerated; void onTasksCleared

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">

      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <Sidebar
        userRoles={userRoles}
        currentView={currentView}
        setCurrentView={setCurrentView}
        brands={brands}
        activeBrand={activeBrand}
        setActiveBrand={setActiveBrand}
        className="hidden lg:flex"
      />

      {/* ── Mobile: Drawer backdrop ─────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" />
      )}

      {/* ── Mobile: Drawer ──────────────────────────────────────────── */}
      <div
        ref={drawerRef}
        className={`
          fixed inset-y-0 left-0 z-50 lg:hidden
          transition-transform duration-300 ease-in-out
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar
          userRoles={userRoles}
          currentView={currentView}
          setCurrentView={(v) => { setCurrentView(v); setMobileSidebarOpen(false) }}
          brands={brands}
          activeBrand={activeBrand}
          setActiveBrand={setActiveBrand}
        />
      </div>

      {/* ── Main Content Area ────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">

        {/* Topbar (thin strip: hamburger + theme + user) */}
        <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={t('打开菜单', 'Open menu')}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="4.5" x2="16" y2="4.5" />
              <line x1="2" y1="9" x2="16" y2="9" />
              <line x1="2" y1="13.5" x2="16" y2="13.5" />
            </svg>
          </button>

          {/* Page title on desktop & mobile */}
          <span className="text-sm lg:text-base font-extrabold text-slate-800 dark:text-slate-100 truncate mx-2 lg:mx-4">
            {viewLabel ? t(viewLabel.zh, viewLabel.en) : 'AI Marketing Crew'}
          </span>

          {/* Spacer to push controls to the right */}
          <div className="flex-1" />

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <a
              href="/learn"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 h-9 rounded-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-indigo-650 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
              title={t('AMC 学院', 'AMC Academy')}
            >
              <GraduationCap size={16} className="text-indigo-500" />
              <span>{t('AMC 学院', 'AMC Academy')}</span>
            </a>

            <button
              onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
              className="px-3 h-9 rounded-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-blue-650 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-bold text-xs shrink-0"
              aria-label={t('切换语言', 'Switch language')}
              title={t('切换语言', 'Switch language')}
            >
              <Languages size={16} />
              <span>{language === 'en' ? '中文' : 'EN'}</span>
            </button>

            <button
              onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={t('切换主题', 'Toggle theme')}
            >
              {currentTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <UserMenu
              user={user}
              currentView={currentView}
              setCurrentView={setCurrentView}
              onShowSettings={onShowSettings}
              onShowSystemLog={onShowSystemLog}
              onNewAgentKeyGenerated={onNewAgentKeyGenerated}
              onTasksCleared={onTasksCleared}
            />
          </div>
        </header>

        {/* Scrollable content (non-scrolling wrapper so children can scroll themselves) */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  )
}
