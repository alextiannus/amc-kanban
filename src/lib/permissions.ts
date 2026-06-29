/**
 * permissions.ts — Centralized role resolution & menu configuration
 *
 * Single source of truth for:
 *   1. Resolving which AppRoles a user has
 *   2. Defining which menu items each role can see (getMenuGroups)
 *   3. Checking view-level access (canAccessView)
 */

export type AppRole = 'ADMIN' | 'AMC_PRINCIPAL' | 'BRAND_OWNER' | 'BD'

export type BoardView =
  | 'dashboard'
  | 'calendar'
  | 'drafts'
  | 'assets'
  | 'game'
  | 'socialInsight'
  | 'dataAnalysis'
  | 'archive'
  | 'agents'
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
    const valid: AppRole[] = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER', 'BD']
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
  switch (view) {
    case 'dashboard':
    case 'calendar':
    case 'drafts':
    case 'assets':
    case 'game':
      return isAdmin || isPrincipal || isOwner
    case 'socialInsight':
    case 'dataAnalysis':
      return isAdmin || isPrincipal || isOwner
    case 'archive':
    case 'managementOverview':
      return isAdmin || isPrincipal
    case 'agents':
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
  /** External href (overrides view switching) */
  href?: string
}

export type MenuGroupDef = {
  groupLabel: string | null
  items: MenuItemDef[]
}

/** Return the ordered sidebar menu groups for the given roles */
export function getMenuGroups(roles: AppRole[]): MenuGroupDef[] {
  const isAdmin = roles.includes('ADMIN')
  const isPrincipal = roles.includes('AMC_PRINCIPAL')
  const isOwner = roles.includes('BRAND_OWNER')
  const isBD = roles.includes('BD')

  const canBrandOps = isAdmin || isPrincipal || isOwner
  const canManage = isAdmin || isPrincipal
  const canAnalytics = isAdmin || isPrincipal || isOwner
  const canAgents = isAdmin || isPrincipal || isOwner

  const groups: MenuGroupDef[] = []

  if (canBrandOps) {
    groups.push({
      groupLabel: '运营',
      items: [
        { id: 'dashboard',  view: 'dashboard',  label: '品牌主看板',       icon: 'LayoutDashboard' },
        { id: 'calendar',   view: 'calendar',   label: '发布日历',         icon: 'Calendar' },
        { id: 'drafts',     view: 'drafts',     label: '发布内容 (Post)',   icon: 'FileText' },
        { id: 'assets',     view: 'assets',     label: '素材库',           icon: 'Images' },
        { id: 'game',       view: 'game',       label: '店内活动',         icon: 'Gift' },
      ],
    })
  }

  if (canAnalytics) {
    const analyticsItems: MenuItemDef[] = [
      { id: 'socialInsight', view: 'socialInsight', label: '数据分析',  icon: 'BarChart2' },
      { id: 'logs',          view: 'logs',          label: '工作日志',  icon: 'Activity' },
    ]
    // Snapshot view only for admin/principal
    if (isAdmin || isPrincipal) {
      analyticsItems.splice(1, 0, { id: 'dataAnalysis', view: 'dataAnalysis', label: '账号快照', icon: 'Camera' })
    }
    groups.push({ groupLabel: '数据', items: analyticsItems })
  }

  if (canManage) {
    groups.push({
      groupLabel: '管理',
      items: [
        { id: 'managementOverview', view: 'managementOverview', label: '主理人总览', icon: 'Users' },
        { id: 'archive',            view: 'archive',            label: '归档',       icon: 'Inbox' },
      ],
    })
  }

  if (canAgents) {
    groups.push({
      groupLabel: 'AI 工具',
      items: [
        { id: 'agents', view: 'agents', label: 'AI 序列', icon: 'Bot' },
      ],
    })
  }

  if (isBD) {
    groups.push({
      groupLabel: '商务',
      items: [
        { id: 'bd-workspace', view: 'dashboard', label: 'BD 工作台', icon: 'Briefcase',  comingSoon: true },
        { id: 'bd-clients',   view: 'dashboard', label: '客户汇总',  icon: 'Users',      comingSoon: true },
        { id: 'bd-revenue',   view: 'dashboard', label: '收入总览',  icon: 'TrendingUp', comingSoon: true },
      ],
    })
  }

  if (isAdmin) {
    groups.push({
      groupLabel: '系统',
      items: [
        { id: 'admin', view: 'dashboard', label: 'Admin 控制台', icon: 'Shield', href: '/admin' },
      ],
    })
  }

  return groups
}
