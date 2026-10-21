export interface VideoEditorInput {
  scriptReview?:{policy:'merchant-script-v1';language:string}
  materialDecision?:import('@/vendor/mm-video/lib/video-material-bindings').VideoMaterialBindings
  variantRootJobId?:string
  variantParentJobId?:string
  variantKey?:string
  language?: import('@/vendor/mm-video/lib/video-languages').VideoLanguage

  originVideoJobId?:string|null
  generationLanguages?: import('@/vendor/mm-video/lib/video-languages').ScriptLanguage[]
  targetPlatforms?: string[]
  missingAssetIds?: string[]
  brandId: string
  script: string
  submittedScript?: string
  templateId: string | null
  targetDurationSec: number
  creativeId: string | null
  creativeRevisionId?: string | null
  sourceMonth?: string | null
  sourceReference?: Record<string, any> | null
  skuDecision?: Record<string, any> | null
  shotMappings?: Array<{sourceShotId:string;originalRole:string|null;originalShot?:Record<string,any>;selectedSkuIds:string[]}>
  lineageWarning?: string | null
  musicPrompt?: string | null
  assets: Array<{id:string;url:string;mimeType:string;aiCaption?:string|null}>
}

export interface VideoDraftReference {
  revisions?: import('@/vendor/mm-video/lib/video-revisions').VideoRevision[]
  revisionsHasMore?: boolean
  jobId?: string | null
  videoProjectId?: string | null
  editor: VideoEditorInput
}
export function videoEditorInput(job: {id?:string;brandId:string;idea:string;platform?:string;creativeId?:string|null;musicBrief?:string|null;selectedMusicPrompt?:string|null;editor?:VideoEditorInput;scenes:Array<{assetIds:string[];mediaUrls:string[]}>}):VideoEditorInput {
 if(job.editor)return job.editor.creativeRevisionId?job.editor:{...job.editor,originVideoJobId:job.editor.originVideoJobId||job.id,lineageWarning:'legacy_evidence_missing'}
 const ids=new Set<string>(),assets:VideoEditorInput['assets']=[]
 for(const scene of job.scenes||[])(scene.assetIds||[]).forEach((id,index)=>{if(!ids.has(id)&&scene.mediaUrls?.[index]){ids.add(id);const url=scene.mediaUrls?.[index];assets.push({id,url,mimeType:/\.(mp4|mov|webm)(\?|$)/i.test(url)?'video/mp4':'image/jpeg'})}})
 return {originVideoJobId:job.id,lineageWarning:'legacy_evidence_missing',targetPlatforms:job.platform?[job.platform]:undefined,brandId:job.brandId,script:job.idea,templateId:null,targetDurationSec:10,creativeId:job.creativeId||null,musicPrompt:job.selectedMusicPrompt??job.musicBrief??null,assets}
}
