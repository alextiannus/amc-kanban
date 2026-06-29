'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Calendar, FileText, Images, Gift,
  BarChart2, Camera, Activity,
  Users, Inbox,
  Bot,
  Briefcase, TrendingUp,
  Shield,
  ChevronLeft, ChevronRight,
  Lock,
} from 'lucide-react'
import { type BoardView, type MenuGroupDef, type AppRole, getMenuGroups } from '@/lib/permissions'
import BrandSwitcher, { type Brand } from './BrandSwitcher'

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Calendar, FileText, Images, Gift,
  BarChart2, Camera, Activity,
  Users, Inbox,
  Bot,
  Briefcase, TrendingUp,
  Shield,
}

function NavIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon size={size} />
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SidebarProps {
  userRoles: AppRole[]
  currentView: BoardView
  setCurrentView: (view: BoardView) => void
  brands: Brand[]
  activeBrand: Brand | null
  setActiveBrand: (brand: Brand) => void
}

const COLLAPSED_KEY = 'amc.sidebar.collapsed'

export default function Sidebar({
  userRoles,
  currentView,
  setCurrentView,
  brands,
  activeBrand,
  setActiveBrand,
}: SidebarProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // Persist collapsed state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY)
      if (saved === 'true') setCollapsed(true)
    } catch {/* ignore */}
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch {/* ignore */}
      return next
    })
  }

  const menuGroups: MenuGroupDef[] = getMenuGroups(userRoles)

  const handleItemClick = (item: { view: BoardView; comingSoon?: boolean; href?: string }) => {
    if (item.comingSoon) return
    if (item.href) {
      router.push(item.href)
      return
    }
    setCurrentView(item.view)
  }

  return (
    <aside
      className={`
        relative flex flex-col shrink-0 h-screen
        bg-white dark:bg-slate-900
        border-r border-slate-100 dark:border-slate-800
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-56'}
        overflow-hidden
      `}
    >
      {/* ── Logo / Header ───────────────────────────────────────────── */}
      <div className={`flex items-center gap-3 px-3 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-black text-white tracking-tight">AMC</span>
        </div>
        {!collapsed && (
          <span className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight whitespace-nowrap">
            AI Marketing Crew
          </span>
        )}
      </div>

      {/* ── Brand Switcher ───────────────────────────────────────────── */}
      {brands.length > 0 && activeBrand && !collapsed && (
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <BrandSwitcher brands={brands} activeBrand={activeBrand} setActiveBrand={setActiveBrand} />
        </div>
      )}
      {brands.length > 0 && activeBrand && collapsed && (
        <div className="px-2 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0 flex justify-center">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center" title={activeBrand.name}>
            <span className="text-[10px] font-black text-white">
              {activeBrand.name.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* ── Menu Groups ─────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
        {menuGroups.map((group, gi) => (
          <div key={gi} className="mb-1">
            {/* Group label */}
            {group.groupLabel && !collapsed && (
              <p className="px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 select-none">
                {group.groupLabel}
              </p>
            )}
            {group.groupLabel && collapsed && (
              <div className="mx-3 my-2 h-px bg-slate-100 dark:bg-slate-800" />
            )}

            {group.items.map(item => {
              const isActive = !item.comingSoon && !item.href && currentView === item.view
              return (
                <div key={item.id} className="relative group/item px-2">
                  <button
                    onClick={() => handleItemClick(item)}
                    disabled={!!item.comingSoon}
                    title={collapsed ? item.label : undefined}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold
                      transition-all duration-150 text-left
                      ${item.comingSoon
                        ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                        : isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-r-full" />
                    )}

                    <span className="shrink-0">
                      <NavIcon name={item.icon} size={16} />
                    </span>

                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}

                    {/* Coming soon lock */}
                    {item.comingSoon && !collapsed && (
                      <Lock size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>

                  {/* Tooltip for collapsed mode */}
                  {collapsed && (
                    <div className="
                      absolute left-full top-1/2 -translate-y-1/2 ml-3
                      bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold
                      px-2.5 py-1.5 rounded-lg whitespace-nowrap
                      opacity-0 group-hover/item:opacity-100
                      pointer-events-none transition-opacity duration-150
                      z-50 shadow-lg
                    ">
                      {item.label}
                      {item.comingSoon && ' (即将上线)'}
                      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800 dark:border-r-slate-700" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Collapse Toggle ──────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-2">
        <button
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-semibold"
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          {!collapsed && <span>收起</span>}
        </button>
      </div>
    </aside>
  )
}
