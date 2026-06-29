'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Calendar, FileText, Images, Gift,
  BarChart2, Camera, Activity,
  Users, Inbox,
  Bot, Shield,
  Briefcase, TrendingUp,
  ChevronLeft, ChevronRight, ChevronDown,
  Lock, Plus,
  BookOpen,
} from 'lucide-react'
import { type BoardView, type MenuGroupDef, type AppRole, getMenuGroups } from '@/lib/permissions'
import { type Brand } from './BrandSwitcher'
import NewBrandWizard from '@/components/brands/NewBrandWizard'

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Calendar, FileText, Images, Gift,
  BarChart2, Camera, Activity,
  Users, Inbox,
  Bot, Shield,
  Briefcase, TrendingUp,
  BookOpen,
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
  className?: string
}

const COLLAPSED_KEY = 'amc.sidebar.collapsed'

// ─── Inline brand switcher (inside the brand section header) ──────────────────
function InlineBrandSwitcher({
  brands,
  activeBrand,
  setActiveBrand,
  collapsed,
}: {
  brands: Brand[]
  activeBrand: Brand | null
  setActiveBrand: (b: Brand) => void
  collapsed: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (brands.length === 0) return null

  const initial = (activeBrand?.name ?? '?').charAt(0).toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title={collapsed ? (activeBrand?.name ?? '选择品牌') : undefined}
        className={`
          w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150
          ${open
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
          }
          ${collapsed ? 'justify-center' : ''}
        `}
      >
        {/* Brand avatar */}
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-black text-white">{initial}</span>
        </div>

        {!collapsed && (
          <>
            <span className="flex-1 text-sm font-bold truncate text-left">
              {activeBrand?.name ?? '选择品牌'}
            </span>
            <ChevronDown
              size={13}
              className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180 text-blue-500' : ''}`}
            />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`
          absolute z-50 mt-1 bg-white dark:bg-slate-900 rounded-2xl shadow-xl
          border border-slate-100 dark:border-slate-800 overflow-hidden
          animate-in fade-in slide-in-from-top-2 duration-150
          ${collapsed ? 'left-full ml-2 top-0 w-52' : 'left-0 right-0 w-full'}
        `}>
          <div className="px-3 py-2 border-b border-slate-50 dark:border-slate-800">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">切换品牌</p>
          </div>
          <div className="p-1.5 space-y-0.5 max-h-52 overflow-y-auto">
            {brands.map(b => (
              <button
                key={b.id}
                onClick={() => { setActiveBrand(b); setOpen(false) }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left transition-colors text-sm ${
                  activeBrand?.id === b.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-white">{b.name.charAt(0).toUpperCase()}</span>
                </div>
                <span className="flex-1 truncate">{b.name}</span>
                {activeBrand?.id === b.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
          <div className="px-1.5 pb-1.5 pt-0.5 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => { setOpen(false); router.push('/board/subscription') }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
                <Plus size={12} className="text-blue-500" />
              </div>
              <span className="text-sm font-bold">添加新品牌</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar({
  userRoles,
  currentView,
  setCurrentView,
  brands,
  activeBrand,
  setActiveBrand,
  className = '',
}: SidebarProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY)
      if (saved === 'true') setCollapsed(true)
    } catch {/* ignore */}
  }, [])

  useEffect(() => {
    // If the page has a secondary menu (currently 'calendar' is the main page with a secondary menu),
    // wait 3 seconds and automatically collapse the main menu.
    const viewsWithSubMenu: BoardView[] = ['calendar']
    if (viewsWithSubMenu.includes(currentView) && !collapsed) {
      const timer = setTimeout(() => {
        setCollapsed(true)
        try { localStorage.setItem(COLLAPSED_KEY, 'true') } catch {/* ignore */}
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [currentView, collapsed])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch {/* ignore */}
      return next
    })
  }

  const menuGroups: MenuGroupDef[] = getMenuGroups(userRoles)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardSuccess, setWizardSuccess] = useState<{ brandName: string } | null>(null)

  const canCreateBrand = userRoles.includes('ADMIN') || userRoles.includes('AMC_PRINCIPAL') || userRoles.includes('BD')

  function handleWizardSuccess(brandId: string, brandName: string) {
    setWizardOpen(false)
    setWizardSuccess({ brandName })
    setTimeout(() => setWizardSuccess(null), 4000)
    // Refresh page to show new brand in switcher
    router.refresh()
  }

  const handleItemClick = (item: { view: BoardView; comingSoon?: boolean; href?: string }) => {
    if (item.comingSoon) return
    if (item.href) { router.push(item.href); return }
    setCurrentView(item.view)
  }

  return (
    <>
    <aside className={`
      relative flex flex-col shrink-0 h-screen
      bg-white dark:bg-slate-900
      border-r border-slate-100 dark:border-slate-800
      transition-all duration-300 ease-in-out
      ${collapsed ? 'w-16' : 'w-56'}
      overflow-hidden
      ${className}
    `}>

      {/* ── Logo ──────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-2.5 px-4 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <img
          src="/logo.svg"
          alt="AMC Logo"
          className="w-8 h-8 object-contain"
        />
        {!collapsed && (
          <span className="text-sm font-black text-slate-850 dark:text-slate-100 tracking-tight whitespace-nowrap">
            AI Marketing Crew
          </span>
        )}
      </div>

      {/* ── Menu Groups ───────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-100 dark:scrollbar-thumb-slate-800">
        {menuGroups.map((group, gi) => (
          <div key={gi}>
            {/* ── Group separator (not the first group) */}
            {gi > 0 && (
              <div className="mx-3 my-2 h-px bg-slate-100 dark:bg-slate-800" />
            )}

            {/* ── Group label or Brand-section header ─────────────── */}
            {group.isBrandSection ? (
              /* Brand section: label above + switcher below */
              <div>
                {!collapsed && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 select-none">
                    {group.groupLabel}
                  </p>
                )}
                <div className="px-2 pb-1">
                  <InlineBrandSwitcher
                    brands={brands}
                    activeBrand={activeBrand}
                    setActiveBrand={setActiveBrand}
                    collapsed={collapsed}
                  />
                </div>
              </div>
            ) : group.groupLabel ? (
              !collapsed ? (
                <p className="px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 select-none">
                  {group.groupLabel}
                  {group.isComingSoon && (
                    <span className="ml-1.5 text-[9px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded px-1 py-px">即将上线</span>
                  )}
                </p>
              ) : null
            ) : null}

            {/* ── Menu items ──────────────────────────────────────── */}
            {group.items.map(item => {
              const isActive = !item.comingSoon && !item.href && currentView === item.view
              return (
                <div key={item.id} className="relative group/item px-2">
                  <button
                    onClick={() => handleItemClick(item)}
                    disabled={!!item.comingSoon}
                    title={collapsed ? item.label : undefined}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium
                      transition-all duration-150 text-left
                      ${item.comingSoon
                        ? 'opacity-35 cursor-not-allowed text-slate-400 dark:text-slate-600'
                        : isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r-full" />
                    )}

                    <span className="shrink-0">
                      <NavIcon name={item.icon} size={16} />
                    </span>

                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}

                    {item.comingSoon && !collapsed && (
                      <Lock size={11} className="shrink-0 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>

                  {/* Tooltip for collapsed mode */}
                  {collapsed && (
                    <div className="
                      absolute left-full top-1/2 -translate-y-1/2 ml-3
                      bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold
                      px-2.5 py-1.5 rounded-lg whitespace-nowrap
                      opacity-0 group-hover/item:opacity-100
                      pointer-events-none transition-opacity duration-150 z-50 shadow-lg
                    ">
                      {item.label}{item.comingSoon ? ' (即将上线)' : ''}
                      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800 dark:border-r-slate-700" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── New Brand Button (for Principal / BD / Admin) ──────────── */}
      {canCreateBrand && (
        <div className="shrink-0 px-2 pb-1">
          <button
            id="sidebar-new-brand"
            onClick={() => setWizardOpen(true)}
            title={collapsed ? '新建品牌' : undefined}
            className={`
              w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors
              bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40
              text-indigo-700 dark:text-indigo-300 text-xs font-semibold
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <Plus size={14} className="shrink-0" />
            {!collapsed && <span>新建品牌</span>}
          </button>
        </div>
      )}

      {/* ── Success toast ─────────────────────────────────────────── */}
      {wizardSuccess && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap bg-green-600 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg">
          ✅ {wizardSuccess.brandName} 已创建
        </div>
      )}

      {/* ── Collapse toggle ───────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-2">
        <button
          onClick={toggleCollapsed}
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-semibold"
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>收起</span></>}
        </button>
      </div>
    </aside>

    {/* ── New Brand Wizard Modal ─────────────────────────────────── */}
    {wizardOpen && (
      <NewBrandWizard
        onClose={() => setWizardOpen(false)}
        onSuccess={handleWizardSuccess}
      />
    )}
    </>
  )
}
