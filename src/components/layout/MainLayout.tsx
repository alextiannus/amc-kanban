'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import Sidebar from './Sidebar'
import UserMenu from './UserMenu'
import { type Brand } from './BrandSwitcher'
import { resolveRoles, type BoardView } from '@/lib/permissions'

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
  const currentTheme = resolvedTheme || theme || 'light'
  const userRoles = resolveRoles(user)

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
      <div className="hidden lg:flex shrink-0">
        <Sidebar
          userRoles={userRoles}
          currentView={currentView}
          setCurrentView={setCurrentView}
          brands={brands}
          activeBrand={activeBrand}
          setActiveBrand={setActiveBrand}
        />
      </div>

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
            aria-label="打开菜单"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="4.5" x2="16" y2="4.5" />
              <line x1="2" y1="9" x2="16" y2="9" />
              <line x1="2" y1="13.5" x2="16" y2="13.5" />
            </svg>
          </button>

          {/* Page title on mobile */}
          <span className="lg:hidden text-sm font-bold text-slate-700 dark:text-slate-200 truncate mx-2" />

          {/* Spacer for desktop */}
          <div className="hidden lg:block flex-1" />

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="切换主题"
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

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
