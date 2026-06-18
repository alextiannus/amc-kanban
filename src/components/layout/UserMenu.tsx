'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User as UserIcon, BookOpen, Settings, Shield, Inbox, LogOut, GraduationCap } from 'lucide-react'

interface UserMenuProps {
  user: {
    id: string
    email: string
    role: string
    dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
    userRoles?: string[]
    nickname?: string | null
    avatar?: string | null
  } | null
  currentView: string
  setCurrentView: (view: 'dashboard' | 'calendar' | 'agents' | 'archive' | 'game' | 'socialInsight' | 'drafts' | 'assets') => void
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
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const userRoles = user?.userRoles || (user?.role === 'ADMIN' ? ['ADMIN'] : user?.dashboardRole === 'BRAND_OWNER' ? ['BRAND_OWNER'] : user?.dashboardRole === 'BRAND_DIRECTOR' ? ['AMC_PRINCIPAL'] : [])
  const isAdmin = userRoles.includes('ADMIN')
  const isPrincipal = userRoles.includes('AMC_PRINCIPAL')
  const roleLabel = userRoles.length > 0
    ? userRoles.map((roleName) => ({ ADMIN: 'Admin', BRAND_OWNER: 'Brand Owner', AMC_PRINCIPAL: 'AMC Principal', AMC_AGENT: 'AMC Agent' }[roleName] || roleName)).join(' / ')
    : 'Standard User'
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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{roleLabel}</p>
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

            {(isAdmin || isPrincipal) && (
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
              onClick={() => { setShowProfile(false); router.push('/learn') }}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors"
            >
              <GraduationCap size={16} /> AMC 学习中心
            </button>

            <button
              onClick={() => { setShowProfile(false); router.push('/connect') }}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
            >
              <BookOpen size={16} /> 查看MCP和Skills
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
