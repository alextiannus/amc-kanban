type CreativeDraftMarkerKind = 'calendar' | 'unscheduled'

const prefixes: Record<CreativeDraftMarkerKind, string> = {
  calendar: 'brand-plan-calendar-item:',
  unscheduled: 'brand-plan-creative-unscheduled:',
}

function encodedPrefix(kind: CreativeDraftMarkerKind) {
  return `${prefixes[kind].slice(0,-1)}-v2:`
}

function encodeCreativeId(creativeId: string) {
  // Fixed-width UTF-16 code units preserve every string accepted by the
  // address validator, including whitespace, punctuation and lone surrogates.
  return creativeId.split('').map(char => char.charCodeAt(0).toString(16).padStart(4,'0')).join('')
}

function encodedMarker(kind: CreativeDraftMarkerKind, creativeId: string) {
  return `${encodedPrefix(kind)}${encodeCreativeId(creativeId)}`
}

function legacyMarkerToken(kind: CreativeDraftMarkerKind, creativeId: string) {
  const unsafe = /\s|[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(creativeId)
    || /brand-plan-(?:calendar-item|creative-unscheduled)(?:-v2)?:/i.test(creativeId)
  return creativeId && !unsafe ? `${prefixes[kind]}${creativeId}` : null
}

export function creativeDraftMarker(kind: CreativeDraftMarkerKind, creativeId: string) {
  // Existing calendar views read this raw projection. Omit it when the ID
  // cannot be a database-safe token or could look like an embedded marker.
  const compatible = legacyMarkerToken(kind,creativeId)
  return `${compatible ? `${compatible} ` : ''}${encodedMarker(kind,creativeId)}`
}

// Database substring searches are only a prefilter; every result still needs
// hasCreativeDraftMarker before it can be projected or adopted.
export function creativeDraftMarkerSearches(kind: CreativeDraftMarkerKind, creativeId: string) {
  const legacy = legacyMarkerToken(kind,creativeId)
  return [encodedMarker(kind,creativeId),...(legacy ? [legacy] : [])]
}

// Historical raw markers are whitespace-delimited tokens and may use different
// casing anywhere in the note. Never treat punctuation as an ID boundary.
// V2 encodes the ID's casing too, so distinct canonical IDs remain distinct.
export function hasCreativeDraftMarker(note: unknown, kind: CreativeDraftMarkerKind, creativeId?: string) {
  if (typeof note !== 'string') return false
  const encoded = [...note.matchAll(new RegExp(`${encodedPrefix(kind)}(\\S*)`,'gi'))].map(match => match[1].toLowerCase())
  if (encoded.length) {
    // Encoded identity is authoritative; malformed or conflicting V2 markers
    // must not fall back to the raw compatibility projection.
    if (new Set(encoded).size !== 1 || !/^(?:[a-f0-9]{4}){1,200}$/.test(encoded[0])) return false
    return creativeId === undefined || encoded[0] === encodeCreativeId(creativeId)
  }
  for (const match of note.matchAll(new RegExp(`${prefixes[kind]}(\\S+)`,'gi'))) {
    if (creativeId === undefined || match[1].toLowerCase() === creativeId.toLowerCase()) return true
  }
  return false
}
