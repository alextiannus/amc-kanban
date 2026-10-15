type CreativeDraftMarkerKind = 'calendar' | 'unscheduled'

const prefixes: Record<CreativeDraftMarkerKind, string> = {
  calendar: 'brand-plan-calendar-item:',
  unscheduled: 'brand-plan-creative-unscheduled:',
}

export function creativeDraftMarker(kind: CreativeDraftMarkerKind, creativeId: string) {
  return `${prefixes[kind]}${creativeId}`
}

// Canonical and legacy scheduled drafts share the calendar marker. Historical
// notes may embed either marker anywhere and use different casing. Match a
// complete creative ID so idea-one cannot claim a draft for idea-one-other.
export function hasCreativeDraftMarker(note: unknown, kind: CreativeDraftMarkerKind, creativeId?: string) {
  if (typeof note !== 'string') return false
  const value = note.toLowerCase()
  const marker = creativeDraftMarker(kind, creativeId ?? '').toLowerCase()
  let at = value.indexOf(marker)
  while (at >= 0) {
    const after = value.charAt(at + marker.length)
    if (creativeId === undefined ? after && !/\s/.test(after) : !after || !/[a-z0-9_-]/.test(after)) return true
    at = value.indexOf(marker, at + marker.length)
  }
  return false
}
