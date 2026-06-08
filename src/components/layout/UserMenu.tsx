'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User as UserIcon, Copy, Check, Settings, Shield, Inbox, LogOut } from 'lucide-react'
import { buildAgentInitPrompt } from '@/lib/agentInitPrompt'

interface UserMenuProps {
  user: {
    id: string
    email: string
    role: string
    dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
    nickname?: string | null
    avatar?: string | null
  } | null
  currentView: string
  setCurrentView: (view: 'dashboard' | 'calendar' | 'agents' | 'archive' | 'game' | 'socialInsight' | 'drafts' | 'assets' | 'research') => void
  onShowSettings: () => void
  onShowSystemLog: () => void
  onNewAgentKeyGenerated: (key: string) => void
  onTasksCleared: () => void
}

export default function UserMenu({
  user,
  currentView,
  setCurrentView,
  onShowSettings,
  onShowSystemLog,
  onNewAgentKeyGenerated,
  onTasksCleared,
}: UserMenuProps) {
  const [showProfile, setShowProfile] = useState(false)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const dashboardRole = user?.dashboardRole || (user?.role === 'ADMIN' ? 'ADMIN' : user?.role === 'BRAND_OWNER' ? 'BRAND_OWNER' : 'BRAND_DIRECTOR')
  const isAdmin = dashboardRole === 'ADMIN'
  const isBrandDirector = dashboardRole === 'BRAND_DIRECTOR'
  void onShowSettings
  void onShowSystemLog
  void onNewAgentKeyGenerated
  void onTasksCleared

  useEffect(() => {
    if (!showProfile) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowProfile(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfile])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    } catch (e) {
      console.error('[UserMenu] logout error', e)
    }
  }

  const getCopyCommand = (apiKey: string | null = null) => {
    const hostFromEnv = process.env.NEXT_PUBLIC_KANBAN_HOST
    const hostFromWindow = typeof window !== 'undefined' ? window.location.origin : null
    const baseHost = hostFromEnv || hostFromWindow || 'https://amc-kanban.immedi.ai'
    return buildAgentInitPrompt({ apiKey, apiBaseUrl: `${baseHost}/api` })
  }

  const handleCopy = (key: string | null = null) => {
    navigator.clipboard.writeText(getCopyCommand(key))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenSettingsCenter = () => {
    setShowProfile(false)
    router.push('/profile')
  }

  const handleOpenAdmin = () => {
    setShowProfile(false)
    router.push('/admin')
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setShowProfile(!showProfile)}
        className="flex items-center justify-center w-11 h-11 md:w-10 md:h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:shadow-md hover:scale-105 transition-all duration-300 border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="User avatar" className="w-full h-full object-cover" />
        ) : user ? (
          (user.nickname || user.email).charAt(0).toUpperCase()
        ) : (
          <UserIcon size={18} />
        )}
      </button>

      {showProfile && (
        <div className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-64 sm:w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden transform transition-all z-50 max-h-[70vh] overflow-y-auto">
          <div className="p-4 border-b border-slate-100/50 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{user?.nickname || user?.email}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{user?.email}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{dashboardRole === 'ADMIN' ? 'Admin' : dashboardRole === 'BRAND_OWNER' ? 'Brand Owner（品牌主）' : 'Brand Director（品牌主理人）'}</p>
          </div>
          <div className="p-2 space-y-1">
            <button
              onClick={handleOpenSettingsCenter}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Settings size={16} /> 设置中心
            </button>

            {isAdmin && (
              <button
                onClick={handleOpenAdmin}
                className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <Shield size={16} /> Admin 控制台
              </button>
            )}

            {(isAdmin || isBrandDirector) && (
              <>
                <button
                  onClick={() => { setShowProfile(false); setCurrentView('archive') }}
                  className={`flex items-center gap-3 px-3 py-2 w-full text-left text-sm rounded-xl transition-colors ${
                    currentView === 'archive'
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Inbox size={16} /> 归档
                </button>
              </>
            )}

            <button
              onClick={() => { setShowProfile(false); handleCopy() }}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />} 复制 Skill 正文
            </button>

            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            >
              <LogOut size={16} /> 退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
