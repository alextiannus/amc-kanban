export type VideoWorkspaceSurface = 'content_creative' | 'asset_library' | 'video_preparation' | 'background_jobs'

export const VIDEO_WORKSPACE_STATE_VERSION = 2 as const
export const VIDEO_WORKSPACE_STATE_TTL_MS = 24 * 60 * 60 * 1000
export const VIDEO_WORKSPACE_STATE_MAX_BYTES = 128 * 1024
// Session snapshots are deliberately small and short lived: at most 24 hours,
// 128 KiB, 30 referenced assets, and 100 scene edits. Binary/data URLs are
// never persisted; the workspace restores only bounded text and remote refs.
const MAX_ASSETS = 30
const MAX_EDITS = 100
const MAX_TEXT = 20_000

export type VideoWorkspacePreparationDraft = {
  script: string
  assets: unknown[]
  platforms: string[]
  duration: number
  templateId: string
}

export type VideoWorkspaceReturnContext = {
  version: 1
  surface: VideoWorkspaceSurface
  brandId: string
  projectId: string
  creativeId: string | null
  subPage: string | null
  filterState: Record<string, string | string[]>
  scrollAnchor: string | null
  preparationDraftId: string | null
  preparationDraft: VideoWorkspacePreparationDraft | null
  stage: number | null
  selectedShotId: string | null
  capturedAt: string
}

export type VideoWorkspaceStateInput = {
  actorId: string
  brandId: string
  projectId: string
  projectRevision: string | null
  stage: number | null
  selectedShotId: string | null
  preparationDraft: VideoWorkspacePreparationDraft | null
  unsavedEdits: Record<string, unknown> | null
}

export type VideoWorkspaceState = VideoWorkspaceStateInput & {
  version: typeof VIDEO_WORKSPACE_STATE_VERSION
  savedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'length' | 'key'>>
type StateOptions = {now?: number;projectRevision?:string|null;validSceneIds?:string[]}

const surfaces = new Set<VideoWorkspaceSurface>(['content_creative', 'asset_library', 'video_preparation', 'background_jobs'])
const text = (value: unknown, max=256) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null
const stage = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3 ? Number(value) : null
const byteLength = (value:string) => new TextEncoder().encode(value).byteLength
const filterState = (value: unknown): Record<string, string | string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, string | string[]> = {}
  for (const [key, candidate] of Object.entries(value).slice(0, 30)) {
    if (key.length > 100) continue
    if (typeof candidate === 'string' && candidate.length <= 1_000) output[key] = candidate
    else if (Array.isArray(candidate) && candidate.length <= 30 && candidate.every(item => typeof item === 'string' && item.length <= 1_000)) output[key] = [...candidate]
  }
  return output
}

const prepareDraft = (value: unknown): {ok:boolean;value:VideoWorkspacePreparationDraft|null} => {
  if (value === null || value === undefined) return {ok:true,value:null}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {ok:false,value:null}
  const draft = value as Partial<VideoWorkspacePreparationDraft>
  if (typeof draft.script !== 'string' || draft.script.length > MAX_TEXT || !Array.isArray(draft.assets) || draft.assets.length > MAX_ASSETS || !Array.isArray(draft.platforms) || draft.platforms.length > 8 || !draft.platforms.every(item => typeof item === 'string' && item.length <= 64) || typeof draft.duration !== 'number' || !Number.isFinite(draft.duration) || draft.duration < 0 || draft.duration > 600 || typeof draft.templateId !== 'string' || draft.templateId.length > 256) return {ok:false,value:null}
  const assets=[] as Array<Record<string,unknown>>
  for(const candidate of draft.assets){
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return {ok:false,value:null}
    const asset=candidate as Record<string,unknown>
    const id=text(asset.id,256),url=text(asset.url,2048),mimeType=text(asset.mimeType,128)
    if(!id||!url||!mimeType||/^data:/i.test(url)||/;base64,/i.test(url))return {ok:false,value:null}
    const aiCaption=asset.aiCaption==null?null:typeof asset.aiCaption==='string'&&asset.aiCaption.length<=2_000?asset.aiCaption:null
    if(asset.aiCaption!=null&&aiCaption===null)return {ok:false,value:null}
    const aiTags=asset.aiTags==null?null:Array.isArray(asset.aiTags)&&asset.aiTags.length<=20&&asset.aiTags.every(item=>typeof item==='string'&&item.length<=100)?asset.aiTags:null
    if(asset.aiTags!=null&&aiTags===null)return {ok:false,value:null}
    assets.push({id,url,mimeType,selected:Boolean(asset.selected),...(aiCaption!==null?{aiCaption}:{}),...(aiTags!==null?{aiTags:[...aiTags]}:{})})
  }
  return {ok:true,value:{script:draft.script,assets,platforms:[...draft.platforms],duration:draft.duration,templateId:draft.templateId}}
}

const prepareEdits = (value:unknown,validSceneIds?:Set<string>):{ok:boolean;value:Record<string,unknown>|null} => {
  if(value===null||value===undefined)return {ok:true,value:null}
  if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false,value:null}
  const entries=Object.entries(value)
  if(entries.length>MAX_EDITS)return {ok:false,value:null}
  const output:Record<string,unknown>={}
  for(const [sceneId,candidate] of entries){
    if(!text(sceneId,256)||!candidate||typeof candidate!=='object'||Array.isArray(candidate))return {ok:false,value:null}
    if(validSceneIds&&!validSceneIds.has(sceneId))continue
    const fields:Record<string,unknown>={}
    for(const [key,field] of Object.entries(candidate as Record<string,unknown>).slice(0,20)){
      if(typeof field==='string'){
        if(field.length>MAX_TEXT)return {ok:false,value:null}
        fields[key]=field
      }else if(typeof field==='boolean')fields[key]=field
      else if(Array.isArray(field)){
        if(field.length>30||!field.every(item=>typeof item==='string'&&item.length<=200))return {ok:false,value:null}
        fields[key]=[...field]
      }
    }
    output[sceneId]=fields
  }
  return {ok:true,value:Object.keys(output).length?output:null}
}

export function captureVideoReturnContext(input: Omit<VideoWorkspaceReturnContext, 'version' | 'capturedAt'> & {capturedAt?: string}): VideoWorkspaceReturnContext {
  const brandId = text(input.brandId)
  const projectId = text(input.projectId)
  if (!brandId) throw new Error('video_return_brand_required')
  if (!projectId) throw new Error('video_return_project_required')
  if (!surfaces.has(input.surface)) throw new Error('video_return_surface_invalid')
  const draft=prepareDraft(input.preparationDraft)
  return {
    version: 1, surface: input.surface, brandId, projectId,
    creativeId: text(input.creativeId), subPage: text(input.subPage), filterState: filterState(input.filterState),
    scrollAnchor: text(input.scrollAnchor,1_000), preparationDraftId: text(input.preparationDraftId),
    preparationDraft: draft.ok?draft.value:null, stage: stage(input.stage), selectedShotId: text(input.selectedShotId),
    capturedAt: input.capturedAt || new Date().toISOString(),
  }
}

export type VideoWorkspaceRestoreResult = {
  surface: VideoWorkspaceSurface
  activeSubPage: 'ai_workspace' | 'calendar' | 'assets' | null
  uploadJourneyStep: 'media_ready' | null
  creativeId: string | null
  filterState: Record<string, string | string[]>
  scrollAnchor: string | null
  preparationDraft: VideoWorkspacePreparationDraft | null
  stage: number | null
  selectedShotId: string | null
  backgroundJobs: unknown[]
  fallback: 'content_creative' | null
}

export function restoreVideoReturnContext(context: VideoWorkspaceReturnContext | null | undefined, options: {currentBrandId: string; sourceExists?: boolean; backgroundJob?: unknown} = {currentBrandId: ''}): VideoWorkspaceRestoreResult {
  const unavailable = !context || context.version !== 1 || context.brandId !== options.currentBrandId || options.sourceExists === false
  const fallback: VideoWorkspaceRestoreResult = {surface:'content_creative',activeSubPage:'ai_workspace',uploadJourneyStep:null,creativeId:null,filterState:{},scrollAnchor:null,preparationDraft:null,stage:null,selectedShotId:null,backgroundJobs:options.backgroundJob?[options.backgroundJob]:[],fallback:'content_creative'}
  if (unavailable) return fallback
  const common={surface:context.surface,creativeId:context.creativeId,filterState:{...context.filterState},scrollAnchor:context.scrollAnchor,preparationDraft:context.preparationDraft,stage:context.stage,selectedShotId:context.selectedShotId,backgroundJobs:options.backgroundJob?[options.backgroundJob]:[],fallback:null}
  if(context.surface==='asset_library')return {...common,activeSubPage:'assets',uploadJourneyStep:null}
  if(context.surface==='video_preparation')return {...common,activeSubPage:null,uploadJourneyStep:'media_ready'}
  if(context.surface==='content_creative'&&context.subPage==='calendar')return {...common,activeSubPage:'calendar',uploadJourneyStep:null}
  return {...common,activeSubPage:'ai_workspace',uploadJourneyStep:null}
}

const encodeKeyPart = (value:string)=>encodeURIComponent(value)
const accountPrefix = (actorId:string)=>`amc-video-workspace:v2:${encodeKeyPart(actorId)}:`
export const videoWorkspaceStateKey = (actorId:string,brandId:string,projectId:string)=>`${accountPrefix(actorId)}${encodeKeyPart(brandId)}:${encodeKeyPart(projectId)}`

let fallbackDraftSequence=0
export function createVideoPreparationDraftId(uuidFactory?:()=>string):string{
  let id=''
  try{id=(uuidFactory?uuidFactory():globalThis.crypto?.randomUUID?.())||''}catch{}
  if(!id)id=`${Date.now().toString(36)}_${++fallbackDraftSequence}`
  return `prep_${id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)}`
}

export function saveVideoWorkspaceState(storage:StorageLike,stateValue:VideoWorkspaceStateInput,options:Pick<StateOptions,'now'>={}):boolean{
  try{
    const actorId=text(stateValue.actorId),brandId=text(stateValue.brandId),projectId=text(stateValue.projectId)
    if(!actorId||!brandId||!projectId)return false
    const draft=prepareDraft(stateValue.preparationDraft),edits=prepareEdits(stateValue.unsavedEdits)
    if(!draft.ok||!edits.ok)return false
    const value:VideoWorkspaceState={version:VIDEO_WORKSPACE_STATE_VERSION,savedAt:options.now??Date.now(),actorId,brandId,projectId,projectRevision:text(stateValue.projectRevision),stage:stage(stateValue.stage),selectedShotId:text(stateValue.selectedShotId),preparationDraft:draft.value,unsavedEdits:edits.value}
    const serialized=JSON.stringify(value)
    if(byteLength(serialized)>VIDEO_WORKSPACE_STATE_MAX_BYTES)return false
    storage.setItem(videoWorkspaceStateKey(actorId,brandId,projectId),serialized)
    return true
  }catch{return false}
}

export function loadVideoWorkspaceState(storage:StorageLike,actorId:string,brandId:string,projectId:string,options:StateOptions={}):VideoWorkspaceState|null{
  try{
    if(!text(actorId)||!text(brandId)||!text(projectId))return null
    const raw=storage.getItem(videoWorkspaceStateKey(actorId,brandId,projectId))
    if(!raw||byteLength(raw)>VIDEO_WORKSPACE_STATE_MAX_BYTES)return null
    const value=JSON.parse(raw) as Partial<VideoWorkspaceState>
    const now=options.now??Date.now()
    if(value.version!==VIDEO_WORKSPACE_STATE_VERSION||value.actorId!==actorId||value.brandId!==brandId||value.projectId!==projectId||typeof value.savedAt!=='number'||!Number.isFinite(value.savedAt)||value.savedAt>now+5*60_000||now-value.savedAt>VIDEO_WORKSPACE_STATE_TTL_MS)return null
    const expectedRevision=options.projectRevision===undefined?undefined:text(options.projectRevision)
    if(expectedRevision!==undefined&&text(value.projectRevision)!==expectedRevision)return null
    const draft=prepareDraft(value.preparationDraft),validSceneIds=options.validSceneIds?new Set(options.validSceneIds):undefined,edits=prepareEdits(value.unsavedEdits,validSceneIds)
    if(!draft.ok||!edits.ok)return null
    const selected=text(value.selectedShotId)
    return {version:VIDEO_WORKSPACE_STATE_VERSION,savedAt:value.savedAt,actorId,brandId,projectId,projectRevision:text(value.projectRevision),stage:stage(value.stage),selectedShotId:selected&&(!validSceneIds||validSceneIds.has(selected))?selected:null,preparationDraft:draft.value,unsavedEdits:edits.value}
  }catch{return null}
}

export function clearVideoWorkspaceState(storage:StorageLike,actorId:string,brandId:string,projectId:string):boolean{
  try{storage.removeItem(videoWorkspaceStateKey(actorId,brandId,projectId));return true}catch{return false}
}

export function clearAccountVideoWorkspaceState(storage:StorageLike,actorId:string):number{
  try{
    const prefix=accountPrefix(actorId),keys:string[]=[]
    for(let index=0;index<(storage.length||0);index++){const key=storage.key?.(index);if(key?.startsWith(prefix))keys.push(key)}
    for(const key of keys)storage.removeItem(key)
    return keys.length
  }catch{return 0}
}

export function videoJobsForBrand<T extends {brandId:string}>(jobs:T[],brandId:string|undefined|null):T[]{
  if(!brandId)return []
  return jobs.filter(job=>job.brandId===brandId)
}
