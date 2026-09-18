import { publicKanbanOrigin } from '../publicKanbanOrigin'

/** Check browser writes against the configured public site, not Render's internal URL. */
export function allowedRoleWriteOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const production = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  const expected = publicKanbanOrigin(request)
  return origin === expected || (!production && origin === new URL(request.url).origin)
}
