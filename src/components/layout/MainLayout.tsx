'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Store, Calendar, Sun, Moon, Gift, Activity, Bot, LayoutDashboard, FileText, Images } from 'lucide-react'
import BrandSwitcher, { Brand } from './BrandSwitcher'
import UserMenu from './UserMenu'

interface MainLayoutProps {
  children: React.ReactNode
  currentView: 'dashboard' | 'calendar' | 'agents' | 'archive' | 'game' | 'socialInsight' | 'drafts' | 'assets' | 'dataAnalysis'
  setCurrentView: (view: 'dashboard' | 'calendar' | 'agents' | 'archive' | 'game' | 'socialInsight' | 'drafts' | 'assets' | 'dataAnalysis') => void
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
  const router = useRouter()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [principalOpening, setPrincipalOpening] = useState(false)

  useEffect(() => {
    router.prefetch('/profile/principal')
  }, [router])

  const userRoles = user?.userRoles || (user?.role === 'ADMIN' ? ['ADMIN'] : user?.dashboardRole === 'BRAND_OWNER' ? ['BRAND_OWNER'] : user?.dashboardRole === 'BRAND_DIRECTOR' ? ['AMC_PRINCIPAL'] : [])
  const canSeeSocialInsight = userRoles.includes('ADMIN') || userRoles.includes('AMC_PRINCIPAL')
  const canSeeAgentsWorkflow = userRoles.includes('BRAND_OWNER')
  const canSeePrincipalDashboard = userRoles.includes('ADMIN') || userRoles.includes('AMC_PRINCIPAL')
  const currentTheme = resolvedTheme || theme || 'light'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex flex-col font-sans transition-colors duration-300">
      <div className="relative flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        
        {/* Left Section: Brand Switcher (Stitch-inspired UX) */}
        <div className="flex items-center gap-3 shrink-0">
          {brands.length > 0 && activeBrand && (
            <BrandSwitcher brands={brands} activeBrand={activeBrand} setActiveBrand={setActiveBrand} />
          )}
        </div>

        {/* Top Navigation Menu */}
        <div className="hidden lg:flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mx-auto overflow-x-auto max-w-full">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
              currentView === 'dashboard'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
          >
            <Store size={16} /> 品牌主看板
          </button>
          <button
            onClick={() => setCurrentView('calendar')}
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
              currentView === 'calendar'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
            id="nav-calendar"
          >
            <Calendar size={16} /> 发布日历
          </button>
          <button
            onClick={() => setCurrentView('drafts')}
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
              currentView === 'drafts'
                ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
            id="nav-drafts"
          >
            <FileText size={16} /> 发布内容（Post）
          </button>
          <button
            onClick={() => setCurrentView('assets')}
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
              currentView === 'assets'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
            id="nav-assets"
          >
            <Images size={16} /> 素材库
          </button>
          {canSeeSocialInsight && (
            <>
              <button
                onClick={() => setCurrentView('socialInsight')}
                className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
                  currentView === 'socialInsight'
                    ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
                id="nav-social-insight"
              >
                <Activity size={16} /> 数据分析
              </button>
              <button
                onClick={() => setCurrentView('dataAnalysis')}
                className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
                  currentView === 'dataAnalysis'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
                id="nav-data-analysis"
              >
                <Store size={16} /> 账号展现
              </button>
            </>
          )}
          <button
            onClick={() => setCurrentView('game')}
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
              currentView === 'game'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
            id="nav-game-settings"
          >
            <Gift size={16} /> 店内活动
          </button>
          {canSeeAgentsWorkflow && (
            <button
              onClick={() => setCurrentView('agents')}
              className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
                currentView === 'agents'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
              id="nav-agents"
            >
              <Bot size={16} /> AI 序列
            </button>
          )}
          {canSeePrincipalDashboard && (
            <button
              onClick={() => { setPrincipalOpening(true); router.push('/profile/principal') }}
              disabled={principalOpening}
              className="flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 disabled:opacity-70"
              id="nav-principal-dashboard"
            >
              <LayoutDashboard size={16} /> {principalOpening ? '打开中...' : '主理人看板'}
            </button>
          )}
        </div>

        {/* Spacer to align center menu */}
        <div className="flex-1 hidden lg:block" />

        {/* Toolbar controls (Theme & User menu) */}
        <div className="absolute right-4 top-8 z-40 flex items-center gap-2 lg:static lg:right-auto lg:top-auto">
          <button
            onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          >
            {currentTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
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
      </div>

      {/* View Contents */}
      <div className="flex-1 pb-20 lg:pb-0">
        {children}
      </div>

      {/* Sticky Bottom Navigation Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-around shadow-[0_-4px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.2)]">
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-extrabold transition-colors duration-300 ${
            currentView === 'dashboard'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-305'
          }`}
        >
          <Store size={18} />
          <span>看板</span>
        </button>
        <button
          onClick={() => setCurrentView('calendar')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-extrabold transition-colors duration-300 ${
            currentView === 'calendar'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-305'
          }`}
        >
          <Calendar size={18} />
          <span>日历</span>
        </button>
        <button
          onClick={() => setCurrentView('drafts')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-extrabold transition-colors duration-300 ${
            currentView === 'drafts'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-305'
          }`}
        >
          <FileText size={18} />
          <span>发布内容</span>
        </button>
        <button
          onClick={() => setCurrentView('assets')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-extrabold transition-colors duration-300 ${
            currentView === 'assets'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-305'
          }`}
        >
          <Images size={18} />
          <span>素材</span>
        </button>
        <button
          onClick={() => setCurrentView('game')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-extrabold transition-colors duration-300 ${
            currentView === 'game'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-305'
          }`}
        >
          <Gift size={18} />
          <span>活动</span>
        </button>
      </div>
    </div>
  )
}
