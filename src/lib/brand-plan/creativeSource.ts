import { readCreativeRevisions } from './creativeRevisions'
import { resolveCreativeSourceEvidence } from './creativeSourceEvidence'
import { record } from './creativeRevisionContract'
import { fetchCreativeSourceEvidence } from '../promotion-strategy/clients'
import { sourceMediaAllowedHosts, sourceMediaLocation, publicSourceMediaUrl } from './creativeSourceMediaPolicy'

const text = (value:unknown) => typeof value === 'string' ? value : null
const shotFields = ['id','order','startSec','endSec','visualDescription','shotScale','cameraMovement','subjectAction','voiceover','onScreenText','sound','narrativePurpose','transition'] as const

export async function resolveCreativeSource(actor:{id:string;type:string},brandId:string,month:string,creativeId:string) {
  // The shared reader performs current user/status + brand READ authorization.
  const revision = await readCreativeRevisions(actor,brandId,month,creativeId)
  const current = record(revision.current || revision.revisions[0]?.content)
  const stored = record(revision.source)
  return resolveCreativeSourceEvidence(current,stored,fetchCreativeSourceEvidence)
}

export async function readCreativeSource(actor:{id:string;type:string},brandId:string,month:string,creativeId:string) {
  const {raw,identity,expectedRevision,expectedDigest}=await resolveCreativeSource(actor,brandId,month,creativeId)
  const timeline = (Array.isArray(raw.timeline) ? raw.timeline : []).map((shot:unknown) => {
    const original=record(shot)
    const projected:Record<string,any>=Object.fromEntries(shotFields.map(key=>{
      const value=original[key]
      return [key,['order','startSec','endSec'].includes(key) ? (typeof value==='number'&&Number.isFinite(value)?value:null) : text(value)]
    }))
    // Optional V2 metadata remains optional for legacy evidence, but a supplied
    // malformed value cannot be dropped while claiming complete source proof.
    if(Object.hasOwn(original,'continuityRequirements'))projected.continuityRequirements=Array.isArray(original.continuityRequirements)&&original.continuityRequirements.every((v:unknown)=>typeof v==='string'&&v.trim())?[...original.continuityRequirements]:null
    return projected
  })
  const scope = record(raw.sourceEvidence).scope
  const completeTimeline = timeline.every((shot:Record<string,any>) => typeof shot.id==='string' && shot.id && Number.isSafeInteger(shot.order) && typeof shot.startSec==='number' && typeof shot.endSec==='number' && shot.startSec >= 0 && shot.endSec > shot.startSec && shotFields.every(key=>shot[key]!==null))
    && timeline.every((shot:Record<string,any>)=>!Object.hasOwn(shot,'continuityRequirements')||shot.continuityRequirements!==null)
    && new Set(timeline.map((shot:Record<string,any>)=>shot.id)).size===timeline.length
  const evidenceStatus = !timeline.length || scope === 'source_unavailable' ? 'source_unavailable'
    : scope === 'full_source' && completeTimeline && expectedRevision && expectedDigest ? 'full_source' : 'partial_source'
  const originalText = text(record(raw.sourceEvidence).originalText) || ''
  const query = new URLSearchParams({brandId,sub:'ai_workspace',creativeId,panel:'source'})
  const video=sourceMediaLocation(raw.originalVideoUrl)
  const controlled=video && (video.search || sourceMediaAllowedHosts().has(video.hostname) || /\.myhuaweicloud\.com$/i.test(video.hostname))
  const videoUrl=video ? controlled ? `/api/brands/${encodeURIComponent(brandId)}/content-creatives/${encodeURIComponent(creativeId)}/source/media` : video.href : null
  return {
    ok:true,brandId,creativeId,inspirationCreativeId:identity,sourceRevision:raw.sourceRevision,sourceDigest:raw.sourceDigest,
    libraryDigest:raw.sourceDigest,evidenceStatus,
    sourceEvidence:{scope:evidenceStatus,originalText},
    title:text(raw.title),platform:text(raw.platform),originalPostUrl:publicSourceMediaUrl(raw.originalPostUrl),
    originalVideoUrl:videoUrl,thumbnailUrl:publicSourceMediaUrl(raw.thumbnailUrl),
    internalDetailPath:`/dashboard?${query}`,
    scriptContent:{kind:record(raw.scriptContent).kind === 'post' ? 'post' : 'video',originalText,timeline},timeline,
  }
}
