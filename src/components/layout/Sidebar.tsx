'use client'

import React, { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Calendar, FileText, Images, Gift,
  BarChart2, Camera, Activity,
  Users, Inbox,
  Bot, Shield,
  Briefcase, TrendingUp,
  Sparkles,
  ChevronLeft, ChevronRight, ChevronDown,
  Lock, Plus,
  BookOpen,
  Video,
  Lightbulb,
} from 'lucide-react'
import { type BoardView, type MenuGroupDef, type AppRole, getMenuGroups } from '@/lib/permissions'
import { type Brand } from './BrandSwitcher'
import NewBrandWizard from '@/components/brands/NewBrandWizard'
import { useI18n } from '@/lib/i18n'

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Calendar, FileText, Images, Gift,
  BarChart2, Camera, Activity,
  Users, Inbox,
  Bot, Shield,
  Briefcase, TrendingUp, Sparkles,
  BookOpen,
  Video,
  Lightbulb,
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
const EXTERNAL_WORKSPACE_ITEM_IDS = new Set([
  'inspiration-library',
  'video-production',
  'viral-copy-scripts',
  'amc-content-roles',
  'amc-growth',
  'brand-inspirations',
  'promotion-plans',
])

const MENU_TRANSLATIONS: Record<string, string> = {
  '主理人': 'Principal',
  '内容中心': 'Content Center',
  '知识增长中心': 'Knowledge Growth Center',
  '品牌主': 'Brand Owner',
  'BD 商务': 'BD',
  'Researcher': 'Researcher',
  '即将上线': 'Coming Soon',
  '主理人总览': 'Principal Overview',
  '账号快照': 'Account Snapshot',
  '知识库': 'Knowledge Base',
  '品牌灵感': 'Brand Inspiration',
  '推广计划': 'Promotion Plans',
  '素材执行': 'Material Execution',
  'AI 角色库': 'AI Role Library',
  '爆品素材库': 'Viral Inspiration Library',
  '视频生产': 'Video Production',
  '爆品脚本': 'Viral Copy Scripts',
  '品牌故事': 'Brand Story',
  '发布日历': 'Publishing Calendar',
  '发布内容': 'Post Drafts',
  '素材库': 'Asset Library',
  '店内活动': 'In-store Campaigns',
  '数据分析': 'Growth Analytics',
  'BD 工作台': 'BD Workspace',
  '客户汇总': 'Client Summary',
  '收入总览': 'Revenue Overview',
  '用户管理': 'User Management',
  '工作日志': 'Work Logs',
  'Admin 控制台': 'Admin Console',
  '选择品牌': 'Select Brand',
  '切换品牌': 'Switch Brand',
  '添加新品牌': 'Add New Brand',
  '展开侧边栏': 'Expand Sidebar',
  '折叠侧边栏': 'Collapse Sidebar',
  '收起': 'Collapse',
  '已创建': 'created',
}

function translatedLabel(label: string | null | undefined, isEn: boolean) {
  if (!label) return label
  return isEn ? (MENU_TRANSLATIONS[label] || label) : label
}

// ─── Inline brand switcher (inside the brand section header) ──────────────────
function InlineBrandSwitcher({
  brands,
  activeBrand,
  setActiveBrand,
  collapsed,
  onAddNewBrand,
  onExpand,
}: {
  brands: Brand[]
  activeBrand: Brand | null
  setActiveBrand: (b: Brand) => void
  collapsed: boolean
  onAddNewBrand: () => void
  onExpand?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { isEn } = useI18n()

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
        onClick={() => {
          setOpen(v => !v)
          if (collapsed && onExpand) {
            onExpand()
          }
        }}
        title={collapsed ? (activeBrand?.name ?? translatedLabel('选择品牌', isEn) ?? undefined) : undefined}
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
              {activeBrand?.name ?? translatedLabel('选择品牌', isEn)}
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{translatedLabel('切换品牌', isEn)}</p>
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
              onClick={() => { setOpen(false); onAddNewBrand() }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
                <Plus size={12} className="text-blue-500" />
              </div>
              <span className="text-sm font-bold">{translatedLabel('添加新品牌', isEn)}</span>
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
  const pathname = usePathname()
  const { isEn } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [autoCollapseEnabled, setAutoCollapseEnabled] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY)
      if (saved === 'true') setCollapsed(true)
      if (saved === 'false') setAutoCollapseEnabled(false)
    } catch {/* ignore */}
  }, [])

  useEffect(() => {
    // If the page has a secondary menu (currently 'calendar' is the main page with a secondary menu),
    // wait 3 seconds and automatically collapse the main menu.
    // If the user is hovering over/interacting with the sidebar, do not auto-collapse.
    const viewsWithSubMenu: BoardView[] = [
      'calendar', 'dashboard', 'drafts', 'assets', 
      'game', 'socialInsight', 'dataAnalysis',
      'logs', 'managementOverview'
    ]
    if (autoCollapseEnabled && viewsWithSubMenu.includes(currentView) && !collapsed && !isHovered) {
      const timer = setTimeout(() => {
        setCollapsed(true)
        try { localStorage.setItem(COLLAPSED_KEY, 'true') } catch {/* ignore */}
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [currentView, collapsed, isHovered, autoCollapseEnabled])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      if (!next) setAutoCollapseEnabled(false)
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch {/* ignore */}
      return next
    })
  }

  const menuGroups: MenuGroupDef[] = getMenuGroups(userRoles)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [label]: !prev[label]
    }))
  }

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

  const handleItemClick = (item: { id: string; view: BoardView; comingSoon?: boolean; href?: string }) => {
    if (item.comingSoon) return
    if (item.href) {
      let targetUrl = item.href
      if (item.id === 'video-production' && activeBrand?.id) {
        const separator = targetUrl.includes('?') ? '&' : '?'
        targetUrl = `${targetUrl}${separator}brandId=${encodeURIComponent(activeBrand.id)}`
      }
      if ((item.id === 'brand-inspirations' || item.id === 'promotion-plans') && activeBrand?.id) {
        const separator = targetUrl.includes('?') ? '&' : '?'
        targetUrl = `${targetUrl}${separator}brandId=${encodeURIComponent(activeBrand.id)}`
      }
      if (item.id === 'promotion-execution' && activeBrand?.id) {
        targetUrl = `${targetUrl}?brandId=${encodeURIComponent(activeBrand.id)}`
      }
      if (targetUrl.includes('amc-growth.immedi.ai')) {
        const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        if (isLocal) {
          targetUrl = 'http://localhost:4188/public/'
        }
      }
      if (targetUrl.includes('amc-content.immedi.ai')) {
        const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        if (isLocal) {
          targetUrl = 'http://localhost:4010/admin/ai-roles'
        }
      }
      if (EXTERNAL_WORKSPACE_ITEM_IDS.has(item.id)) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer')
        return
      }
      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer')
      } else {
        router.push(targetUrl)
      }
      return
    }
    setCurrentView(item.view)
  }

  return (
    <>
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
      relative flex flex-col shrink-0 h-screen
      bg-white dark:bg-slate-900
      border-r border-slate-100 dark:border-slate-800
      transition-all duration-300 ease-in-out
      \${collapsed ? 'w-16' : 'w-56'}
      overflow-hidden
      \${className}
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
        {menuGroups.map((group, gi) => {
          const labelKey = group.groupLabel || String(gi)
          const isGroupCollapsed = !collapsed && !!collapsedGroups[labelKey]

          return (
            <div key={gi}>
              {/* ── Group separator (not the first group) */}
              {gi > 0 && (
                <div className="mx-3 my-2 h-px bg-slate-100 dark:bg-slate-800" />
              )}

              {/* ── Group label or Brand-section header ─────────────── */}
              {group.isBrandSection ? (
                /* Brand section: label above + switcher below */
                <div className="space-y-1">
                  {!collapsed && (
                    <button
                      onClick={() => toggleGroup(labelKey)}
                      className="w-full flex items-center justify-between px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-300 transition-colors select-none text-left cursor-pointer"
                    >
                      <span>{translatedLabel(group.groupLabel, isEn)}</span>
                      <span className="text-slate-400 dark:text-slate-650">
                        {isGroupCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                      </span>
                    </button>
                  )}
                  {!isGroupCollapsed && (
                    <div className="px-2 pb-1">
                      <InlineBrandSwitcher
                        brands={brands}
                        activeBrand={activeBrand}
                        setActiveBrand={setActiveBrand}
                        collapsed={collapsed}
                        onAddNewBrand={() => setWizardOpen(true)}
                        onExpand={() => {
                          setCollapsed(false)
                          setAutoCollapseEnabled(false)
                          try { localStorage.setItem(COLLAPSED_KEY, 'false') } catch {/* ignore */}
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : group.groupLabel ? (
                !collapsed ? (
                  <button
                    onClick={() => toggleGroup(labelKey)}
                    className="w-full flex items-center justify-between px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-300 transition-colors select-none text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-1">
                      {translatedLabel(group.groupLabel, isEn)}
                      {group.isComingSoon && (
                        <span className="normal-case font-bold text-[9px] bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded px-1 py-px">{translatedLabel('即将上线', isEn)}</span>
                      )}
                    </span>
                    <span className="text-slate-400 dark:text-slate-650">
                      {isGroupCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                    </span>
                  </button>
                ) : null
              ) : null}

              {/* ── Menu items ──────────────────────────────────────── */}
              {!isGroupCollapsed && group.items.map(item => {
                const localHrefPath = item.href?.startsWith('/') ? item.href.split('?')[0] : undefined
                const isLocalHrefActive = !!localHrefPath && (
                  pathname === localHrefPath
                  || (localHrefPath !== '/admin' && pathname.startsWith(`${localHrefPath}/`))
                )
                const isActive = !item.comingSoon && (item.href ? isLocalHrefActive : currentView === item.view)
                return (
                  <div key={item.id} className="relative group/item px-2">
                    <button
                      onClick={() => handleItemClick(item)}
                      disabled={!!item.comingSoon}
                      title={collapsed ? translatedLabel(item.label, isEn) ?? undefined : undefined}
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
                        <span className="flex-1 truncate">{translatedLabel(item.label, isEn)}</span>
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
                        {translatedLabel(item.label, isEn)}{item.comingSoon ? ` (${translatedLabel('即将上线', isEn)})` : ''}
                        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800 dark:border-r-slate-700" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </nav>



      {/* ── Success toast ─────────────────────────────────────────── */}
      {wizardSuccess && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap bg-green-600 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg">
          ✅ {wizardSuccess.brandName} {translatedLabel('已创建', isEn)}
        </div>
      )}

      {/* ── Collapse toggle ───────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-2">
        <button
          onClick={toggleCollapsed}
          title={translatedLabel(collapsed ? '展开侧边栏' : '折叠侧边栏', isEn) || undefined}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-semibold"
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>{translatedLabel('收起', isEn)}</span></>}
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
