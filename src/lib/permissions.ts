/**
 * permissions.ts — Centralized role resolution & menu configuration
 */

export type AppRole = 'ADMIN' | 'AMC_PRINCIPAL' | 'BRAND_OWNER' | 'BD' | 'RESEARCHER'

export type BoardView =
  | 'dashboard'
  | 'calendar'
  | 'drafts'
  | 'assets'
  | 'game'
  | 'socialInsight'
  | 'dataAnalysis'
  | 'logs'
  | 'managementOverview'

export interface UserInfo {
  role?: string
  dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  userRoles?: string[]
}

/** Resolve AppRoles from the user object returned by /api/auth/me */
export function resolveRoles(user: UserInfo | null): AppRole[] {
  if (!user) return []
  if (user.userRoles && user.userRoles.length > 0) {
    const valid: AppRole[] = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER', 'BD', 'RESEARCHER']
    return user.userRoles.filter((r): r is AppRole => valid.includes(r as AppRole))
  }
  if (user.role === 'ADMIN') return ['ADMIN']
  if (user.dashboardRole === 'BRAND_OWNER') return ['BRAND_OWNER']
  if (user.dashboardRole === 'BRAND_DIRECTOR') return ['AMC_PRINCIPAL']
  return []
}

/** Check whether a set of roles can navigate to a given view */
export function canAccessView(roles: AppRole[], view: BoardView): boolean {
  const isAdmin = roles.includes('ADMIN')
  const isPrincipal = roles.includes('AMC_PRINCIPAL')
  const isOwner = roles.includes('BRAND_OWNER')
  const isResearcher = roles.includes('RESEARCHER')
  switch (view) {
    case 'dashboard':
    case 'calendar':
    case 'drafts':
    case 'assets':
    case 'game':
      return isAdmin || isPrincipal || isOwner
    case 'socialInsight':
      return isAdmin || isPrincipal || isOwner
    case 'dataAnalysis':
      return isAdmin || isPrincipal
    case 'managementOverview':
      return isAdmin || isPrincipal || isResearcher
    case 'logs':
      return isAdmin || isPrincipal || isOwner
    default:
      return isAdmin
  }
}

export type MenuItemDef = {
  id: string
  view: BoardView
  label: string
  icon: string
  comingSoon?: boolean
  /** External href — overrides view switching */
  href?: string
}

export type MenuGroupDef = {
  /** Display label for the group header. null = no label */
  groupLabel: string | null
  items: MenuItemDef[]
  /**
   * true = this section is the brand-level section.
   * Sidebar renders an inline brand switcher as the section header.
   */
  isBrandSection?: boolean
  /**
   * true = this section contains only coming-soon items (BD placeholder).
   */
  isComingSoon?: boolean
}

/**
 * Return the ordered sidebar menu groups for the given roles.
 * Order: 主理人 → 品牌主 → BD → Admin
 */
export function getMenuGroups(roles: AppRole[]): MenuGroupDef[] {
  const isAdmin     = roles.includes('ADMIN')
  const isPrincipal = roles.includes('AMC_PRINCIPAL')
  const isOwner     = roles.includes('BRAND_OWNER')
  const isBD        = roles.includes('BD')
  const isResearcher = roles.includes('RESEARCHER')

  const canBrandOps = isAdmin || isPrincipal || isOwner
  const canManage   = isAdmin || isPrincipal

  const groups: MenuGroupDef[] = []

  if (isResearcher && !isAdmin && !isPrincipal && !isOwner && !isBD) {
    groups.push({
      groupLabel: 'Researcher',
      items: [
        { id: 'inspiration-library', view: 'managementOverview', label: '爆品素材库', icon: 'Images', href: '/admin/inspiration-library' },
        { id: 'viral-copy-scripts', view: 'managementOverview', label: '爆品脚本', icon: 'FileText', href: '/admin/viral-copy-scripts' },
        { id: 'amc-content-roles', view: 'managementOverview', label: 'AI 角色库', icon: 'Sparkles', href: '/admin/content-lab' },
      ],
    })
    return groups
  }

  // ── 1. 主理人 (Admin / Principal) ────────────────────────────────
  if (canManage) {
    groups.push({
      groupLabel: '主理人',
      items: [
        { id: 'managementOverview', view: 'managementOverview', label: '主理人总览', icon: 'Users' },
        { id: 'dataAnalysis',       view: 'dataAnalysis',       label: '账号快照',   icon: 'Camera' },
        { id: 'inspiration-library',view: 'managementOverview', label: '爆品素材库', icon: 'Images', href: '/admin/inspiration-library' },
        { id: 'viral-copy-scripts', view: 'managementOverview', label: '爆品脚本', icon: 'FileText', href: '/admin/viral-copy-scripts' },
        { id: 'amc-content-roles',  view: 'managementOverview', label: 'AI 角色库', icon: 'Sparkles', href: '/admin/content-lab' },
        { id: 'amc-growth',         view: 'managementOverview', label: '智能规划', icon: 'TrendingUp', href: '/api/integrations/amc-growth/sso/start?returnTo=%2Fdashboard' },
      ],
    })
  }

  // ── 2. 品牌主 (Brand-level ops — inline brand switcher as header) ─
  if (canBrandOps) {
    const brandItems: MenuItemDef[] = [
      { id: 'dashboard',    view: 'dashboard',    label: '品牌故事',      icon: 'BookOpen' },
      { id: 'calendar',     view: 'calendar',     label: '发布日历',        icon: 'Calendar' },
      { id: 'drafts',       view: 'drafts',       label: '发布内容', icon: 'FileText' },
      { id: 'assets',       view: 'assets',       label: '素材库',          icon: 'Images' },
      { id: 'game',         view: 'game',         label: '店内活动',        icon: 'Gift' },
      { id: 'socialInsight',view: 'socialInsight',label: '数据分析',        icon: 'BarChart2' },
    ]
    groups.push({
      groupLabel: '品牌主',
      isBrandSection: true,
      items: brandItems,
    })
  }

  // ── 3. BD 商务 (coming soon placeholder) ─────────────────────────
  if (isBD || isAdmin) {
    groups.push({
      groupLabel: 'BD 商务',
      isComingSoon: true,
      items: [
        { id: 'bd-workspace', view: 'dashboard', label: 'BD 工作台', icon: 'Briefcase',  comingSoon: true },
        { id: 'bd-clients',   view: 'dashboard', label: '客户汇总',  icon: 'Users',      comingSoon: true },
        { id: 'bd-revenue',   view: 'dashboard', label: '收入总览',  icon: 'TrendingUp', comingSoon: true },
      ],
    })
  }

  // ── 4. Admin 系统 ─────────────────────────────────────────────────
  if (isAdmin) {
    groups.push({
      groupLabel: 'Admin',
      items: [
        { id: 'user-management', view: 'dashboard', label: '用户管理', icon: 'Users', href: '/admin?tab=users' },
        { id: 'logs',    view: 'logs',    label: '工作日志',   icon: 'Activity' },
        { id: 'admin',   view: 'dashboard', label: 'Admin 控制台', icon: 'Shield', href: '/admin' },
      ],
    })
  }

  return groups
}
