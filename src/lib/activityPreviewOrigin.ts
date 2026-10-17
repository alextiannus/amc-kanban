const merchantOrigins = new Set(['https://amc-mm.immedi.ai', 'https://amc-kanban.immedi.ai'])
export function isActivityPreviewOrigin(origin: string, customerOrigin: string): boolean {
  return origin === customerOrigin || merchantOrigins.has(origin)
}
