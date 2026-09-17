/** HTTP checks supplement, never replace, resource ownership checks. */
export function kanbanRoutePermission(path: string, method: string): string | null {
  const read = ['GET', 'HEAD'].includes(method)
  if (path === '/api/subscription' || path.startsWith('/api/subscription/')) return `subscription.${read ? 'read' : 'manage'}`
  if (path === '/api/agents' || /^\/api\/agents\/[^/]+$/.test(path) && !['register', 'profile', 'keys'].includes(path.split('/').pop()!)) return `agent.${read ? 'read' : 'manage'}`
  if (path === '/api/game/config') return read ? 'game.read' : method === 'DELETE' ? 'game.delete' : 'game.update'
  if (path.startsWith('/api/game/rounds')) return `game.${read ? 'read' : method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update'}`
  if (['/api/game/tasks/override', '/api/game/share-draft-pool'].includes(path) && !read) return 'game.update'
  if (path === '/api/game/redemptions' && !read) return 'game.update'
  if (path.startsWith('/api/brands/') || path === '/api/brands') {
    if (/\/subscription(\/|$)/.test(path)) return `subscription.${read ? 'read' : 'manage'}`
    if (/\/(social-inbox)(\/|$)/.test(path)) return `review.${read ? 'read' : 'reply'}`
    if (/\/social-insight(\/|$)/.test(path)) return 'analytics.read'
    if (/\/actions(\/|$)/.test(path)) return `action_item.${read ? 'read' : /\/(approve|reject)$/.test(path) ? 'resolve' : 'create'}`
    if (/\/(video-director|voiceover-tasks|voices)(\/|$)/.test(path)) return `content.video-making.${read ? 'read' : 'generate'}`
    if (/\/copywriter(\/|$)/.test(path)) return `draft.${read ? 'read' : 'create'}`
    if (/\/(assets|folders|asset-analysis)(\/|$)/.test(path)) return `asset.${read ? 'read' : method === 'DELETE' ? 'archive' : /\/(upload|presign-upload|confirm-upload)$/.test(path) || method === 'POST' && /\/assets$/.test(path) ? 'create' : 'update'}`
    if (/\/(drafts|posts)(\/|$)/.test(path)) {
      if (read) return 'draft.read'
      if (/\/(retry-publish|reset-publishing)$/.test(path)) return 'content.retry'
      if (path.endsWith('/publish')) return 'content.publish'
      for (const op of ['approve', 'reject', 'submit']) if (path.endsWith(`/${op}`)) return `draft.${op}`
      return `draft.${method === 'POST' && /\/(drafts|posts)$/.test(path) ? 'create' : 'update'}`
    }
    if (/\/(analytics|apify-sync|usage-report)(\/|$)/.test(path)) return 'analytics.read'
    if (/\/(game|activities)(\/|$)/.test(path)) return `game.${read ? 'read' : method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update'}`
    if (/\/reviews(\/|$)/.test(path)) return `review.${read ? 'read' : 'reply'}`
    if (/\/agents(\/|$)/.test(path)) return `agent.${read ? 'read' : 'manage'}`
    if (/\/(content-calendar|planning-calendar)(\/|$)/.test(path)) return `content.${read ? 'read' : 'schedule'}`
    return `brand.${read ? 'read' : path === '/api/brands' && method === 'POST' ? 'create' : 'update'}`
  }
  if (path.startsWith('/api/content/video/')) return `content.video-making.${read ? 'read' : 'generate'}`
  if (path.startsWith('/api/content/') || path.startsWith('/api/copywriter/')) return `draft.${read ? 'read' : 'create'}`
  if (path.startsWith('/api/data-analysis') || path.startsWith('/api/researcher/capture-snapshots')) return 'analytics.read'
  if (path.startsWith('/api/analytics/')) return 'analytics.read'
  if (path.startsWith('/api/integrations/google/reviews')) return `review.${read ? 'read' : 'reply'}`
  if (path.startsWith('/api/logs/')) return 'work_log.read'
  if (path.startsWith('/api/dashboard/assets')) return 'asset.read'
  if (path.startsWith('/api/dashboard/calendar')) return 'content.read'
  if (path.startsWith('/api/dashboard/')) return 'brand.read'
  if (path.startsWith('/api/tasks')) return read ? 'draft.read' : path.endsWith('/retry-publish') ? 'content.retry' : 'draft.update'
  if (path.startsWith('/api/admin/video-production')) return `content.video-making.${read ? 'read' : 'generate'}`
  return null
}
