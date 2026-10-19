/** Presentation-only capabilities shared with AMCMM. No URLs or business mutations. */
export const UI_PAGES = {
  bd: ['专属邀请码', 'Invite Users', 'BD only: view and copy the current business development invite code.'],
  bd_revenue: ['收入业绩看板', 'Revenue Board', 'BD only: view the current business development revenue and performance.'],
  bd_leads: ['销售线索管理', 'Sales Leads', 'BD only: review, add and update sales leads through existing forms.'],
  brand_story: ['品牌策划', 'Brand Planning', 'AI Insight, editable brand interview, marketing direction and selling points, and a complete brand marketing plan.'],
  calendar: ['发布日历', 'Publishing Calendar', 'Review drafts, scheduled and published content, edit or publish through existing controls.'],
  ai_workspace: ['品牌创意', 'Brand Ideas', 'Browse brand ideas, review and edit scripts, continue tasks and hand off to production.'],
  assets: ['素材库', 'Asset Library', 'Upload, search and select existing brand images and videos for content creation.'],
  game: ['店内活动', 'In-Store Activities', 'Configure in-store games, prizes and permanent QR codes.'],
  addons: ['增值服务', 'Value-added Services', 'View available services and costs; purchases require the existing page flow.'],
  socialInsight: ['数据分析', 'Data Analytics', 'View existing brand account metrics, date ranges and trends.'],
  reports: ['管理报告', 'Management Reports', 'Read, regenerate and export available business reports.'],
  agent_settings: ['Agent 设置', 'Agent Settings', 'View runtime and installed Skills; edit your brand-scoped personal instructions and preferences. Opening this page does not change settings.'],
  settings: ['系统设置', 'System Settings', 'Assistant preferences, language, voice, memory and autopilot controls.'],
  profile: ['个人中心', 'Profile Center', 'View and edit the current user profile.'],
} as const
export type UiPage = keyof typeof UI_PAGES
export type UiAction = {page:UiPage;mode:'open'|'suggest';month?:string}
export function isUiPage(value:unknown):value is UiPage {return typeof value==='string'&&Object.prototype.hasOwnProperty.call(UI_PAGES,value)}
export function parseUiAction(value:unknown):UiAction {
  const v=value as Record<string,unknown>
  if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).some(k=>!['page','mode','month'].includes(k))||!isUiPage(v.page)||!['open','suggest'].includes(String(v.mode)))throw Error('invalid_ui_action')
  if(v.month!==undefined&&(v.page!=='calendar'||typeof v.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v.month)))throw Error('invalid_ui_month')
  return {page:v.page,mode:v.mode as UiAction['mode'],...(v.month?{month:v.month as string}:{})}
}
