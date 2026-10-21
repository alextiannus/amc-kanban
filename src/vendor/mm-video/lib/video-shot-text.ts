import type { VideoShotTextV2, VideoShotTextCapabilities } from '@/vendor/mm-video/components/shared/types'

export type LegacyTextChoice = 'spoken_caption' | 'overlay' | 'discard'
export type ShotTextAction = 'save_shot_text' | 'classify_legacy_text'
type RecordValue = Record<string, unknown>
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const string = (value: unknown) => typeof value === 'string' ? value : ''
const language = (value: unknown): value is VideoShotTextV2['language'] => value === 'zh' || value === 'en' || value === 'id' || value === 'ms' || value === 'bilingual'
export function normalizeVideoScenePrompt(value:unknown){
  if(typeof value!=='string')throw new Error('video_scene_prompt_required')
  const prompt=value.trim()
  if(!prompt)throw new Error('video_scene_prompt_required')
  if(prompt.length>12000)throw new Error('video_scene_prompt_too_long')
  return prompt
}

/** Read-only projection. Hashes and authority revisions are never computed by MM. */
export function videoShotText(scene: unknown): VideoShotTextV2 | {
  contractVersion: null; legacyTextStatus: 'legacy_unverified'; voiceoverText: string; subtitle: string; onScreenText: string
  captionText: ''; spokenTextHash?: undefined
} {
  const value = record(scene)
  const version = value.textContractVersion ?? value.contractVersion
  if (version === 2 && typeof value.spokenText === 'string' && typeof value.overlayText === 'string'
    && (value.captionMode === 'mirror_spoken' || value.captionMode === 'off') && (value.spokenText.trim() || value.captionMode === 'off')
    && language(value.language) && Number.isSafeInteger(value.textRevision) && Number(value.textRevision) >= 1
    && hash(value.spokenTextHash) && hash(value.overlayTextHash)) {
    return { contractVersion: 2, spokenText: value.spokenText, captionMode: value.captionMode, overlayText: value.overlayText,
      language: value.language, textRevision: value.textRevision as number, spokenTextHash: value.spokenTextHash, overlayTextHash: value.overlayTextHash,
      captionText: value.captionMode === 'mirror_spoken' ? value.spokenText : '',
      ...(value.legacyTextStatus === 'legacy_confirmed' ? { legacyTextStatus: 'legacy_confirmed' as const } : {}) }
  }
  return { contractVersion: null, legacyTextStatus: 'legacy_unverified', voiceoverText: string(value.voiceoverText), subtitle: string(value.subtitle), onScreenText: string(value.onScreenText), captionText: '' }
}

export type ShotTextPatch = {
  spokenText: string; captionMode: VideoShotTextV2['captionMode']; overlayText: string
  expectedTextRevision: number; expectedSpokenTextHash: string; expectedScriptVersion: string
}
export type LegacyTextClassification = {
  legacyTextChoice: LegacyTextChoice; expectedTextRevision: null; expectedSpokenTextHash: null; expectedScriptVersion: string
}

function scriptVersion(value: unknown): string {
  if (!hash(value)) throw new Error('expected_script_version_required')
  return value
}

/** Accept only writable canonical fields. Captions are a read-only projection. */
export function validateShotTextPatch(input: unknown): ShotTextPatch {
  const value = record(input)
  if ('captionText' in value) throw new Error('caption_is_derived')
  if (Object.keys(value).some(key => !['spokenText', 'captionMode', 'overlayText', 'expectedTextRevision', 'expectedSpokenTextHash', 'expectedScriptVersion'].includes(key))) throw new Error('invalid_shot_text_patch')
  if (typeof value.spokenText !== 'string' || !value.spokenText.trim() && value.captionMode !== 'off') throw new Error('spoken_text_required')
  if (value.captionMode !== 'mirror_spoken' && value.captionMode !== 'off') throw new Error('caption_mode_invalid')
  if (typeof value.overlayText !== 'string') throw new Error('overlay_text_required')
  if (value.spokenText.length > 2401 || value.overlayText.length > 1001) throw new Error('shot_text_too_long')
  if (!Number.isSafeInteger(value.expectedTextRevision) || Number(value.expectedTextRevision) < 1 || !hash(value.expectedSpokenTextHash)) throw new Error('expected_text_authority_required')
  return { spokenText: value.spokenText, captionMode: value.captionMode, overlayText: value.overlayText,
    expectedTextRevision: value.expectedTextRevision as number, expectedSpokenTextHash: value.expectedSpokenTextHash, expectedScriptVersion: scriptVersion(value.expectedScriptVersion) }
}

export function validateLegacyTextClassification(input: unknown): LegacyTextClassification {
  const value = record(input)
  if (value.legacyTextChoice !== 'spoken_caption' && value.legacyTextChoice !== 'overlay' && value.legacyTextChoice !== 'discard') throw new Error('legacy_text_choice_invalid')
  if (Object.keys(value).some(key => !['legacyTextChoice', 'expectedTextRevision', 'expectedSpokenTextHash', 'expectedScriptVersion'].includes(key))) throw new Error('invalid_legacy_text_classification')
  if (value.expectedTextRevision !== null || value.expectedSpokenTextHash !== null) throw new Error('expected_legacy_authority_required')
  return { legacyTextChoice: value.legacyTextChoice, expectedTextRevision: null, expectedSpokenTextHash: null, expectedScriptVersion: scriptVersion(value.expectedScriptVersion) }
}

export function shotTextCapabilities(draft: unknown): VideoShotTextCapabilities | undefined {
  if (record(draft).generationMode === 'timeline') return undefined
  const value = record(record(draft).shotTextCapabilities)
  if (value.schemaVersion !== 'shot-text-write@1' || value.optimisticConcurrency !== true || !Array.isArray(value.actions)
    || value.actions.some(action => action !== 'save_shot_text' && action !== 'classify_legacy_text')) return undefined
  const rawFeedback=record(value.revisionFeedback)
  const feedbackActions=['save_scene','save_shot_text','save_feedback'] as const,feedbackFields=['reasons','note','instruction','candidateAdopted'] as const
  const rawSceneWrite=record(rawFeedback.sceneWrite),rawSceneWriteFields=Array.isArray(rawSceneWrite.fields)?rawSceneWrite.fields:[],sceneWriteFields=['prompt','spokenText','captionMode','overlayText'] as const
  const revisionFeedback=rawFeedback.schemaVersion==='video-revision-feedback@1'&&rawFeedback.request==='revision_feedback_write_request@1'&&rawFeedback.acknowledgment==='revision_feedback_write@1'&&rawFeedback.revision==='revision_feedback_revision@1'
    &&Array.isArray(rawFeedback.actions)&&rawFeedback.actions.every(action=>feedbackActions.includes(action as typeof feedbackActions[number]))
    &&Array.isArray(rawFeedback.fields)&&rawFeedback.fields.every(field=>feedbackFields.includes(field as typeof feedbackFields[number]))
    &&rawSceneWrite.atomic===true&&sceneWriteFields.every(field=>rawSceneWriteFields.includes(field))&&rawSceneWriteFields.every(field=>sceneWriteFields.includes(field as typeof sceneWriteFields[number]))
    ?{schemaVersion:'video-revision-feedback@1' as const,actions:[...new Set(rawFeedback.actions)] as typeof feedbackActions[number][],fields:[...new Set(rawFeedback.fields)] as typeof feedbackFields[number][],request:'revision_feedback_write_request@1' as const,acknowledgment:'revision_feedback_write@1' as const,revision:'revision_feedback_revision@1' as const,sceneWrite:{atomic:true as const,fields:[...sceneWriteFields]}}:undefined
  return { schemaVersion: 'shot-text-write@1', optimisticConcurrency: true, actions: [...new Set(value.actions)] as ShotTextAction[],...(revisionFeedback?{revisionFeedback}:{}) }
}
export function shotTextWriteSupported(draft: unknown, action: ShotTextAction) {
  return shotTextCapabilities(draft)?.actions.includes(action) === true
}
export function revisionFeedbackWriteSupported(draft:unknown,action:'save_scene'|'save_shot_text'|'save_feedback',field:'reasons'|'note'|'instruction'|'candidateAdopted'='candidateAdopted'){
  const capability=shotTextCapabilities(draft)?.revisionFeedback
  return capability?.actions.includes(action)===true&&capability.fields.includes(field)
}
export function atomicSceneWriteSupported(draft:unknown,fields:Array<'prompt'|'spokenText'|'captionMode'|'overlayText'>){
  const sceneWrite=shotTextCapabilities(draft)?.revisionFeedback?.sceneWrite
  return sceneWrite?.atomic===true&&fields.every(field=>sceneWrite.fields.includes(field))
}
function acknowledgmentInvalid(): never { throw new Error('shot_text_acknowledgment_invalid') }

function canonicalJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalJsonValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJsonValue((value as RecordValue)[key])]))
  return value
}
const sameJson = (left: unknown, right: unknown) => JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right))
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

function boundJob(job: RecordValue, draft: RecordValue, shot: RecordValue) {
  // These fields are always emitted by Content's PersistedVideoJob/mapJob.
  if (!string(job.id).trim() || job.id !== string(job.id).trim() || job.brandId !== draft.brandId || job.projectId !== draft.id || job.sceneId !== shot.shotId
    || job.createdBy !== draft.createdBy || !string(job.variantId).trim() || !string(job.idempotencyKey).trim()
    || !timestamp(job.createdAt) || !Object.hasOwn(jobTransitions, string(job.status))) acknowledgmentInvalid()
  for (const nested of [record(job.requestPayload), record(job.outputMedia)]) {
    for (const key of ['brandId', 'projectId', 'sceneId', 'createdBy']) if (nested[key] !== undefined && nested[key] !== job[key]) acknowledgmentInvalid()
  }
}

function compatibleTargetShot(previous: RecordValue, next: RecordValue, action: ShotTextAction, patch: ShotTextPatch | LegacyTextClassification) {
  const mutable = new Set(['contractVersion', 'textContractVersion', 'spokenText', 'captionMode', 'overlayText', 'textRevision', 'spokenTextHash', 'overlayTextHash', 'captionText',
    'legacyTextStatus', 'subtitle', 'voiceoverText', 'sourceTimeline', 'selectedVoiceoverMediaId', 'ttsDurationSec', 'ttsInvalidatedAt', 'updatedAt'])
  const fixed = (shot: RecordValue) => Object.fromEntries(Object.entries(shot).filter(([key]) => !mutable.has(key)))
  // Content forbids active target jobs before the write. Its text transaction
  // never changes target jobs, clip selection, visual prompt, duration or mapping.
  if (!sameJson(fixed(previous), fixed(next)) || (previous.jobs as RecordValue[]).some(job => ['submitting', 'submitted', 'processing'].includes(string(job.status)))) acknowledgmentInvalid()
  if (next.selectedClipJobId != null) {
    const selected = (next.jobs as RecordValue[]).find(job => job.id === next.selectedClipJobId)
    if (!selected || selected.status !== 'completed' || !outputUrl(record(selected.outputMedia).url)) acknowledgmentInvalid()
  }
  if (next.textContractVersion !== 2 || next.contractVersion !== undefined && next.contractVersion !== 2
    || next.subtitle !== next.overlayText || next.voiceoverText !== next.spokenText
    || next.captionText !== undefined && next.captionText !== (next.captionMode === 'mirror_spoken' ? next.spokenText : '')) acknowledgmentInvalid()
  const legacy = previous.textContractVersion !== 2
  const authorityChanged = legacy || previous.spokenText !== next.spokenText
  const captionsChanged = authorityChanged || previous.captionMode !== next.captionMode
  const source = record(previous.sourceTimeline)
  const expectedSource = captionsChanged ? Object.fromEntries(Object.entries(source).filter(([key]) => !['captionTiming', 'captionSegments', 'captionAlignment'].includes(key))) : source
  if (!sameJson(expectedSource, next.sourceTimeline) || next.updatedAt !== undefined && !timestamp(next.updatedAt)) acknowledgmentInvalid()
  if (authorityChanged) {
    if (next.selectedVoiceoverMediaId != null || next.ttsDurationSec != null || !timestamp(next.ttsInvalidatedAt)) acknowledgmentInvalid()
  } else for (const key of ['selectedVoiceoverMediaId', 'ttsDurationSec', 'ttsInvalidatedAt']) if (!sameJson(previous[key], next[key])) acknowledgmentInvalid()
  if (action === 'save_shot_text') {
    if (next.legacyTextStatus !== previous.legacyTextStatus) acknowledgmentInvalid()
  } else {
    const choice = (patch as LegacyTextClassification).legacyTextChoice
    const spoken = choice === 'spoken_caption' ? previous.subtitle : previous.voiceoverText
    const overlay = choice === 'overlay' ? previous.subtitle : String(source.onScreenText || '')
    if (!legacy || next.spokenText !== spoken || next.overlayText !== overlay || next.captionMode !== (string(spoken).trim() ? 'mirror_spoken' : 'off')
      || next.textRevision !== 1 || next.legacyTextStatus !== 'legacy_confirmed') acknowledgmentInvalid()
  }
}

// Persisted Content jobs use these five states (videoExecution/repository.ts).
// Reads may skip intermediate active states; terminal states never restart here.
const jobTransitions: Record<string, readonly string[]> = {
  submitting: ['submitting', 'submitted', 'processing', 'completed', 'failed'],
  submitted: ['submitted', 'processing', 'completed', 'failed'],
  processing: ['processing', 'completed', 'failed'],
  completed: ['completed'],
  failed: ['failed'],
}

function outputUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value.trim() : '' }
  catch { return '' }
}

/** Match basicDraftScenes: pinned job first, otherwise newest completed job. */
function effectiveClipUrl(shot: RecordValue): string {
  const jobs = shot.jobs as RecordValue[]
  const selected = jobs.find(job => string(job.id).trim() === string(shot.selectedClipJobId).trim())
    ?? [...jobs].reverse().find(job => job.status === 'completed')
  return outputUrl(record(selected?.outputMedia).url)
}

function compatibleShotRuntime(previous: RecordValue, next: RecordValue) {
  const runtime = new Set(['jobs', 'selectedClipJobId', 'generationRevision', 'videoInvalidatedAt', 'updatedAt', 'referencePreparation'])
  const staticFields = (shot: RecordValue) => Object.fromEntries(Object.entries(shot).filter(([key]) => !runtime.has(key)))
  if (JSON.stringify(canonicalJsonValue(staticFields(previous))) !== JSON.stringify(canonicalJsonValue(staticFields(next)))) acknowledgmentInvalid()
  if (previous.generationRevision !== undefined && (!Number.isSafeInteger(next.generationRevision) || Number(next.generationRevision) < Number(previous.generationRevision))) acknowledgmentInvalid()
  const before = previous.jobs as RecordValue[], after = next.jobs as RecordValue[]
  if (after.length < before.length || new Set(after.map(job => job.id)).size !== after.length) acknowledgmentInvalid()
  for (const [index, job] of after.entries()) {
    if (!string(job.id).trim() || !Object.hasOwn(jobTransitions, string(job.status))) acknowledgmentInvalid()
    const old = before[index]
    if (old && (job.id !== old.id || !Object.hasOwn(jobTransitions, string(old.status)) || !jobTransitions[string(old.status)].includes(string(job.status)))) acknowledgmentInvalid()
    // Historical terminal jobs may lack decorated media; an unchanged unknown
    // output is tolerated, but new completion must supply its usable output.
    if (job.status === 'completed' && !outputUrl(record(job.outputMedia).url) && (!old || old.status !== 'completed' || outputUrl(record(old.outputMedia).url))) acknowledgmentInvalid()
    if (!old) continue
    for (const key of ['id', 'brandId', 'projectId', 'sceneId', 'createdBy', 'createdAt', 'variantId', 'idempotencyKey']) if (old[key] !== undefined && job[key] !== old[key]) acknowledgmentInvalid()
    for (const key of ['outputMediaId', 'outputAssetVersionId', 'outputUrl']) if (old[key] !== undefined && job[key] !== old[key]) acknowledgmentInvalid()
    const oldMedia = record(old.outputMedia), media = record(job.outputMedia)
    if (oldMedia.url !== undefined && media.url !== oldMedia.url || oldMedia.id !== undefined && media.id !== oldMedia.id) acknowledgmentInvalid()
    if (Array.isArray(old.outputs)) {
      const urls = new Set((Array.isArray(job.outputs) ? job.outputs : []).map(output => record(output).url))
      if (old.outputs.some(output => outputUrl(record(output).url) && !urls.has(record(output).url))) acknowledgmentInvalid()
    }
  }
  if (next.selectedClipJobId !== previous.selectedClipJobId) {
    const selected = after.find(job => job.id === next.selectedClipJobId)
    if (!selected || selected.status !== 'completed' || !outputUrl(record(selected.outputMedia).url)) acknowledgmentInvalid()
  }
  if (effectiveClipUrl(previous) && !effectiveClipUrl(next)) acknowledgmentInvalid()
}

/** A write response replaces the whole MM project, so it must be a draft, not a patch. */
function completeDraft(value: RecordValue, projectId: string, brandId: string, supported:(draft:RecordValue)=>boolean) {
  const progress = record(value.progress)
  if (value.id !== projectId || value.brandId !== brandId || !string(value.createdBy) || !language(value.language)
    || value.generationMode !== 'per_shot' || !hash(value.scriptVersion) || !supported(value)
    || !string(value.status) || !string(progress.stage) || typeof progress.overallPercent !== 'number' || !Number.isFinite(progress.overallPercent)
    || !Array.isArray(value.shots) || !value.shots.length || !Array.isArray(value.revisions) || typeof value.revisionsHasMore !== 'boolean'
    || !Object.hasOwn(value, 'videoReceipt') || value.videoReceipt === undefined || value.videoReceipt !== null && !Object.keys(record(value.videoReceipt)).length
    || !Object.hasOwn(value, 'input') || value.input === undefined || value.input !== null && !Object.keys(record(value.input)).length
    || !Object.hasOwn(value, 'assemblyJob') || value.assemblyJob === undefined || value.assemblyJob !== null && !Object.keys(record(value.assemblyJob)).length
    || !Object.hasOwn(value,'revisionsCursor') || (value.revisionsHasMore === true
      ? typeof value.revisionsCursor !== 'string' || !value.revisionsCursor
      : value.revisionsCursor !== null)) acknowledgmentInvalid()
  const ids = new Set<string>(), jobIds = new Set<string>()
  for (const raw of value.shots as unknown[]) {
    const shot = record(raw), id = string(shot.shotId)
    if (!id || ids.has(id) || !Number.isSafeInteger(shot.position) || Number(shot.position) < 0 || typeof shot.prompt !== 'string'
      || typeof shot.durationSec !== 'number' || !Number.isFinite(shot.durationSec) || shot.durationSec <= 0 || !Array.isArray(shot.jobs)
      || !shot.sourceTimeline || typeof shot.sourceTimeline !== 'object' || Array.isArray(shot.sourceTimeline)) acknowledgmentInvalid()
    for (const rawJob of shot.jobs as unknown[]) {
      const job = record(rawJob)
      boundJob(job, value, shot)
      if (jobIds.has(string(job.id))) acknowledgmentInvalid()
      jobIds.add(string(job.id))
    }
    ids.add(id)
  }
  const revisions = value.revisions as unknown[]
  if (revisions.length > 20 || revisions.some(row => !string(record(row).id) || !Array.isArray(record(row).fields))
    || new Set(revisions.map(row => record(row).id)).size !== revisions.length) acknowledgmentInvalid()
}

function compatibleCapabilities(previous:RecordValue,next:RecordValue){
  const before=shotTextCapabilities(previous),after=shotTextCapabilities(next)
  if(!before||!after||before.actions.some(action=>!after.actions.includes(action)))acknowledgmentInvalid()
  if(before.revisionFeedback){
    const feedback=after.revisionFeedback
    if(!feedback||before.revisionFeedback.actions.some(action=>!feedback.actions.includes(action))||before.revisionFeedback.fields.some(field=>!feedback.fields.includes(field)))acknowledgmentInvalid()
  }
}

const progressStages=new Set(['reference_preparation','awaiting_assembly','ready_to_submit','submitting','video_generation','voiceover_generation','assembly','completed','failed'])
const projectStatuses=new Set(['draft','ready_for_review','processing','complete','failed'])
function progressCounts(value:unknown,total:number){
  const counts=record(value)
  if(counts.total!==total)return false
  const values=['queued','active','completed','failed'].map(key=>counts[key])
  return values.every(count=>Number.isSafeInteger(count)&&Number(count)>=0&&Number(count)<=total)&&values.reduce((sum:number,count)=>sum+Number(count),0)<=total
}
function validAssemblyProgress(value:unknown){
  const assembly=record(value)
  return string(assembly.status).length>0&&string(assembly.phase).length>0&&typeof assembly.percent==='number'&&Number.isFinite(assembly.percent)&&assembly.percent>=0&&assembly.percent<=100
}
function compatibleProjectState(previous:RecordValue,next:RecordValue,shotCount:number,allowReviewReset:boolean){
  const oldProgress=record(previous.progress),progress=record(next.progress)
  if(!projectStatuses.has(string(previous.status))||!projectStatuses.has(string(next.status))
    ||!progressStages.has(string(oldProgress.stage))||!progressStages.has(string(progress.stage))
    ||typeof oldProgress.completedUnits!=='number'||!Number.isFinite(oldProgress.completedUnits)
    ||!Number.isSafeInteger(oldProgress.totalUnits)
    ||typeof progress.completedUnits!=='number'||!Number.isFinite(progress.completedUnits)
    ||!Number.isSafeInteger(progress.totalUnits)
    ||Number(oldProgress.completedUnits)<0||Number(progress.completedUnits)<0||Number(oldProgress.totalUnits)<1
    ||progress.totalUnits!==oldProgress.totalUnits||Number(oldProgress.completedUnits)>Number(oldProgress.totalUnits)||Number(progress.completedUnits)>Number(progress.totalUnits)
    ||typeof oldProgress.overallPercent!=='number'||!Number.isFinite(oldProgress.overallPercent)
    ||typeof progress.overallPercent!=='number'||!Number.isFinite(progress.overallPercent)
    ||Number(oldProgress.overallPercent)<0||Number(oldProgress.overallPercent)>100||Number(progress.overallPercent)<0||Number(progress.overallPercent)>100
    ||!progressCounts(oldProgress.shots,shotCount)||!progressCounts(progress.shots,shotCount)
    ||typeof record(oldProgress.voiceover).enabled!=='boolean'||typeof record(progress.voiceover).enabled!=='boolean'
    ||record(oldProgress.voiceover).enabled!==record(progress.voiceover).enabled
    ||record(oldProgress.voiceover).total!==shotCount||record(progress.voiceover).total!==shotCount
    ||!Number.isSafeInteger(record(oldProgress.voiceover).completed)||!Number.isSafeInteger(record(progress.voiceover).completed)
    ||Number(record(oldProgress.voiceover).completed)<0||Number(record(oldProgress.voiceover).completed)>shotCount
    ||Number(record(progress.voiceover).completed)<0||Number(record(progress.voiceover).completed)>shotCount
    ||!timestamp(oldProgress.updatedAt)||!timestamp(progress.updatedAt)
    ||oldProgress.assembly!==undefined&&!validAssemblyProgress(oldProgress.assembly)
    ||progress.assembly!==undefined&&!validAssemblyProgress(progress.assembly)
    ||oldProgress.assembly!==undefined&&progress.assembly===undefined)acknowledgmentInvalid()
  if(previous.status!==next.status&&(!allowReviewReset||next.status!=='ready_for_review'))acknowledgmentInvalid()
  if(!allowReviewReset){
    const stable=(value:RecordValue)=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='updatedAt'))
    if(!sameJson(stable(oldProgress),stable(progress)))acknowledgmentInvalid()
  }
}

function compatibleAssembly(previous:RecordValue,next:RecordValue){
  const mutable=new Set(['status','phase','overallPercent','updatedAt','error','outputs'])
  const fixed=(value:RecordValue)=>Object.fromEntries(Object.entries(value).filter(([key])=>!mutable.has(key)))
  if(!sameJson(fixed(previous),fixed(next)))acknowledgmentInvalid()
  const transitions:Record<string,readonly string[]>={queued:['queued','processing','completed','failed'],processing:['processing','completed','failed'],completed:['completed'],failed:['failed']}
  if(previous.status!==undefined&&(!Object.hasOwn(transitions,string(previous.status))||!transitions[string(previous.status)].includes(string(next.status))))acknowledgmentInvalid()
  const oldOutputs=Array.isArray(previous.outputs)?previous.outputs:[],outputs=Array.isArray(next.outputs)?next.outputs:[]
  if(oldOutputs.length>outputs.length)acknowledgmentInvalid()
  const urls=new Set(outputs.map(output=>record(output).url))
  if(oldOutputs.some(output=>outputUrl(record(output).url)&&!urls.has(record(output).url)))acknowledgmentInvalid()
}

function compatibleRevisionHistory(previous:RecordValue,next:RecordValue,newRevisionId?:unknown){
  const before=previous.revisions as RecordValue[],after=next.revisions as RecordValue[]
  const beforeIds=new Set(before.map(row=>row.id)),added=after.filter(row=>!beforeIds.has(row.id))
  if(typeof newRevisionId==='string'||added.length){
    const addedId=typeof newRevisionId==='string'?newRevisionId:added[0]?.id
    if(!addedId||added.length!==1||added[0]?.id!==addedId||beforeIds.has(addedId)||after[0]?.id!==addedId)acknowledgmentInvalid()
    const rollsOver=before.length===20||previous.revisionsHasMore===true
    const expectedRetained=rollsOver?before.slice(0,-1):before
    if(after.length!==expectedRetained.length+1||next.revisionsHasMore!==rollsOver
      ||rollsOver&&next.revisionsCursor===previous.revisionsCursor
      ||!sameJson(after.slice(1),expectedRetained))acknowledgmentInvalid()
    return true
  }
  if(!sameJson(after,before)||next.revisionsHasMore!==previous.revisionsHasMore||next.revisionsCursor!==previous.revisionsCursor)acknowledgmentInvalid()
  return false
}

function assertCompleteDraftReplacement(draft:unknown,previousDraft:unknown,projectId:string,brandId:string,shotId:string,supported:(draft:RecordValue)=>boolean,target:(previous:RecordValue,next:RecordValue)=>void,options:{allowReviewReset?:boolean;newRevisionId?:unknown}={}){
  const value=record(draft),previous=record(previousDraft)
  completeDraft(previous,projectId,brandId,supported)
  completeDraft(value,projectId,brandId,supported)
  const previousShots=previous.shots as RecordValue[],shots=value.shots as RecordValue[]
  if(value.createdBy!==previous.createdBy||value.language!==previous.language||value.generationMode!==previous.generationMode
    ||shots.length!==previousShots.length||shots.some((shot,index)=>shot.shotId!==previousShots[index].shotId||shot.position!==previousShots[index].position)
    ||previous.videoReceipt!==null&&value.videoReceipt===null||previous.input!==null&&value.input===null||previous.assemblyJob!==null&&value.assemblyJob===null)acknowledgmentInvalid()
  compatibleProjectState(previous,value,shots.length,options.allowReviewReset!==false)
  compatibleCapabilities(previous,value)
  const historyChanged=compatibleRevisionHistory(previous,value,options.newRevisionId)
  for(const key of ['audioSettings','referencePreparation','segments','jobSummary','createdAt','updatedAt','revisionsCursor','finalInvalidatedAt'])if(previous[key]!==undefined&&value[key]===undefined)acknowledgmentInvalid()
  for(const [index,shot] of shots.entries()){
    const old=previousShots[index]
    if(shot.shotId===shotId)target(old,shot);else compatibleShotRuntime(old,shot)
    for(const key of ['sourceTimeline','selectedClipJobId','generationRevision','subtitle','voiceoverText','textContractVersion','spokenText','captionMode','overlayText','textRevision','spokenTextHash','overlayTextHash'])if(old[key]!==undefined&&shot[key]===undefined)acknowledgmentInvalid()
    const jobIds=new Set((shot.jobs as unknown[]).map(job=>record(job).id))
    if((old.jobs as unknown[]).some(job=>!jobIds.has(record(job).id)))acknowledgmentInvalid()
    for(const oldJob of old.jobs as RecordValue[]){
      const job=record((shot.jobs as RecordValue[]).find(item=>item.id===oldJob.id))
      if(oldJob.status!==undefined&&job.status===undefined||record(oldJob.outputMedia).url!==undefined&&record(job.outputMedia).url!==record(oldJob.outputMedia).url)acknowledgmentInvalid()
    }
  }
  const oldReceipt=record(previous.videoReceipt),receipt=record(value.videoReceipt)
  for(const key of ['schemaVersion','projectId','brandId','ownerId','editorActorId'])if(oldReceipt[key]!==undefined&&receipt[key]!==oldReceipt[key])acknowledgmentInvalid()
  for(const key of ['issuedAt','signature','historyDigest','editorDigest'])if(oldReceipt[key]!==undefined&&typeof receipt[key]!=='string')acknowledgmentInvalid()
  if(oldReceipt.historyCursor!==undefined&&(receipt.historyCursor!==null&&typeof receipt.historyCursor!=='string'))acknowledgmentInvalid()
  if(Object.keys(receipt).length&&receipt.historyCursor!==value.revisionsCursor)acknowledgmentInvalid()
  if(historyChanged&&oldReceipt.historyDigest!==undefined&&(receipt.historyDigest===oldReceipt.historyDigest||receipt.signature===oldReceipt.signature))acknowledgmentInvalid()
  if(!sameJson(previous.input,value.input))acknowledgmentInvalid()
  const oldAssembly=record(previous.assemblyJob),assembly=record(value.assemblyJob)
  if(oldAssembly.id!==undefined)compatibleAssembly(oldAssembly,assembly)
  return {value,previous,previousShots,shots}
}

export function assertRevisionFeedbackDraftCompatibility(draft:unknown,previousDraft:unknown,input:{projectId:string;brandId:string;shotId:string;action:'save_scene'|'save_shot_text'|'save_feedback';fields:Array<'reasons'|'note'|'instruction'|'candidateAdopted'>;provenance:RecordValue}){
  const supported=(value:RecordValue)=>input.fields.every(field=>revisionFeedbackWriteSupported(value,input.action,field))
  const newRevisionId=record(record(draft).revisionFeedbackWrite).revisionId
  return assertCompleteDraftReplacement(draft,previousDraft,input.projectId,input.brandId,input.shotId,supported,(previous,next)=>{
    if(input.action==='save_shot_text')compatibleTargetShot(previous,next,'save_shot_text',{} as ShotTextPatch)
    else if(input.action==='save_scene'){
      const hasPrompt=Object.hasOwn(input.provenance,'prompt'),hasText=Object.hasOwn(input.provenance,'spokenText')
      if(!hasPrompt&&!hasText||hasText&&(!Object.hasOwn(input.provenance,'captionMode')||!Object.hasOwn(input.provenance,'overlayText')))acknowledgmentInvalid()
      if(hasPrompt&&next.prompt!==input.provenance.prompt||!hasPrompt&&next.prompt!==previous.prompt)acknowledgmentInvalid()
      if(hasText){
        if(next.spokenText!==input.provenance.spokenText||next.captionMode!==input.provenance.captionMode||next.overlayText!==input.provenance.overlayText)acknowledgmentInvalid()
        compatibleTargetShot(previous,{...next,prompt:previous.prompt,videoInvalidatedAt:previous.videoInvalidatedAt},'save_shot_text',{} as ShotTextPatch)
      }else{
        compatibleShotRuntime(previous,{...next,prompt:previous.prompt})
        for(const key of ['jobs','selectedClipJobId','generationRevision','referencePreparation'])if(!sameJson(previous[key],next[key]))acknowledgmentInvalid()
      }
      const promptChanged=hasPrompt&&next.prompt!==previous.prompt
      if(promptChanged&&!timestamp(next.videoInvalidatedAt)||!promptChanged&&!sameJson(next.videoInvalidatedAt,previous.videoInvalidatedAt))acknowledgmentInvalid()
    }else compatibleShotRuntime(previous,next)
  },{allowReviewReset:input.action!=='save_feedback',newRevisionId})
}

/** A legacy Content service may ignore unknown actions. Never accept its no-op as a save. */
export function assertShotTextWriteAcknowledgment(draft: unknown, projectId: string, shotId: string, action: ShotTextAction, patch: ShotTextPatch | LegacyTextClassification, previousDraft: unknown, brandId: string) {
  const value = record(draft), previous = record(previousDraft), ack = record(value.shotTextWrite)
  if (ack.schemaVersion !== 'shot-text-write@1' || ack.applied !== true || ack.action !== action || ack.shotId !== shotId) throw new Error('shot_text_acknowledgment_required')
  const {previousShots}=assertCompleteDraftReplacement(value,previous,projectId,brandId,shotId,candidate=>shotTextWriteSupported(candidate,action),(before,next)=>compatibleTargetShot(before,next,action,patch))
  const shot = Array.isArray(value.shots) ? value.shots.find(item => record(item).shotId === shotId) : undefined
  const canonical = videoShotText({ ...record(shot), language: record(shot).language ?? value.language })
  if (value.id !== projectId || canonical.contractVersion !== 2) throw new Error('shot_text_acknowledgment_invalid')
  if (action === 'save_shot_text') {
    const save = patch as ShotTextPatch
    if (canonical.spokenText !== save.spokenText || canonical.captionMode !== save.captionMode || canonical.overlayText !== save.overlayText
      || canonical.textRevision < save.expectedTextRevision) throw new Error('shot_text_acknowledgment_invalid')
    {
      const oldShot = previousShots.find(item => item.shotId === shotId)
      const before = videoShotText({ ...oldShot, language: oldShot?.language ?? previous.language })
      if (before.contractVersion !== 2 || canonical.language !== before.language
        || canonical.textRevision !== before.textRevision + Number(canonical.spokenText !== before.spokenText)
        || canonical.spokenText === before.spokenText && canonical.spokenTextHash !== before.spokenTextHash
        || canonical.overlayText === before.overlayText && canonical.overlayTextHash !== before.overlayTextHash) throw new Error('shot_text_acknowledgment_invalid')
    }
  } else if (canonical.legacyTextStatus !== 'legacy_confirmed' || ack.legacyTextChoice !== (patch as LegacyTextClassification).legacyTextChoice) throw new Error('shot_text_acknowledgment_invalid')
}
