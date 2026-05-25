'use client'

import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Store, Calendar, BarChart2, Sun, Moon, Gift, Activity } from 'lucide-react'
import BrandSwitcher, { Brand } from './BrandSwitcher'
import UserMenu from './UserMenu'

interface MainLayoutProps {
  children: React.ReactNode
  currentView: 'dashboard' | 'calendar' | 'analytics' | 'agents' | 'archive' | 'game' | 'socialInsight'
  setCurrentView: (view: 'dashboard' | 'calendar' | 'analytics' | 'agents' | 'archive' | 'game' | 'socialInsight') => void
  brands: Brand[]
  activeBrand: Brand | null
  setActiveBrand: (brand: Brand) => void
  user: { id: string; email: string; role: string; nickname?: string | null; avatar?: string | null } | null
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
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex flex-col font-sans transition-colors duration-300">
      <div className="relative flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <img
            src="/logo.svg"
            alt="AMC logo"
            className="h-16 md:h-20 w-auto"
          />
        </div>

        {/* Top Navigation Menu */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mx-auto overflow-x-auto max-w-full">
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
            onClick={() => setCurrentView('analytics')}
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
              currentView === 'analytics'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
            id="nav-brand-analytics"
          >
            <BarChart2 size={16} /> 品牌分析
          </button>
          {user?.role === 'ADMIN' && (
            <button
              onClick={() => setCurrentView('socialInsight')}
              className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 whitespace-nowrap ${
                currentView === 'socialInsight'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
              id="nav-social-insight"
            >
              <Activity size={16} /> 社媒透视
            </button>
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
        </div>

        {/* Brand Switcher */}
        <div className="flex-1 flex justify-end w-full lg:w-auto items-center gap-2">
          {brands.length > 0 && (
            <BrandSwitcher brands={brands} activeBrand={activeBrand} setActiveBrand={setActiveBrand} />
          )}
        </div>

        {/* Toolbar controls (Theme & User menu) */}
        <div className="absolute right-4 top-8 z-40 flex items-center gap-2 lg:static lg:right-auto lg:top-auto">
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}

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
      {children}
    </div>
  )
}
