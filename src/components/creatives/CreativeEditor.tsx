'use client'
import {useEffect,useRef,useState} from 'react'
import {Download,Plus,Save,Sparkles,Trash2} from 'lucide-react'
import {revisionReasons,scriptForSourceShot} from '@/lib/creativeReviewContract'
import CreativeSourceComparison,{type CreativeSource} from './CreativeSourceComparison'
import CreativeSkuDecision,{type SkuRecommendation} from './CreativeSkuDecision'
import CreativeRevisionTimeline from './CreativeRevisionTimeline'

type Props={brandId:string;creativeId:string;month:string;english?:boolean;initialPanel?:string;onSaved?:(creative:any)=>void|Promise<void>;onProduce?:(creative:any)=>void|Promise<void>;onDownload?:(creative:any)=>void}
type Pending={kind:'save'|'adopt'|'sku'|'task'|'discard'|'schedule';url:string;body:any;attempted?:boolean;result?:any}
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-40'
const field='mt-2 block w-full min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600'
const terminal=(v:string)=>['succeeded','failed','cancelled','interrupted'].includes(v)
async function api(url:string,body?:unknown,signal?:AbortSignal){const r=await fetch(url,{cache:'no-store',signal:signal||AbortSignal.timeout(25000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error||'request_failed'),{status:r.status});return value}
const stored=(key:string)=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}}
const persist=(key:string,value:unknown)=>{try{value===null?sessionStorage.removeItem(key):sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
export default function CreativeEditor(props:Props){return <ScriptReview key={`${props.brandId}:${props.month}:${props.creativeId}`} {...props}/>}
function ScriptReview({brandId,creativeId,month,english=false,initialPanel,onSaved,onProduce,onDownload}:Props){
 const t=(zh:string,en:string)=>english?en:zh,base=`/api/brands/${encodeURIComponent(brandId)}`
 const [activeId,setActiveId]=useState(creativeId),[data,setData]=useState<any>(null),[source,setSource]=useState<CreativeSource|null>(null),[sourceError,setSourceError]=useState(''),[sku,setSku]=useState<any>(null),[skuError,setSkuError]=useState('')
 const [script,setScript]=useState(''),[materials,setMaterials]=useState<string[]>([]),[rows,setRows]=useState<SkuRecommendation[]>([]),[skuNote,setSkuNote]=useState(''),[shotId,setShotId]=useState('')
 const [reasons,setReasons]=useState<string[]>([]),[note,setNote]=useState(''),[instruction,setInstruction]=useState(''),[task,setTask]=useState<any>(null),[candidate,setCandidate]=useState<any>(null)
 const [reviewedCandidate,setReviewedCandidate]=useState<Record<string,any>|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<Pending|null>(null),[dialog,setDialog]=useState<'save'|'schedule'|null>(null),[saveMode,setSaveMode]=useState('copy'),[date,setDate]=useState(''),[platform,setPlatform]=useState('')
 const alive=useRef(true),lock=useRef(false),pendingRef=useRef<Pending|null>(null),storageKey=useRef(''),dialogRef=useRef<HTMLElement>(null),returnFocus=useRef<HTMLElement|null>(null),ready=useRef(false)
 const activeIdRef=useRef(creativeId),panelGeneration=useRef(0),panelAbort=useRef<AbortController|null>(null)
 const path=(suffix:string,id=activeId)=>`${base}/content-creatives/${encodeURIComponent(id)}/${suffix}?month=${encodeURIComponent(month)}`
 const dirty=!!data&&(script!==(data.current.planning||'')||JSON.stringify(materials)!==JSON.stringify(data.current.materialRequirements||[])),running=task&&!terminal(task.status),disabled=busy||!!pending||!!running
 const feedback={reasons,note},needsAdaptation=['awaiting_sku','sku_confirmed'].includes(data?.current?.adaptationStatus),canSchedule=!!data?.capabilities?.canSchedule&&!dirty&&!needsAdaptation&&!!script.trim()&&materials.length>0&&!candidate
 const message=(e:any)=>{
  const codes:Record<string,[string,string]>={creative_revision_conflict:['创意已更新，输入已保留。请重新读取后核对。','This idea changed. Your edits are retained. Reload and compare.'],creative_source_changed:['原创意版本已变化，请重新读取后确认商品。','The source changed. Reload before confirming products.'],sku_catalog_changed:['商品目录已变化，请重新读取并确认商品。','The catalog changed. Reload and confirm products again.'],sku_complete_source_required:['原分镜不完整，暂时无法按原创意生成脚本。','Complete source shots are required before adaptation.'],creative_source_not_found:['未找到可验证的原创意，请从内容创意列表重新打开。','No verified source found. Reopen from the content ideas list.'],unverified:['保存结果待核对。请重试，输入和原请求已保留。','The save needs verification. Retry with the retained input and request.'],candidate_changed:['候选已变化，请重新生成后核对。','The candidate changed. Generate and review a new candidate.'],sku_confirmation_required:['请先确认商品，再生成具体脚本。','Confirm SKUs before generating the script.'],creative_adaptation_required:['请先确认 SKU 并采用生成的脚本，再安排发布。','Confirm SKUs and adopt the generated script before scheduling.']}
  return codes[e.message]?.[english?1:0]||(e.status===403?t('没有此操作权限，输入已保留。请核对账号权限。','You do not have permission. Your input is retained.'):e.status===401?t('登录已失效，请复制未保存内容后重新登录。','Session expired. Copy unsaved content before signing in.'):t('操作未完成，输入已保留。请重试核对。','The action was not confirmed. Your input is retained. Retry to reconcile.'))
 }
 const apply=(v:any)=>{setData(v);setScript(v.current.planning||'');setMaterials(v.current.materialRequirements||[])}
 const setRequest=(p:Pending|null)=>{pendingRef.current=p;setPending(p);if(storageKey.current)persist(storageKey.current+':pending',p)}
 const act=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn()}catch(e){if(alive.current){setError(message(pendingRef.current&&['save','adopt','sku'].includes(pendingRef.current.kind)?{message:'unverified'}:e));setDialog(null)}}finally{lock.current=false;if(alive.current)setBusy(false)}}
 const loadPanels=async(id:string)=>{
  if(id!==activeIdRef.current)return
  const generation=++panelGeneration.current;panelAbort.current?.abort()
  const controller=new AbortController();panelAbort.current=controller
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])
  const result=await Promise.allSettled([api(path('source',id),undefined,signal),api(path('sku-decision',id),undefined,signal)])
  if(!alive.current||controller.signal.aborted||generation!==panelGeneration.current||id!==activeIdRef.current)return
  if(result[0].status==='fulfilled'){const value=result[0].value;if(value.brandId===brandId&&value.creativeId===id){setSource(value);setSourceError('');setShotId(value.timeline?.[0]?.id||'')}}else{setSource(null);setSourceError(message(result[0].reason))}
  if(result[1].status==='fulfilled'){const value=result[1].value;if(value.brandId!==brandId||value.creativeId!==id||value.month!==month){setSku(null);setSkuError(message({message:'candidate_changed'}));return}setSku(value);setRows(value.decision?.recommendations||[]);setSkuNote(value.decision?.adjustmentNote||'');setSkuError('')}else{setSku(null);setSkuError(message(result[1].reason))}
 }
 const acceptTask=(v:any)=>{
  if(!alive.current)return
  if(v.creativeId!==activeIdRef.current||v.month!==month)throw new Error('candidate_changed')
  setTask(v);persist(storageKey.current+':task',v)
  if(v.status==='succeeded'){
   const artifact=v.kind==='sku_proposal'?v.report:v.candidate
   if(artifact?.brandId!==brandId||artifact?.creativeId!==activeIdRef.current||!v.artifact?.digest)throw new Error('candidate_changed')
   if(v.kind==='sku_proposal')setRows(artifact.recommendations||[])
   else {setCandidate(artifact);const saved=stored(storageKey.current+':candidate');setReviewedCandidate(v.kind==='creative'?(saved?.taskId===v.id&&saved?.digest===v.artifact.digest&&saved?.expectedRevision===artifact.expectedRevision?saved.patch:{...artifact.patch}):null)}
  }else if(['failed','cancelled','interrupted'].includes(v.status))setError(t('AI 未完成，当前脚本已保留。可重新发起。','AI did not complete. Your script is retained; you can retry.'))
 }
 useEffect(()=>{alive.current=true;void (async()=>{try{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('creative_source_not_found')
  const value=await api(path('revisions',creativeId));if(!alive.current)return;if(!value.current||value.brand?.id!==brandId||value.creativeId!==creativeId)throw new Error('creative_source_not_found');apply(value)
  storageKey.current=`amc-review:${value.currentUser.id}:${brandId}:${month}:${creativeId}`
  const draft=stored(storageKey.current+':draft');if(draft){setScript(draft.script??value.current.planning);setMaterials(draft.materials||[]);setReasons(draft.reasons||[]);setNote(draft.note||'');setInstruction(draft.instruction||'');setNotice(t('已恢复未保存的输入，请核对后保存。','Unsaved input restored. Review before saving.'));if(draft.expectedRevision&&draft.expectedRevision!==value.expectedRevision){setData({...value,expectedRevision:draft.expectedRevision});setError(message({message:'creative_revision_conflict'}))}}
  const request=stored(storageKey.current+':pending');if(request){setRequest({...request,attempted:true});setError(request.result?.receipt?message({message:'unverified'}):t('上次操作结果待核对，请重试原请求。','The previous action needs reconciliation. Retry the pending action.'))}
  ready.current=true;void loadPanels(creativeId)
  const savedTask=stored(storageKey.current+':task');if(savedTask)acceptTask(await api(`${base}/ai/tasks/${encodeURIComponent(savedTask.id)}`))
 }catch(e){if(alive.current)setError(message(e))}})();return()=>{alive.current=false;panelGeneration.current++;panelAbort.current?.abort()}},[])
 useEffect(()=>{if(!ready.current||!storageKey.current)return;persist(storageKey.current+':draft',{script,materials,reasons,note,instruction,expectedRevision:data?.expectedRevision})},[script,materials,reasons,note,instruction,data?.expectedRevision])
 useEffect(()=>{if(reviewedCandidate&&candidate&&task?.kind==='creative')persist(storageKey.current+':candidate',{taskId:task.id,digest:task.artifact.digest,expectedRevision:candidate.expectedRevision,patch:reviewedCandidate})},[reviewedCandidate,candidate,task])
 useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty])
 useEffect(()=>{if(!running)return;let stopped=false,inFlight=false;const timer=setInterval(async()=>{if(inFlight)return;inFlight=true;try{const value=await api(`${base}/ai/tasks/${encodeURIComponent(task.id)}`);if(!stopped)acceptTask(value)}catch(e){if(!stopped)setError(message(e))}finally{inFlight=false}},3000);return()=>{stopped=true;clearInterval(timer)}},[task?.id,task?.status,activeId])
 useEffect(()=>{if(initialPanel==='source'&&source)document.getElementById('creative-source')?.focus()},[initialPanel,source])
 useEffect(()=>{if(initialPanel==='schedule'&&data)document.getElementById('creative-schedule')?.focus()},[initialPanel,data])
 useEffect(()=>{if(dialog){returnFocus.current=document.activeElement as HTMLElement;dialogRef.current?.querySelector<HTMLElement>('input,button')?.focus()}else returnFocus.current?.focus()},[dialog])
 const verify=async(result:any)=>{
  const receipt=result.receipt,id=receipt?.content?.id;if(!id||!receipt.id||!receipt.contentHash)throw new Error('unverified')
  const value=await api(`${path('revisions',id)}&revisionId=${encodeURIComponent(receipt.id)}`)
  if(value.brand?.id!==brandId||value.creativeId!==id||value.revisions?.[0]?.id!==receipt.id||value.revisions?.[0]?.contentHash!==receipt.contentHash)throw new Error('unverified')
  // A receipt lookup is deliberately a single revision, never a history page.
  // Refresh independently so concurrent updates, capabilities and pagination
  // remain server-authoritative; keep already loaded older pages for this idea.
  const fresh=await api(path('revisions',id))
  if(fresh.brand?.id!==brandId||fresh.creativeId!==id||fresh.current?.id!==id||!fresh.expectedRevision)throw new Error('unverified')
  if(id===activeIdRef.current){
   const previous=data.revisions||[],firstPage=fresh.revisions||[]
   const oldestFresh=firstPage.at(-1)?.revision
   const retainedOlder=previous.some((r:any)=>oldestFresh!==undefined&&r.revision<oldestFresh)
   fresh.revisions=Array.from(new Map([...previous,...firstPage].map((r:any)=>[r.id,r])).values()).sort((a:any,b:any)=>b.revision-a.revision)
   if(retainedOlder){fresh.nextBeforeVersion=data.nextBeforeVersion;fresh.hasMore=!!data.nextBeforeVersion}
  }
  if(!alive.current)return receipt
  apply(fresh);setActiveId(id);setDialog(null);persist(storageKey.current+':draft',null)
  if(id!==activeIdRef.current){panelGeneration.current++;panelAbort.current?.abort();activeIdRef.current=id;setSource(null);setSku(null);setRows([]);setShotId('');persist(storageKey.current+':task',null);persist(storageKey.current+':candidate',null);persist(storageKey.current+':pending',null);storageKey.current=`amc-review:${value.currentUser.id}:${brandId}:${month}:${id}`}
  setNotice(t('脚本已保存并核对。','Script saved and verified.'));return receipt
 }
 const runRequest=async(p:Pending)=>{
  setRequest(p)
  // A received receipt is durable before readback. Retry verification without
  // sending the accepted copy/write again; an unknown POST retains its key too.
  const resumable=p.result&&(p.kind==='task'?p.result.id:p.kind==='schedule'?p.result.schedule?.draftId:p.result.receipt?.id)
  let result=resumable?p.result:undefined
  if(!result){
   const attempted={...p,attempted:true};setRequest(attempted)
   try{result=await api(p.url,p.body)}catch(e){
    // Only a first POST's explicit rejection proves this attempt did not commit.
    // A retry after an unknown result may now fail auth despite an earlier write.
    if(!p.attempted&&(e as any).status>=400&&(e as any).status<500)setRequest(null)
    throw e
   }
   setRequest({...attempted,result})
  }
  if(p.kind==='save'||p.kind==='adopt'||p.kind==='sku'){
   const receipt=await verify(result);if(!alive.current)return
   setRequest(null)
   if(p.kind==='sku'){
    await loadPanels(receipt.content.id)
    await runRequest({kind:'task',url:`${base}/ai/tasks`,body:{kind:'creative_adaptation',creativeId:receipt.content.id,month,expectedRevision:receipt.contentHash,decisionDigest:receipt.content.skuDecision.digest,goal:'根据已确认的商品与原分镜生成完整脚本及素材需求。',requestKey:crypto.randomUUID()}});return
   }
   setCandidate(null);setReviewedCandidate(null);setTask(null);persist(storageKey.current+':task',null);persist(storageKey.current+':candidate',null)
   const notification=onSaved?.({...receipt.content,month,revisionId:receipt.id})
   await Promise.all([loadPanels(receipt.content.id),notification])
  }else if(p.kind==='task'){
   // Store the accepted task before its read, so a lost read never dispatches a new task.
   persist(storageKey.current+':task',result);acceptTask(await api(`${base}/ai/tasks/${encodeURIComponent(result.id)}`));setRequest(null)
  }else if(p.kind==='discard'){
   if(!result.receipt?.id)throw new Error('unverified');setCandidate(null);setReviewedCandidate(null);setTask(null);persist(storageKey.current+':task',null);persist(storageKey.current+':candidate',null);setRequest(null);setNotice(t('已弃用候选，当前脚本保留。','Candidate discarded. Current script retained.'))
  }else{
   if(!result.ok||!result.schedule?.draftId)throw new Error('unverified')
   const fresh=await api(path('revisions'))
   if(fresh.current?.schedule?.draftId!==result.schedule.draftId||fresh.current?.schedule?.scheduledAt!==result.schedule.scheduledAt||fresh.current?.schedule?.platform!==result.schedule.platform)throw new Error('unverified')
   apply(fresh);setRequest(null);setDialog(null);setNotice(t('已安排发布。','Publication scheduled.'))
  }
 }
 const submit=(p:Pending)=>void act(()=>runRequest(pendingRef.current||p))
 const startTask=(kind:string,materialsOnly=false)=>submit({kind:'task',url:`${base}/ai/tasks`,body:{kind,creativeId:activeId,month,expectedRevision:data.expectedRevision,requestKey:crypto.randomUUID(),goal:kind==='sku_proposal'?'推荐 2–4 个真实商品，说明分镜角色与理由，不生成脚本。':materialsOnly?'仅根据当前脚本更新素材需求，保留脚本正文，不新增剧情。':instruction.trim(),...(kind==='creative'?{draftScript:script,draftMaterialRequirements:materials,...(materialsOnly?{editMode:'materials'}:{})}:{})}})
 const confirmSku=()=>submit({kind:'sku',url:path('sku-decision'),body:{expectedRevision:data.expectedRevision,idempotencyKey:crypto.randomUUID(),catalogDigest:sku.catalogDigest,sourceRevision:sku.sourceRevision,sourceDigest:sku.sourceDigest,selectedSkuIds:rows.map(r=>r.skuId),recommendations:rows,adjustmentNote:skuNote}})
 const adopt=()=>submit({kind:'adopt',url:`${base}/ai/tasks/${encodeURIComponent(task.id)}/adopt`,body:{artifactDigest:task.artifact.digest,requestKey:crypto.randomUUID(),...(task.kind==='creative_adaptation'?{}:{patch:reviewedCandidate,saveMode:data.canOverwrite?'overwrite':'copy',feedback})}})
 const discard=()=>submit({kind:'discard',url:`${base}/content-creatives/feedback`,body:{action:'discard_candidate',month,creativeId:activeId,taskId:task.id,artifactDigest:task.artifact.digest,expectedRevision:candidate.expectedRevision,idempotencyKey:crypto.randomUUID(),feedback}})
 const candidateText=candidate?.patch?.planning||candidate?.shots?.map((s:any)=>`${s.sourceShotId||''}\n${s.visualDescription}\n${s.subjectAction||''}\n${s.voiceover||''}\n${s.onScreenText||''}`).join('\n\n')||''
 const mapping=(data?.current.skuDecision?.recommendations||rows).filter((r:SkuRecommendation)=>r.sourceShotIds.includes(shotId))
 if(!data)return <section className="p-5" role="status">{error||t('正在读取创意…','Loading idea…')}</section>
 return <section aria-label={t('脚本编辑','Script editor')} className="min-w-0 space-y-4 rounded-2xl bg-slate-50 p-3 text-slate-900 sm:p-4 motion-reduce:scroll-auto">
 <header className="min-w-0"><p className="text-xs text-violet-600">AMC · {t('内容创意','Content ideas')}</p><h2 className="mt-2 break-words text-xl font-semibold">{data.current.title}</h2><p className="mt-2 text-xs text-slate-500">{data.current.scriptOwner?t(`保管人：${data.current.scriptOwner.name||data.current.scriptOwner.id}`,`Owner: ${data.current.scriptOwner.name||data.current.scriptOwner.id}`):t('品牌共享脚本','Brand shared script')} · {dirty?t('未保存','Unsaved'):t('已保存','Saved')}</p></header>
 {notice&&<p role="status" className="text-sm text-violet-700">{notice}</p>}{error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}{pending?<button className={`${button} mt-2 block`} disabled={busy} onClick={()=>void act(()=>runRequest(pending))}>{t('重试待核对操作','Retry pending action')}</button>:<button className={`${button} mt-2 block`} disabled={busy} onClick={()=>void act(async()=>{if(!dirty||window.confirm(t('重新读取会放弃未保存修改，继续吗？','Reload and discard unsaved changes?'))){apply(await api(path('revisions')));await loadPanels(activeId)}})}>{t('重新读取','Reload latest version')}</button>}</div>}
 <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"><CreativeSourceComparison source={source} error={sourceError} shotId={shotId} onShot={setShotId} english={english}/><div className="min-w-0 space-y-4"><section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><label htmlFor="review-script" className="font-semibold">{t('完整脚本','Full script')}</label><textarea id="review-script" className={`${field} min-h-80 leading-7`} value={script} maxLength={20000} disabled={disabled||!data.canSaveAsNew} onChange={e=>setScript(e.target.value)}/>
 {shotId&&<div data-current-shot-id={shotId} className="mt-3 rounded-lg border-l-2 border-violet-600 bg-violet-50 p-3"><p className="break-all font-mono text-xs">{shotId}</p><p className="mt-2 min-w-0 break-words text-sm [overflow-wrap:anywhere]">{mapping.length?mapping.map((r:SkuRecommendation)=>`${r.skuName} · ${r.roles.join(' / ')}`).join('；'):t('此分镜尚未指定商品角色。','No SKU role assigned to this shot.')}</p>{scriptForSourceShot(script,shotId,source?.timeline.map(s=>s.id)||[])&&<pre className="mt-2 whitespace-pre-wrap break-words text-sm">{scriptForSourceShot(script,shotId,source?.timeline.map(s=>s.id)||[])}</pre>}{(candidate?.shots||data.current.shots||[]).filter((s:any)=>s.sourceShotId===shotId).map((s:any)=><p key={s.sourceShotId} className="mt-2 whitespace-pre-wrap break-words text-sm">{s.visualDescription}{'\n'}{s.voiceover}</p>)}</div>}
 <fieldset disabled={disabled||!data.canSaveAsNew} className="mt-4"><legend className="text-sm font-semibold">{t('修改原因','Revision reasons')}</legend><div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">{revisionReasons.map(([key,zh,en])=><label key={key} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={reasons.includes(key)} onChange={e=>setReasons(e.target.checked?[...reasons,key]:reasons.filter(k=>k!==key))}/>{t(zh,en)}</label>)}</div><label className="mt-3 block text-sm">{t('修改说明','Revision note')}<textarea className={field} value={note} maxLength={2000} onChange={e=>setNote(e.target.value)}/></label></fieldset>
 <label className="mt-4 block text-sm font-semibold">{t('AI 修改要求','AI revision instructions')}<textarea className={field} value={instruction} maxLength={6000} disabled={disabled} onChange={e=>setInstruction(e.target.value)}/></label><button className={`${button} mt-3`} disabled={disabled||!!candidate||needsAdaptation||!instruction.trim()||!data.canSaveAsNew} onClick={()=>startTask('creative')}><Sparkles size={16}/>{t('生成修改候选','Generate candidate')}</button>
 {running&&<p role="status" className="mt-3 text-sm">{task.status==='waiting'?t('AI 已暂停。可停止后重新发起。','AI is paused. Stop and retry.'):t('AI 正在准备候选，当前脚本保持可见。','AI is preparing a candidate. Your current script remains visible.')}<button className={`${button} ml-2`} disabled={busy} onClick={()=>void act(async()=>{await api(`${base}/ai/tasks/${encodeURIComponent(task.id)}`,{action:'cancel',requestKey:`cancel-${task.id}`});acceptTask(await api(`${base}/ai/tasks/${encodeURIComponent(task.id)}`))})}>{t('停止','Stop')}</button></p>}
 </section>
 <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-semibold">{t('素材需求','Required assets')}</h3><button className={`${button} mt-3`} disabled={disabled||!!candidate||needsAdaptation||!script.trim()||!data.canSaveAsNew} onClick={()=>startTask('creative',true)}><Sparkles size={16}/>{t('根据脚本更新','Update from script')}</button>{materials.map((item,i)=><div key={i} className="mt-3"><label className="block text-sm">{t(`素材要求 ${i+1}`,`Asset requirement ${i+1}`)}<textarea className={field} value={item} maxLength={2000} disabled={disabled||!data.canSaveAsNew} onChange={e=>setMaterials(old=>old.map((v,n)=>n===i?e.target.value:v))}/></label><button className={button} aria-label={t(`删除素材要求 ${i+1}`,`Remove requirement ${i+1}`)} disabled={disabled} onClick={()=>setMaterials(old=>old.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>)}<button className={`${button} mt-3`} disabled={disabled||materials.length>=100||!data.canSaveAsNew} onClick={()=>setMaterials([...materials,''])}><Plus size={16}/>{t('添加素材要求','Add requirement')}</button>{onDownload&&<button className={`${button} ml-2`} onClick={()=>onDownload({...data.current,planning:script,materialRequirements:materials})}><Download size={16}/>{t('下载','Download')}</button>}</section>
 </div></div>
 {skuError&&<p role="status" className="text-sm text-amber-800">{skuError}</p>}<CreativeSkuDecision data={sku} rows={rows} note={skuNote} onRows={setRows} onNote={setSkuNote} onPropose={()=>startTask('sku_proposal')} onConfirm={confirmSku} disabled={disabled||dirty||!!candidate} english={english}/>
 {candidate&&<section className="min-w-0 rounded-xl border border-violet-200 bg-white p-4"><h3 className="font-semibold">{t('候选前后对比','Candidate comparison')}</h3><div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2"><div className="min-w-0"><h4 className="text-xs text-slate-500">{t('当前脚本','Current script')}</h4><pre className="whitespace-pre-wrap break-words text-sm leading-7">{script}</pre></div><div className="min-w-0"><h4 className="text-xs text-violet-600">{t('AI 候选','AI candidate')}</h4>{task?.kind==='creative'&&reviewedCandidate?<fieldset disabled={disabled} className="space-y-3"><label className="block text-sm">{t('候选脚本','Candidate script')}<textarea aria-label={t('候选脚本','Candidate script')} className={field+' min-h-64 leading-7'} value={reviewedCandidate.planning||''} maxLength={20000} onChange={e=>setReviewedCandidate({...reviewedCandidate,planning:e.target.value})}/></label>{(reviewedCandidate.materialRequirements||[]).map((v:string,i:number)=><div key={i}><label className="block text-sm">{t(`候选素材要求 ${i+1}`,`Candidate asset requirement ${i+1}`)}<textarea aria-label={t(`候选素材要求 ${i+1}`,`Candidate asset requirement ${i+1}`)} className={field} value={v} maxLength={2000} onChange={e=>setReviewedCandidate({...reviewedCandidate,materialRequirements:reviewedCandidate.materialRequirements.map((x:string,n:number)=>n===i?e.target.value:x)})}/></label><button type="button" className={button} aria-label={t(`删除候选素材要求 ${i+1}`,`Remove candidate asset requirement ${i+1}`)} onClick={()=>setReviewedCandidate({...reviewedCandidate,materialRequirements:reviewedCandidate.materialRequirements.filter((_:string,n:number)=>n!==i)})}><Trash2 size={16}/></button></div>)}<button type="button" className={button} disabled={(reviewedCandidate.materialRequirements||[]).length>=100} onClick={()=>setReviewedCandidate({...reviewedCandidate,materialRequirements:[...(reviewedCandidate.materialRequirements||[]),'']})}>{t('添加候选素材要求','Add candidate asset requirement')}</button></fieldset>:<><pre className="whitespace-pre-wrap break-words text-sm leading-7">{candidateText}</pre><ul className="text-sm">{(candidate.patch?.materialRequirements||candidate.materialRequirements||[]).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul><p className="mt-3 text-xs text-slate-500">{t('此脚本按已确认的商品与分镜生成。采用后可继续修改，并保留修改记录。','This script follows the confirmed products and shots. Adopt it first, then edit with revision history.')}</p></>}</div></div><div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={disabled||(task?.kind==='creative'&&!reviewedCandidate?.planning?.trim())} onClick={adopt}>{t('采用候选','Adopt candidate')}</button><button className={button} disabled={disabled} onClick={discard}>{t('弃用候选','Discard candidate')}</button></div></section>}
 <CreativeRevisionTimeline revisions={data.revisions||[]} hasMore={!!data.nextBeforeVersion} disabled={disabled} english={english} onMore={()=>void act(async()=>{const page=await api(`${path('revisions')}&beforeVersion=${data.nextBeforeVersion}`);setData({...data,revisions:[...data.revisions,...page.revisions],nextBeforeVersion:page.nextBeforeVersion})})}/>
 <section id="creative-schedule" tabIndex={-1} className="rounded-xl border border-slate-200 bg-white p-3 focus-visible:outline-violet-600"><h3 className="font-semibold">{t('发布安排','Publication schedule')}</h3>{data.current.schedule?.draftId?<p className="my-2 break-all text-sm">{data.current.schedule.platform} · {data.current.schedule.scheduledAt?new Date(data.current.schedule.scheduledAt).toLocaleString(english?'en-SG':'zh-SG',{timeZone:'Asia/Singapore'}):t('时间待确认','Time unconfirmed')} · {t('关联草稿','Linked draft')} {data.current.schedule.draftId}</p>:<p className="my-2 text-sm text-slate-500">{t('尚未安排发布','Not scheduled')}</p>}</section>
 <footer className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3"><button className={button} disabled={disabled||!data.canSaveAsNew||!script.trim()||!!candidate} onClick={()=>{setSaveMode('copy');setDialog('save')}}><Save size={16}/>{t('保存','Save')}</button><button className={button} disabled={disabled||!canSchedule} onClick={()=>{setDate('');setPlatform('');setDialog('schedule')}}>{t('安排发布','Schedule publication')}</button>{onProduce&&<button className={button} disabled={disabled||dirty||needsAdaptation||!!candidate} onClick={()=>void act(async()=>{const fresh=await api(path('revisions'));if(fresh.expectedRevision!==data.expectedRevision)throw new Error('creative_revision_conflict');await onProduce({...fresh.current,revisionId:fresh.revisions?.[0]?.id})})}>{t('进入制作','Enter editor')}</button>}<p className="basis-full text-xs text-slate-500">{needsAdaptation?t('请先确认商品并采用生成的脚本，再安排发布。','Confirm SKUs and adopt the generated script before scheduling.'):dirty?t('请先保存修改，再安排发布或进入制作。','Save your changes before scheduling or production.'):t('排期需要确认日期和平台（新加坡时间）。','Confirm a date and platform to schedule (Singapore time).')}</p></footer>
 {dialog&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-3"><section ref={dialogRef} role="dialog" aria-modal="true" aria-label={dialog==='save'?t('保存脚本','Save script'):t('确认发布安排','Confirm publication schedule')} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5" onKeyDown={e=>{if(e.key==='Escape'&&!busy)setDialog(null);if(e.key==='Tab'){const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}><h3 className="font-semibold">{dialog==='save'?t('保存脚本','Save script'):t('确认发布安排','Confirm publication schedule')}</h3>{dialog==='save'?<fieldset disabled={disabled} className="mt-4 space-y-4">{['copy','overwrite'].map(mode=><label key={mode} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="save-mode" checked={saveMode===mode} disabled={mode==='overwrite'&&!data.canOverwrite} onChange={()=>setSaveMode(mode)}/>{mode==='copy'?t('另存为新脚本（原脚本保留，新脚本归我保管）','Save as new script (keep original, new copy owned by me)'):t('覆盖原脚本','Overwrite original')}</label>)}</fieldset>:<><label className="mt-4 block text-sm">{t('发布日期和时间','Publication date and time')}<input type="datetime-local" className={field} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="mt-4 block text-sm">{t('平台','Platform')}<select aria-label={t('平台','Platform')} className={field} value={platform} onChange={e=>setPlatform(e.target.value)}><option value="">{t('请选择','Choose platform')}</option>{(data.current.platformTargets||[data.current.platformSlug||data.current.platform]).filter(Boolean).map((v:string)=><option key={v} value={v.toLowerCase()}>{v}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">{t('新加坡时间 UTC+8','Singapore time UTC+8')}</p></>}
 <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={button} disabled={busy} onClick={()=>setDialog(null)}>{t('取消','Cancel')}</button><button className={button} disabled={disabled||(dialog==='schedule'&&(!date||!platform))} onClick={()=>{if(dialog==='save')submit({kind:'save',url:path('revisions'),body:{expectedRevision:data.expectedRevision,idempotencyKey:crypto.randomUUID(),saveMode,patch:{planning:script,materialRequirements:materials},feedback}});else submit({kind:'schedule',url:path('schedule'),body:{expectedRevision:data.expectedRevision,idempotencyKey:crypto.randomUUID(),platform,scheduledAt:`${date}:00+08:00`}})}}>{dialog==='save'?t('确认保存','Confirm save'):t('确认排期','Confirm schedule')}</button></div></section></div>}
 </section>
}
