'use client'
import {useEffect,useRef,useState} from 'react'
import {AlertCircle,History,Link2,Scale,X} from 'lucide-react'
import type {VideoEditorInput} from '@/vendor/mm-video/lib/video-editor'
import type {VideoRevision} from '@/vendor/mm-video/lib/video-revisions'
import {sceneMatchesSourceShot,videoFieldLabels,revisionMatchesScene} from '@/vendor/mm-video/lib/video-shot-lineage'
import CreativeSourceComparison,{type CreativeSource,type FidelityDimension,type SourceComparisonShot,type SourcePreservation} from '@/vendor/mm-video/components/dashboard/../creatives/CreativeSourceComparison'
import {videoButton} from '@/vendor/mm-video/components/dashboard/VideoWorkspaceShell'
import {exactComparisonEvidence,pinnedSourceMediaUrl} from '@/vendor/mm-video/lib/video-source-authority'

type LineageScene={id:string;title?:string;prompt:string;clipUrl?:string|null;spokenText?:string|null;overlayText?:string|null;sourceShotIds?:string[];relatedSceneIds?:string[]}
type QualityReview={status?:string;dimensions?:FidelityDimension[];attempts?:Array<{adapted?:{shots?:Array<{sourceShotId?:string;skuIds?:string[];sourcePreservation?:SourcePreservation}>}}>}
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{}
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:null
const fidelityKeys=new Set(['hook','narrative_order','selling_point_position','continuity','cta','diversity'])
function parseCreativeSource(value:unknown):CreativeSource|null{
 const row=object(value),timeline=Array.isArray(row.timeline)&&row.timeline.length<=100?row.timeline:null
 if(row.ok!==true||!text(row.brandId)||!text(row.creativeId)||!text(row.sourceRevision)||!text(row.sourceDigest||row.libraryDigest)||!['full_source','partial_source','source_unavailable'].includes(row.evidenceStatus)||!timeline)return null
 const shots=[] as CreativeSource['timeline']
 for(const candidate of timeline){const shot=object(candidate),id=text(shot.id),validTime=(entry:unknown)=>entry===null||typeof entry==='number'&&Number.isFinite(entry);if(!id||typeof shot.order!=='number'||!Number.isFinite(shot.order)||!validTime(shot.startSec)||!validTime(shot.endSec))return null;shots.push({...shot,id,order:shot.order,startSec:typeof shot.startSec==='number'?shot.startSec:null,endSec:typeof shot.endSec==='number'?shot.endSec:null})}
 const sourceEvidence=object(row.sourceEvidence)
 return {...row,brandId:row.brandId,creativeId:row.creativeId,evidenceStatus:row.evidenceStatus,internalDetailPath:text(row.internalDetailPath)||'',originalVideoUrl:text(row.originalVideoUrl),originalPostUrl:text(row.originalPostUrl),sourceEvidence:{originalText:typeof sourceEvidence.originalText==='string'?sourceEvidence.originalText:''},timeline:shots} as CreativeSource
}
function parseQualityReview(value:unknown):QualityReview|null{
 const row=object(value)
 if(row.version!==1||!['awaiting_review','repair_required','passed','needs_revision'].includes(row.status)||!Array.isArray(row.dimensions)||row.dimensions.length>6||!Array.isArray(row.attempts)||row.attempts.length>2)return null
 const dimensions:FidelityDimension[]=[]
 for(const candidate of row.dimensions){const dimension=object(candidate),structuredIds=dimension.sourceShotIds;if(!fidelityKeys.has(dimension.key)||!['passed','failed','not_applicable'].includes(dimension.status)||!Array.isArray(dimension.issues)||dimension.issues.length>12||dimension.issues.some((issue:unknown)=>typeof issue!=='string'||issue.length>2000)||structuredIds!==undefined&&(!Array.isArray(structuredIds)||structuredIds.length>100||structuredIds.some((id:unknown)=>!text(id))))return null;dimensions.push({key:dimension.key,status:dimension.status,issues:[...dimension.issues],...(structuredIds!==undefined?{sourceShotIds:[...structuredIds]}:{})})}
 const attempts=[] as NonNullable<QualityReview['attempts']>
 for(const candidate of row.attempts){const adapted=object(object(candidate).adapted),rawShots=Array.isArray(adapted.shots)&&adapted.shots.length<=100?adapted.shots:null;if(!rawShots)return null;const shots=[] as NonNullable<NonNullable<QualityReview['attempts']>[number]['adapted']>['shots'];for(const raw of rawShots){const shot=object(raw),sourceShotId=text(shot.sourceShotId),preservation=object(shot.sourcePreservation),changeReasons=Array.isArray(preservation.changeReasons)&&preservation.changeReasons.length<=12&&preservation.changeReasons.every((reason:unknown)=>typeof reason==='string'&&reason.length<=100)?preservation.changeReasons:[];if(!sourceShotId)return null;shots!.push({sourceShotId,skuIds:Array.isArray(shot.skuIds)?shot.skuIds.filter((id:unknown):id is string=>typeof id==='string').slice(0,20):[],sourcePreservation:{hookRole:['preserved','adapted','not_applicable'].includes(preservation.hookRole)?preservation.hookRole:undefined,narrativeRole:['preserved','adapted'].includes(preservation.narrativeRole)?preservation.narrativeRole:undefined,pacingRole:['preserved','adapted'].includes(preservation.pacingRole)?preservation.pacingRole:undefined,changeReasons:[...changeReasons]}})}attempts.push({adapted:{shots}})}
 return {status:row.status,dimensions,attempts}
}
const issueNamesShot=(issue:string,shotId:string)=>{
 const escaped=shotId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
 return Boolean(shotId)&&new RegExp(`(^|[^\\p{L}\\p{N}_/.-])${escaped}(?=$|[^\\p{L}\\p{N}_/.-])`,'u').test(issue)
}
function pinnedSourceMatches(fresh:CreativeSource,pinned:Record<string,any>,brandId:string,creativeId:string){
 const freshDigest=text(fresh.sourceDigest||fresh.libraryDigest),pinnedDigest=text(pinned.sourceDigest||pinned.libraryDigest||pinned.digest)
 const freshRevision=text(fresh.sourceRevision),pinnedRevision=text(pinned.sourceRevision||pinned.version)
 return fresh.brandId===brandId&&fresh.creativeId===creativeId&&fresh.evidenceStatus==='full_source'&&pinned.evidenceStatus==='full_source'&&Boolean(freshDigest&&pinnedDigest&&freshDigest===pinnedDigest&&freshRevision&&pinnedRevision&&freshRevision===pinnedRevision)&&(!text(pinned.inspirationCreativeId)||fresh.inspirationCreativeId===pinned.inspirationCreativeId)
}

export default function VideoCreativeLineage({jobId,editor,scene,revisions=[],hasMore=false,isEn=false}:{jobId?:string;editor?:VideoEditorInput;scene?:LineageScene;revisions?:VideoRevision[];hasMore?:boolean;isEn?:boolean}){
  const t=(zh:string,en:string)=>isEn?en:zh
  const label=(key:string)=>videoFieldLabels[key]?.[isEn?1:0]||t('其他修改','Other change')
  const matched=(editor?.shotMappings||[]).filter(mapping=>scene&&sceneMatchesSourceShot(scene,mapping.sourceShotId))
  const source=editor?.sourceReference
  const selected=editor?.skuDecision?.recommendations?.filter((sku:any)=>editor.skuDecision?.selectedSkuIds?.includes(sku.skuId))||[]
  const [page,setPage]=useState<{items:VideoRevision[];hasMore:boolean;nextCursor:string|null}|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [allScenes,setAllScenes]=useState(false),[comparisonOpen,setComparisonOpen]=useState(false)
  const [comparisonBusy,setComparisonBusy]=useState(false),[comparisonError,setComparisonError]=useState('')
  const [comparisonSource,setComparisonSource]=useState<CreativeSource|null>(null),[quality,setQuality]=useState<QualityReview|null>(null)
  const dialogRef=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null)
  useEffect(()=>{setPage(null);setError('')},[jobId,revisions])
  useEffect(()=>{setComparisonSource(null);setQuality(null);setComparisonError('');setComparisonOpen(false)},[jobId,scene?.id])
  useEffect(()=>{if(!comparisonOpen)return;const dialog=dialogRef.current,previous=returnFocus.current;const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),video[controls],[tabindex="0"]')||[]);focusable()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setComparisonOpen(false)}else if(event.key==='Tab'){const items=focusable(),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};dialog?.addEventListener('keydown',key);return()=>{dialog?.removeEventListener('keydown',key);previous?.focus()}},[comparisonOpen])
  async function loadHistory(cursor?:string|null){
    setBusy(true);setError('')
    try{const response=await fetch(`/api/video-editor/jobs?${new URLSearchParams({id:jobId!,action:'revisions',...(cursor?{cursor}:{})})}`,{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||t('读取失败','Unable to read history'));setPage(result)}catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}
  }
  async function openComparison(){
    returnFocus.current=document.activeElement as HTMLElement;setComparisonOpen(true);setComparisonBusy(true);setComparisonError('');setComparisonSource(null);setQuality(null)
    try{
      const brandId=text(editor?.brandId),creativeId=text(editor?.creativeId),revisionId=text(editor?.creativeRevisionId),month=text(editor?.sourceMonth),sourceShotId=scene?.sourceShotIds?.length===1?scene.sourceShotIds[0]:null
      if(!brandId||!creativeId||!revisionId||!month||!source||!sourceShotId)throw Error('source_evidence_missing')
      const base=`/api/brands/${encodeURIComponent(brandId)}/content-creatives/${encodeURIComponent(creativeId)}`
      const [sourceResponse,revisionResponse]=await Promise.all([fetch(`${base}/source?${new URLSearchParams({month})}`,{cache:'no-store'}),fetch(`${base}/revisions?${new URLSearchParams({month,revisionId})}`,{cache:'no-store'})])
      if(!sourceResponse.ok||!revisionResponse.ok)throw Error('source_evidence_missing')
      const [rawSource,revisionPage]=await Promise.all([sourceResponse.json(),revisionResponse.json()]),fresh=parseCreativeSource(rawSource)
      if(!fresh||!pinnedSourceMatches(fresh,source,brandId,creativeId))throw Error('source_evidence_missing')
      const exact=exactComparisonEvidence(revisionPage,{brandId,creativeId,creativeRevisionId:revisionId,sourceMonth:month,pinnedSource:source,pinnedSkuDecision:editor?.skuDecision,freshSource:fresh,sourceShotId})
      const sourceMedia=pinnedSourceMediaUrl({brandId,creativeId,sourceMonth:month,reportedUrl:fresh.originalVideoUrl})
      if(!exact||!sourceMedia)throw Error('source_evidence_missing')
      const parsedQuality=parseQualityReview(object(exact.ai).qualityReview)
      setComparisonSource({...fresh,originalVideoUrl:sourceMedia});setQuality(parsedQuality)
    }catch{setComparisonError(t('来源证据不足','Insufficient source evidence'))}finally{setComparisonBusy(false)}
  }
  const sourceShotId=scene?.sourceShotIds?.length===1?scene.sourceShotIds[0]:null
  const reviewShot=quality?.attempts?.at(-1)?.adapted?.shots?.find(shot=>shot.sourceShotId===sourceShotId)
  const firstSourceShotId=comparisonSource?.timeline[0]?.id
  const boundDimensions=(quality?.dimensions||[]).map(dimension=>{
    const structured=dimension.sourceShotIds
    const issues=(dimension.issues||[]).filter(issue=>{
      if(structured!==undefined)return Boolean(sourceShotId&&structured.includes(sourceShotId))
      if(issue==='source_opening_hook_missing')return sourceShotId===firstSourceShotId
      return Boolean(sourceShotId&&issueNamesShot(issue,sourceShotId))
    })
    return {...dimension,issues}
  }).filter(dimension=>dimension.status==='failed'&&dimension.issues.length)
  const recommendations=(editor?.skuDecision?.recommendations||[]).filter((sku:any)=>editor?.skuDecision?.selectedSkuIds?.includes(sku.skuId)&&Array.isArray(sku.sourceShotIds)&&sourceShotId&&sku.sourceShotIds.includes(sourceShotId))
  const comparison:SourceComparisonShot|null=scene&&sourceShotId?{id:scene.id,title:scene.title,prompt:scene.prompt,clipUrl:scene.clipUrl,spokenText:scene.spokenText,overlayText:scene.overlayText,sourceShotIds:[sourceShotId],skus:recommendations.map((sku:any)=>({id:sku.skuId,name:sku.skuName||sku.skuId,roles:Array.isArray(sku.roles)?sku.roles:[],rationale:text(sku.rationale)||undefined})),preservation:reviewShot?.sourcePreservation||null,dimensions:boundDimensions,reviewStatus:quality?.status||null}:null
  return <section aria-label={t('创意与分镜来源','Creative and scene lineage')} className="mt-5 min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 [overflow-wrap:anywhere]">
    <h3 className="flex items-center gap-2 font-semibold text-slate-800"><Link2 size={15}/>{t('创意与分镜来源','Creative and scene lineage')}</h3>
    {(!editor?.creativeRevisionId||editor.lineageWarning)&&<p className="mt-2 flex gap-2 text-amber-800"><AlertCircle size={15} className="mt-1 shrink-0"/>{t('历史来源证据不完整，版本与对应关系待确认。','Historical source evidence is incomplete. Version and mappings need confirmation.')}</p>}
    {editor?.creativeRevisionId&&<p className="mt-2 text-slate-500">{t('创意版本','Creative revision')} <span className="font-mono">{editor.creativeRevisionId}</span></p>}
    <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-3">
      <div><h4 className="font-semibold">{t('原镜头作用','Original shot role')}</h4>{!matched.length&&<p className="text-amber-800">{t('未记录此分镜的来源对应关系','No source mapping recorded for this scene')}</p>}{matched.map(row=><p key={row.sourceShotId}>{row.sourceShotId} · {row.originalRole||t('待确认','Unconfirmed')}</p>)}</div>
      <div><h4 className="font-semibold">{t('当前分镜','Current scene')}</h4><p className="whitespace-pre-wrap">{scene?.prompt||t('待确认','Unconfirmed')}</p></div>
      <div><h4 className="font-semibold">{t('已选 SKU','Selected SKUs')}</h4>{selected.length?selected.map((sku:any)=><p key={sku.skuId}>{sku.skuName||sku.skuId} · {(sku.roles||[]).join(' / ')}</p>):<p className="text-slate-500">{t('未记录 SKU 决策','No SKU decision recorded')}</p>}</div>
    </div>
    <button type="button" className={`${videoButton} mt-3`} onClick={()=>void openComparison()}><Scale size={15}/>{t('打开来源对比','Open source comparison')}</button>
    <details className="mt-3"><summary className={`${videoButton} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600`}><History size={15}/>{t('修改记录','Revision history')} · {revisions.length}{hasMore?'+':''}</summary>
      {scene&&<div className="mt-2 flex gap-2"><button type="button" className={videoButton} aria-pressed={!allScenes} onClick={()=>setAllScenes(false)}>{t('当前分镜记录','This scene')}</button><button type="button" className={videoButton} aria-pressed={allScenes} onClick={()=>setAllScenes(true)}>{t('全部分镜记录','All scenes')}</button></div>}
      {!page&&revisions.some(row=>(row as any).summary)&&<p>{t('以下为修改摘要；完整文字按页读取，原记录未截断。','Summaries shown below. Read full text by page; original records are retained.')}</p>}
      <ol className="mt-3 space-y-3">{(page?.items||revisions).filter(row=>revisionMatchesScene(row,allScenes?undefined:scene)).map(row=><li key={row.id} className="border-l-2 border-slate-200 pl-3">
        <p>{row.method==='video_regenerate'?t('确认重做','Confirmed regeneration'):t('文字修改','Text edit')} · {row.actorId||t('修改人待确认','Actor unconfirmed')}</p><p className="text-slate-500">{row.createdAt||''} · {t('渲染版本','Render version')} {row.renderVersion??t('待确认','Unconfirmed')}</p>
        <p>{row.reasons?.map(label).join(' / ')}{row.note?` · ${row.note}`:''}</p>{row.instruction&&<p>{t('AI 修改要求','AI instruction')}：{row.instruction}</p>}
        {row.fields?.map(field=><div key={field.field}><span className="text-slate-500">{label(field.field)}</span><p className="whitespace-pre-wrap">{String(field.before??'')} → {String(field.after??'')}{(row as any).summary&&<span> {t('（摘要）','(summary)')}</span>}</p></div>)}
      </li>)}</ol>
      {hasMore&&!page&&<p className="mt-2 text-slate-500">{t('还有更早记录；完整历史可按页读取。','Earlier entries remain available in full history pages.')}</p>}
      {jobId&&<div className="mt-2 flex flex-wrap gap-2"><button type="button" className={videoButton} disabled={busy} onClick={()=>loadHistory()}>{t('读取完整历史','Read full history')}</button>{page?.hasMore&&<button type="button" className={videoButton} disabled={busy} onClick={()=>loadHistory(page.nextCursor)}>{t('更早一页','Earlier page')}</button>}</div>}
      {error&&<p role="alert" className="text-amber-800">{error}</p>}
    </details>
    {comparisonOpen&&<div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={event=>{if(event.target===event.currentTarget)setComparisonOpen(false)}}><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('来源与品牌分镜对比','Source and adapted shot comparison')} className="max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-slate-100 p-4 text-slate-900 shadow-2xl sm:rounded-3xl sm:p-5 motion-reduce:scroll-auto"><header className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mt-5 sm:px-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{t('来源证据轨道','Source evidence track')}</p><h2 className="mt-1 text-base font-semibold">{t('来源与品牌分镜对比','Source and adapted shot comparison')}</h2></div><button type="button" aria-label={t('关闭来源对比','Close source comparison')} className={`${videoButton} shrink-0 px-3`} onClick={()=>setComparisonOpen(false)}><X size={17}/></button></header>{comparisonBusy?<p role="status" className="rounded-2xl bg-white p-5 text-sm text-slate-500">{t('正在读取品牌授权的来源记录…','Loading the brand-authorized source record…')}</p>:comparisonError||!comparisonSource||!comparison?<div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900"><p className="font-semibold">{t('来源证据不足','Insufficient source evidence')}</p><p className="mt-1">{t('无法核对固定来源版本、原分镜或品牌新分镜，对应内容保持待确认。','The pinned source version, original shot, or adapted brand shot could not be verified. The missing comparison remains unconfirmed.')}</p></div>:<CreativeSourceComparison source={comparisonSource} error="" shotId={sourceShotId!} onShot={()=>{}} english={isEn} comparison={comparison} embedded/>}</div></div>}
  </section>
}
