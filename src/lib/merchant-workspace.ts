// @ts-expect-error IAIC exposes this JavaScript adapter without declarations.
import {PostgresWorkspaceStore} from '@immedi/iaic-core/workspace/store.js'
import {nativePool} from './ai-native/store'
import {authorizeBrainstorm} from './ai-native/brainstorm'
import {prisma} from './prisma'
import {createHash} from 'node:crypto'

const fail=(code:string,statusCode=400)=>Object.assign(new Error(code),{code,statusCode})
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v)
const langs=['zh','en','id','ms']
export function workspaceScope(userId:string,brandId:string,shared=false){return {applicationId:JSON.stringify(['amc-mm','documents',brandId]),assistantId:'merchant-workspace',subjectId:JSON.stringify(shared?['brand-shared']:['user',userId])}}
export function validateWorkspaceDraft(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||!langs.includes(value.language)||!value.versions||typeof value.versions!=='object'||Array.isArray(value.versions)||!value.versions[value.language])throw fail('invalid_workspace_draft')
 if(Object.entries(value.versions).some(([key,v]:[string,any])=>!langs.includes(key)||!v||typeof v.script!=='string'||v.script.length>12000||typeof v.originalScript!=='string'||v.originalScript.length>30000))throw fail('invalid_workspace_script')
 if(!Array.isArray(value.assets)||value.assets.length>40||value.assets.some((a:any)=>!a||!validId(a.id)||typeof a.selected!=='boolean'))throw fail('invalid_workspace_assets')
 if(!Number.isFinite(value.duration)||value.duration<=0||value.duration>600||!Array.isArray(value.platforms)||value.platforms.some((s:any)=>typeof s!=='string'||s.length>50))throw fail('invalid_workspace_options')
 // Explicit field allowlist: a document is never an authority/permission object.
 if(value.missingAssetIds!==undefined&&(!Array.isArray(value.missingAssetIds)||value.missingAssetIds.length>40||value.missingAssetIds.some((id:any)=>!validId(id))))throw fail('invalid_missing_assets')
 const keys=['missingAssetIds','sourceLineage','editorRevision','translationCache','voiceMode','subtitlesEnabled','allowAi','speakerVoices','passageVersion','language','outputLanguages','outputPending','versions','bindings','sourceDigest','assets','platforms','duration','templateId','pendingRewrite','rewriteCandidate','priorRewriteTask','creativeId','title']
 const draft=Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))
 if(draft.sourceLineage){const pins=draft.sourceLineage;draft.sourceLineage=Object.fromEntries(['creativeRevisionId','sourceMonth','originVideoJobId'].filter(k=>typeof pins[k]==='string'&&pins[k].length<=128).map(k=>[k,pins[k]]))}
 if(typeof draft.title!=='string'||draft.title.length>200)throw fail('invalid_workspace_title')
 if(draft.pendingRewrite&&(draft.pendingRewrite.body?.action!=='rewrite'||!/^[-\w]{12,100}$/.test(draft.pendingRewrite.body?.requestKey||'')||!langs.includes(draft.pendingRewrite.language)))throw fail('invalid_workspace_recovery')
 if(Buffer.byteLength(JSON.stringify(draft))>200000)throw fail('workspace_too_large',413)
 return draft
}
let initialized:Promise<any>|undefined
async function productionStore(){
 if(!initialized)initialized=(async()=>{const pool=nativePool();try{await pool.query('CREATE SCHEMA IF NOT EXISTS amc_iaic');const store=new PostgresWorkspaceStore({pool,maxBytes:220000});await store.initialize();return store}catch(e){await pool.end();throw e}})().catch(e=>{initialized=undefined;throw e})
 return initialized
}
export async function merchantWorkspace(userId:string,brandId:string,input:any,deps?:{store:any;authorize:(user:string,brand:string,write:boolean)=>Promise<unknown>;assets:(ids:string[])=>Promise<any[]>}){
 const action=input?.action||'list',write=['save','share'].includes(action)
 if(!['list','read','save','share'].includes(action))throw fail('invalid_workspace_action')
 if(input.expectedOwnerId!==undefined&&input.expectedOwnerId!==userId)throw fail('workspace_owner_changed',403)
 await (deps?.authorize||authorizeBrainstorm)(userId,brandId,write)
 const store=deps?.store||await productionStore(),shared=input.shared===true,scope=workspaceScope(userId,brandId,shared)
 if(action==='list'){
  const page=await store.list(scope,{after:input.after||'',limit:20})
  const items=page.items.map((a:any)=>({id:a.reference.path.replace(/^video\//,''),revision:a.reference.revision,title:a.source.title,stage:a.source.stage,updatedAt:a.createdAt,shared,sourceRevision:a.source.sourceRevision||null}))
  const jobs=!deps&&!shared&&items.length?await prisma.videoProductionJob.findMany({where:{brandId,createdBy:userId,historyDeletedAt:null,OR:items.map((item:any)=>({plan:{path:['_mmVideoJob','editor','workspaceDocument','id'],equals:item.id}}))},select:{id:true,status:true,plan:true},orderBy:{createdAt:'desc'},take:40}):[]
  return {items:items.map((item:any)=>({...item,productions:jobs.filter((job:any)=>job.plan?._mmVideoJob?.editor?.workspaceDocument?.id===item.id).map((job:any)=>({id:job.id,status:job.status,sourceRevision:job.plan._mmVideoJob.editor.workspaceDocument.revision}))})),nextCursor:page.nextCursor}
 }
 if(!validId(input.id))throw fail('invalid_workspace_id')
 const path='video/'+input.id
 const hydrate=async(draft:any)=>{
  const ids=[...new Set([...draft.assets.map((a:any)=>a.id),...(draft.missingAssetIds||[])])] as string[],rows=await (deps?.assets?deps.assets(ids):prisma.mediaAsset.findMany({where:{brandId,id:{in:ids}},select:{id:true,url:true,mimeType:true,aiCaption:true}})),byId=new Map(rows.map((a:any)=>[a.id,a]))
  return {...draft,assets:draft.assets.filter((a:any)=>byId.has(a.id)).map((a:any)=>({...(byId.get(a.id) as any),selected:a.selected})),missingAssetIds:ids.filter((id:string)=>!byId.has(id))}
 }
 if(action==='read'){
  let artifact:any;try{artifact=await store.read(scope,{path,...(input.revision?{revision:input.revision}:{})})}catch(e){if((e as any).statusCode===404)throw fail('workspace_document_not_found',404);throw e}
  return {id:input.id,revision:artifact.reference.revision,digest:artifact.reference.digest,updatedAt:artifact.createdAt,draft:await hydrate(JSON.parse(artifact.content)),shared}
 }
 if(shared)throw fail('shared_workspace_read_only',403)
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw fail('workspace_revision_required')
 if(action==='share'){
  const artifact=await store.read(scope,{path,revision:input.expectedRevision}),draft=JSON.parse(artifact.content)
  // Handoff copies editable material only. No private task control, candidate or receipts.
  for(const key of ['pendingRewrite','rewriteCandidate','priorRewriteTask','outputPending','translationCache'])delete draft[key]
  delete draft.sourceLineage;draft.creativeId='';draft.sourceDigest=null;draft.editorRevision=crypto.randomUUID()
  const id='shared_'+createHash('sha256').update(JSON.stringify([userId,input.id,artifact.reference.digest])).digest('hex').slice(0,40)
  const target=workspaceScope(userId,brandId,true),sharedPath='video/'+id
  try{await store.write(target,{path:sharedPath,content:JSON.stringify(draft),mediaType:'application/json',expectedRevision:0,source:{kind:'brand-handoff',title:draft.title,stage:'script_draft',sourceRevision:artifact.reference.revision}})}catch(e){if((e as any).statusCode!==409)throw e}
  return {id,shared:true}
 }
 const draft=validateWorkspaceDraft(input.draft)
 // Persist asset identities only; URLs are always resolved through current brand access.
 draft.assets=draft.assets.map((a:any)=>({id:a.id,selected:a.selected}))
 const content=JSON.stringify(draft)
 // Lost save responses are safely reconciled by identical content, never overwrite a newer edit.
 let old:any=null;try{old=await store.read(scope,{path})}catch(e){if((e as any).statusCode!==404)throw e}
 if(old?.content===content)return {id:input.id,revision:old.reference.revision,digest:old.reference.digest,updatedAt:old.createdAt}
 let stage=draft.pendingRewrite?'rewrite_pending':draft.rewriteCandidate?'candidate_review':'script_draft'
 if(!deps&&stage==='script_draft'&&typeof draft.priorRewriteTask==='string'&&/^[0-9a-f-]{36}$/i.test(draft.priorRewriteTask)){
  const receipt=await prisma.brandMarketingSolution.findFirst({where:{brandId,createdById:userId,kind:'VIDEO_SCRIPT_PREPARATION',status:'READY',output:{path:['taskId'],equals:draft.priorRewriteTask}},select:{output:true}})
  const result=receipt?.output as any
  if(result?.script===draft.versions[draft.language].script&&result?.language===draft.language)stage='script_ready'
 }
 const artifact=await store.write(scope,{path,content,mediaType:'application/json',expectedRevision:input.expectedRevision,source:{kind:'user-edit',title:draft.title,stage}})
 return {id:input.id,revision:artifact.reference.revision,digest:artifact.reference.digest,updatedAt:artifact.createdAt}
}
