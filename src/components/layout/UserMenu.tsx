'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User as UserIcon, Users, Trash2, Key, Copy, Check, Settings, Link2, Bot, Inbox, LogOut } from 'lucide-react'
import { buildAgentInitPrompt } from '@/lib/agentInitPrompt'

interface UserMenuProps {
  user: { id: string; email: string; role: string; nickname?: string | null; avatar?: string | null } | null
  currentView: string
  setCurrentView: (view: 'dashboard' | 'calendar' | 'analytics' | 'agents' | 'archive') => void
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
  const [generatingKey, setGeneratingKey] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

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

  const generateAgentKey = async () => {
    setGeneratingKey(true)
    try {
      const res = await fetch('/api/agents/keys', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        onNewAgentKeyGenerated(data.apiKey)
      } else {
        alert(data.error || 'Failed to generate key')
      }
    } catch (e) {
      alert('Error generating key')
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleClearUnassignedTasks = async () => {
    if (confirm('确定要清理所有无主任务吗？这些通常是已被遣散龙虾遗留的测试任务，清理操作不可逆。')) {
      try {
        const res = await fetch('/api/tasks/unassigned', { method: 'DELETE' })
        if (res.ok) {
          const data = await res.json()
          alert(`清理成功：删除了 ${data.deletedCount} 个无主任务`)
          onTasksCleared()
        } else {
          alert('清理失败，请确保您是管理员')
        }
      } catch (error) {
        alert('网络错误，请重试')
      }
    }
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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user?.role}</p>
          </div>
          <div className="p-2 space-y-1">
            {/* Admin & user roles both get operations */}
            {(user?.role === 'ADMIN' || user?.role === 'USER') && (
              <>
                {user?.role === 'ADMIN' && (
                  <button
                    onClick={() => { setShowProfile(false); router.push('/admin') }}
                    className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <Users size={16} /> 用户管理
                  </button>
                )}
                <button
                  onClick={async () => {
                    setShowProfile(false)
                    await handleClearUnassignedTasks()
                  }}
                  className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors"
                >
                  <Trash2 size={16} /> 清理无主任务
                </button>
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                <button
                  onClick={async () => { setShowProfile(false); await generateAgentKey() }}
                  disabled={generatingKey}
                  className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Key size={16} /> {generatingKey ? '生成中...' : '生成新 Agent 密钥'}
                </button>
                {user?.role === 'ADMIN' && (
                  <button
                    onClick={() => { setShowProfile(false); onShowSystemLog() }}
                    className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> 系统日志
                  </button>
                )}
                <button
                  onClick={() => { setShowProfile(false); handleCopy() }}
                  className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />} 复制初始化 Skill
                </button>
              </>
            )}
            <button 
              onClick={() => { setShowProfile(false); onShowSettings() }}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Settings size={16} /> 个人设置
            </button>
            <button 
              onClick={() => { setShowProfile(false); router.push('/profile') }}
              className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Link2 size={16} /> 平台链接配置
            </button>
            <button
              onClick={() => { setShowProfile(false); setCurrentView('agents') }}
              className={`flex items-center gap-3 px-3 py-2 w-full text-left text-sm rounded-xl transition-colors ${
                currentView === 'agents'
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Bot size={16} /> AI 序列
            </button>
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
