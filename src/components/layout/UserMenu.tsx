'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User as UserIcon, Settings, LogOut } from 'lucide-react'
import { resolveRoles, type BoardView } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

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
  currentView: BoardView
  setCurrentView: (view: BoardView) => void
  onShowSettings: () => void
  onShowSystemLog: () => void
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN:         'Admin',
  BRAND_OWNER:   'Brand Owner',
  AMC_PRINCIPAL: 'Principal',
  BD:            'Business Development',
  AMC_AGENT:     'AMC Agent',
}

export default function UserMenu({
  user,
  // keep unused props in signature for API compatibility:
  setCurrentView: _setCurrentView,
  onShowSettings: _onShowSettings,
  onShowSystemLog: _onShowSystemLog,
}: UserMenuProps) {
  const { t, isEn } = useI18n()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const roles = resolveRoles(user)
  const displayName = (user?.nickname?.trim() || user?.email || '').trim()
  const roleLabel = roles.length > 0
    ? roles.map(r => isEn ? (ROLE_LABELS[r] || r) : (
      r === 'BRAND_OWNER' ? '品牌主' :
      r === 'AMC_PRINCIPAL' ? '主理人' :
      r === 'BD' ? '商务拓展' :
      ROLE_LABELS[r] || r
    )).join(' / ')
    : t('用户', 'User')

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    } catch (e) {
      console.error('[UserMenu] logout error', e)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={displayName ? `Hi, ${displayName}` : t('用户菜单', 'User menu')}
        className="flex h-9 items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 pl-1 pr-3 text-slate-700 dark:text-slate-200 font-bold hover:shadow-md hover:scale-[1.02] transition-all duration-200 border border-slate-200 dark:border-slate-700"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-slate-900 text-xs">
          {user?.avatar ? (
            <img src={user.avatar} alt={t('头像', 'Avatar')} className="w-full h-full object-cover" />
          ) : user ? (
            (displayName || user.email).charAt(0).toUpperCase()
          ) : (
            <UserIcon size={15} />
          )}
        </span>
        {displayName && (
          <span className="hidden sm:inline text-sm leading-none whitespace-nowrap">
            Hi, {displayName}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {user?.nickname || user?.email}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{user?.email}</p>
            <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              {roleLabel}
            </span>
          </div>

          <div className="p-2 space-y-0.5">
            <button
              onClick={() => { setOpen(false); router.push('/profile') }}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Settings size={15} /> {t('设置中心', 'Settings')}
            </button>

            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            >
              <LogOut size={15} /> {t('退出登录', 'Log out')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
