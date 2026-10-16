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
function markerIdentities(note: unknown, kind: CreativeDraftMarkerKind) {
  if (typeof note !== 'string') return {encoded:false,values:[] as string[]}
  const encoded = [...note.matchAll(new RegExp(`${encodedPrefix(kind)}(\\S*)`,'gi'))].map(match => match[1].toLowerCase())
  if (encoded.length) {
    // Encoded identity is authoritative; malformed or conflicting V2 markers
    // must not fall back to the raw compatibility projection.
    return {encoded:true,values:encoded.every(value=>/^(?:[a-f0-9]{4}){1,200}$/.test(value))?[...new Set(encoded)]:[]}
  }
  return {encoded:false,values:[...new Set([...note.matchAll(new RegExp(`${prefixes[kind]}(\\S+)`,'gi'))].map(match=>match[1].toLowerCase()))]}
}

// Count the note's identities, not the subset still present in the workspace.
export function creativeDraftMarkerIdentityCount(note: unknown, kind: CreativeDraftMarkerKind) {
  return markerIdentities(note,kind).values.length
}

export function hasCreativeDraftMarkerIdentity(note: unknown, kind: CreativeDraftMarkerKind, creativeId?: string) {
  if(creativeId!==undefined&&typeof creativeId!=='string')return false
  const identities=markerIdentities(note,kind)
  if(!identities.values.length||identities.encoded&&identities.values.length!==1)return false
  return creativeId===undefined||identities.values.includes(identities.encoded?encodeCreativeId(creativeId):creativeId.toLowerCase())
}

function decodeIdentity(value:string) {
  return value.replace(/.{4}/g,code=>String.fromCharCode(parseInt(code,16)))
}

function lastMarker(note:string,kind:CreativeDraftMarkerKind,id:string) {
  const identities=markerIdentities(note,kind)
  if(!hasCreativeDraftMarkerIdentity(note,kind,id))return -1
  const token=identities.encoded?encodeCreativeId(id):id.toLowerCase()
  return [...note.matchAll(new RegExp(`${identities.encoded?encodedPrefix(kind):prefixes[kind]}(\\S+)`,'gi'))]
    .filter(match=>match[1].toLowerCase()===token).at(-1)?.index??-1
}

// Notes are append-only historical evidence. The latest explicit marker for
// this identity decides whether it is currently scheduled or canceled.
export function hasCreativeDraftMarker(note: unknown, kind: CreativeDraftMarkerKind, creativeId?: string):boolean {
  if(typeof note!=='string'||!hasCreativeDraftMarkerIdentity(note,kind,creativeId))return false
  if(creativeId===undefined){
    const identities=markerIdentities(note,kind)
    return identities.values.some(value=>hasCreativeDraftMarker(note,kind,identities.encoded?decodeIdentity(value):value))
  }
  return lastMarker(note,kind,creativeId)>lastMarker(note,kind==='calendar'?'unscheduled':'calendar',creativeId)
}

export function activeCalendarCreativeId(note:unknown):string {
  const identities=markerIdentities(note,'calendar')
  if(identities.values.length!==1)return ''
  let id=identities.encoded?decodeIdentity(identities.values[0]):typeof note==='string'?[...note.matchAll(/brand-plan-calendar-item:(\S+)/gi)][0]?.[1]||'':''
  if(!identities.encoded){
    // A raw identity has no authoritative casing. Resolve it through a unique
    // matching V2 cancellation before comparing state, never fold two V2 IDs.
    const canceled=markerIdentities(note,'unscheduled')
    const canonical=canceled.encoded?canceled.values.map(decodeIdentity).filter(value=>value.toLowerCase()===identities.values[0]):[]
    if(canonical.length>1)return ''
    id=canonical[0]||id
  }
  return hasCreativeDraftMarker(note,'calendar',id)?id:''
}
