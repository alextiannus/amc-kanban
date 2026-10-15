import { readCreativeRevisions } from './creativeRevisions'
import { CreativeRevisionError, record } from './creativeRevisionContract'
import { fetchCreativeSourceEvidence } from '../promotion-strategy/clients'
import { sourceMediaAllowedHosts, sourceMediaLocation, publicSourceMediaUrl } from './creativeSourceMediaPolicy'

const text = (value:unknown) => typeof value === 'string' ? value : null
const shotFields = ['id','order','startSec','endSec','visualDescription','shotScale','cameraMovement','subjectAction','voiceover','onScreenText','sound','narrativePurpose','transition'] as const

export async function resolveCreativeSource(actor:{id:string;type:string},brandId:string,month:string,creativeId:string) {
  // The shared reader performs current user/status + brand READ authorization.
  const revision = await readCreativeRevisions(actor,brandId,month,creativeId)
  const current = record(revision.current || revision.revisions[0]?.content)
  const stored = record(revision.source)
  const canonical = record(current.source || (record(stored.snapshot).sourceRevision ? stored.snapshot : null))
  const snapshot = record(record(current.nativeSourceSnapshot).source || record(record(stored.snapshot).nativeSourceSnapshot).source)
  const identity = canonical.inspirationCreativeId || current.inspirationCreativeId || stored.creativeId
  if (typeof identity !== 'string' || !/^cre_[a-zA-Z0-9_-]+$/.test(identity)) throw new CreativeRevisionError('creative_source_not_found',404)
  // Conflicting references cannot be resolved by silently preferring one.
  for (const id of [canonical.inspirationCreativeId,current.inspirationCreativeId,stored.creativeId,snapshot.inspirationCreativeId]) {
    if (id && id !== identity) throw new CreativeRevisionError('creative_source_not_found',404)
  }
  const expectedRevision = text(canonical.sourceRevision || snapshot.sourceRevision)
  // nativeSourceSnapshot.libraryDigest is a batch hash, never a source hash.
  const expectedDigest = text(canonical.sourceDigest || canonical.libraryDigest || snapshot.sourceDigest)
  let raw:any
  try { raw = await fetchCreativeSourceEvidence(identity) }
  catch (error) {
    if (error instanceof Error && error.message === 'original_evidence_not_found') throw new CreativeRevisionError('creative_source_not_found',404)
    if (error instanceof Error && error.message === 'library_evidence_too_large') throw new CreativeRevisionError('library_evidence_too_large',413)
    throw new CreativeRevisionError('creative_source_unavailable',503)
  }
  if (!raw || raw.creativeId !== identity) throw new CreativeRevisionError('creative_source_not_found',404)
  if (expectedRevision && raw.sourceRevision !== expectedRevision || expectedDigest && raw.sourceDigest !== expectedDigest) throw new CreativeRevisionError('creative_source_changed',409)
  if (typeof raw.sourceRevision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.sourceDigest || '')) throw new CreativeRevisionError('creative_source_unavailable',503)
  return {raw,identity,expectedRevision,expectedDigest}
}

export async function readCreativeSource(actor:{id:string;type:string},brandId:string,month:string,creativeId:string) {
  const {raw,identity,expectedRevision,expectedDigest}=await resolveCreativeSource(actor,brandId,month,creativeId)
  const timeline = (Array.isArray(raw.timeline) ? raw.timeline : []).map((shot:unknown) => Object.fromEntries(shotFields.map(key=>{
    const value=record(shot)[key]
    return [key,['order','startSec','endSec'].includes(key) ? (typeof value==='number'&&Number.isFinite(value)?value:null) : text(value)]
  })))
  const scope = record(raw.sourceEvidence).scope
  const completeTimeline = timeline.every((shot:Record<string,any>) => typeof shot.id==='string' && shot.id && Number.isSafeInteger(shot.order) && typeof shot.startSec==='number' && typeof shot.endSec==='number' && shot.startSec >= 0 && shot.endSec > shot.startSec && shotFields.every(key=>shot[key]!==null))
    && new Set(timeline.map((shot:Record<string,any>)=>shot.id)).size===timeline.length
  const evidenceStatus = !timeline.length || scope === 'source_unavailable' ? 'source_unavailable'
    : scope === 'full_source' && completeTimeline && expectedRevision && expectedDigest ? 'full_source' : 'partial_source'
  const originalText = text(record(raw.sourceEvidence).originalText) || ''
  const query = new URLSearchParams({brandId,sub:'ai_workspace',creativeId,panel:'source'})
  const video=sourceMediaLocation(raw.originalVideoUrl)
  const controlled=video && (video.search || sourceMediaAllowedHosts().has(video.hostname) || /\.myhuaweicloud\.com$/i.test(video.hostname))
  const videoUrl=video ? controlled ? `/api/brands/${encodeURIComponent(brandId)}/content-creatives/${encodeURIComponent(creativeId)}/source/media?${new URLSearchParams({month})}` : video.href : null
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
