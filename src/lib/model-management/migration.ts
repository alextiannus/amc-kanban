import { prisma } from '../prisma.ts'
import { createConnection, createModel, validateConnection } from './registry.ts'
import { changeDraft } from './draft.ts'
import { secretFingerprint } from './secrets.ts'
import { capabilityFor, type Selection } from './types.ts'
async function importRecords(actorId:string,client:any){
  if((await client.$queryRawUnsafe('SELECT version FROM "ModelPolicyState" WHERE id=$1','default'))[0]?.version!==null)throw new Error('Initialization is only available before unified publication')
  const old:any[]=await client.lLMConfig.findMany()
  const selection:Selection={defaults:{},exceptions:{}},issues:string[]=[],mapping:Record<string,string>={}
  const defaultUrls:Record<string,string>={google:'https://generativelanguage.googleapis.com/v1beta',openai:'https://api.openai.com/v1',deepseek:'https://api.deepseek.com/v1',kopix:'https://www.kopix.ai/v1',minimax:'https://api.minimaxi.com/v1/t2a_v2',seedance:'https://ark.ap-southeast.bytepluses.com',kieai:'https://api.kie.ai'}
  const records:any[]=old.map(c=>({isEnabled:c.isEnabled,legacyId:`kanban:${c.id}`,source:'kanban',name:c.displayName,modelName:c.modelName,protocol:c.provider,baseUrl:c.baseUrl||defaultUrls[c.provider],secret:c.apiKey,capabilities:c.capabilities||[],tasks:c.taskTags||[],timeoutMs:c.timeoutMs,maxRetries:c.maxRetries,definition:c}))
  const ordered=old.filter(c=>c.isEnabled).sort((a,b)=>Number(b.isDefault)-Number(a.isDefault)||b.priority-a.priority||new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime())
  const image=old.filter(c=>c.isEnabled&&c.provider==='google').sort((a,b)=>b.priority-a.priority||new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime())[0]
  const video=ordered.find(c=>['seedance','kieai','minimax','volcengine','fal'].includes(c.provider)&&(c.capabilities?.includes('video_output')||c.taskTags?.some((t:string)=>['video_generation','image_to_video'].includes(t))))
  const speech=ordered.find(c=>c.provider==='minimax'&&(c.taskTags?.some((t:string)=>['tts','tts_generation'].includes(t))||c.modelName?.startsWith('speech-')||c.baseUrl?.includes('/t2a')))
  if(video?.provider==='minimax'&&!video.baseUrl){const record=records.find(r=>r.legacyId===`kanban:${video.id}`);if(record)record.baseUrl='https://api.minimax.io'}
  const kanbanRoutes=[{task:'image_understanding',row:image,inputs:['image_input']},{task:'video_generation',row:video,inputs:['video_output']},{task:'tts_generation',row:speech,inputs:['audio_output']}]
  for(const route of kanbanRoutes){const item=records.find(r=>r.legacyId===`kanban:${route.row?.id}`);if(item){item.tasks=[...new Set([...item.tasks,route.task])];item.capabilities=[...new Set([...item.capabilities,...route.inputs])];if(route.inputs.some(c=>!route.row.capabilities?.includes(c)))issues.push(`${item.legacyId}: retained existing ${route.task} usage; media capability requires business acceptance`)}}
  const token=process.env.CONTENT_SERVICE_INTERNAL_TOKEN,base=process.env.AMC_CONTENT_SERVICE_URL
  let contentReport:any=null
  if(base&&token){
    try{
    const response=await fetch(`${base.replace(/\/+$/,'')}/v1/internal/models/export`,{method:'POST',headers:{'x-content-service-token':token},signal:AbortSignal.timeout(30000),cache:'no-store'})
    if(!response.ok)throw new Error(`Content migration export HTTP ${response.status}`)
    contentReport=await response.json();if(contentReport.protocolVersion!==2)throw new Error('Content migration protocol mismatch')
    if(contentReport.catalogIncludesDisabled!==true)issues.push('Deploy the updated Content catalog export, then initialize again to include disabled models')
    records.push(...contentReport.models);issues.push(...contentReport.issues)
    }catch(e){contentReport=null;issues.push(e instanceof Error?e.message:'Content export unavailable')}
  }else issues.push('Content export unavailable: configure the service URL and internal token')
  const connections=new Map<string,string>()
  for(const item of records){
    item.secret=item.secret?.trim();item.baseUrl=item.baseUrl?.trim().replace(/\/+$/,'')
    if(!item.secret||!item.baseUrl){issues.push(`${item.legacyId}: missing credential or explicit endpoint`);continue}
    // Configuration validation must not roll back every valid import or leave a
    // stale report behind. Do this before any writes, including connection reuse.
    try{validateConnection({name:item.name,protocol:item.protocol,baseUrl:item.baseUrl,secret:item.secret})}
    catch(error){
      const reason=error instanceof Error?error.message:'Invalid connection'
      const safeReasons=['Connection name and credential are required','Unsupported model protocol','Invalid provider URL','Production model connections require HTTPS']
      issues.push(`${item.legacyId}: ${safeReasons.includes(reason)?reason:'Invalid provider URL'}${reason==='Production model connections require HTTPS'?'; configure an HTTPS endpoint in the source service, then initialize again':''}`)
      continue
    }
    const identity=secretFingerprint(JSON.stringify([item.protocol,item.baseUrl.replace(/\/+$/,''),item.secret]))
    let connectionId=connections.get(identity)
    if(!connectionId){
      const existing:any[]=await client.$queryRawUnsafe('SELECT id FROM "ModelConnection" WHERE protocol=$1 AND "baseUrl"=$2 AND "secretFingerprint"=$3',item.protocol,item.baseUrl.replace(/\/+$/,''),secretFingerprint(item.secret))
      connectionId=existing[0]?.id||(await createConnection({name:item.name,protocol:item.protocol,baseUrl:item.baseUrl,secret:item.secret},actorId,client)).id;connections.set(identity,connectionId!)
    }
    const capabilities=[...new Set([...(item.tasks.length?item.tasks:['text']).map((t:string)=>capabilityFor(t)),...item.capabilities.filter((c:string)=>['image_input','video_input','audio_input','video_output','image_output'].includes(c)).map((c:string)=>capabilityFor('',[c]))])] as any
    const definition={isEnabled:item.isEnabled!==false,name:item.name,modelName:item.modelName,capabilities,inputCapabilities:item.capabilities,timeoutMs:item.timeoutMs||120000,maxRetries:Math.min(3,item.maxRetries||0),temperature:item.definition?.temperature,jsonMode:item.definition?.jsonMode,maxTokensByTask:item.definition?.maxTokensByTask,videoConstraints:item.definition?.videoConstraints,costMetadata:item.definition?.costMetadata}
    const existing:any[]=await client.$queryRawUnsafe('SELECT id FROM "ModelCatalogEntry" WHERE "legacyId"=$1 AND "connectionId"=$2 AND definition=$3::jsonb',item.legacyId,connectionId,JSON.stringify(definition))
    const modelId=existing[0]?.id||(await createModel({connectionId:connectionId!,legacyId:item.legacyId,definition},actorId,client)).id
    mapping[item.legacyId]=modelId
    if(item.isEnabled!==false&&item.modelName==='glm-5.3'&&['kopix','openai','custom_shim'].includes(item.protocol))selection.defaults.text=modelId
    for(const task of item.tasks){const cap=capabilityFor(task);if(cap!=='text'&&item.source==='kanban'&&item.isEnabled!==false)selection.exceptions[`kanban:${task}`]=modelId}
  }
  for(const route of contentReport?.routes||[]){
    const modelId=mapping[`content:${route.profileId}`]
    if(!modelId){issues.push(`Unresolved media route ${route.task}: ${route.profileId}`);continue}
    if(route.capability==='text')continue
    selection.defaults[route.capability as keyof Selection['defaults']] ||=modelId
    const key=`content:${route.task}${route.platform?`:${route.platform}`:''}`
    if(selection.exceptions[key]&&selection.exceptions[key]!==modelId)issues.push(`Conflicting media route ${key}; review the source configuration`)
    else selection.exceptions[key]=modelId
  }
  for(const route of kanbanRoutes){const model=mapping[`kanban:${route.row?.id}`];if(model)selection.exceptions[`kanban:${route.task}`]=model}
  for(const jobId of contentReport?.legacyJobIds||[])await client.$executeRawUnsafe('INSERT INTO "ModelPolicyJob" (id,version) VALUES ($1,NULL) ON CONFLICT(id) DO NOTHING',`content:${jobId}`)
  const batches=await client.assetAnalysisBatch.findMany({where:{status:{in:['QUEUED','RUNNING','FAILED']}},select:{id:true,status:true}})
  for(const batch of batches)await client.$executeRawUnsafe('INSERT INTO "ModelPolicyJob" (id,version) VALUES ($1,NULL) ON CONFLICT(id) DO NOTHING',`kanban:asset-batch:${batch.id}`)
  if(!selection.defaults.text)issues.push('Kopix glm-5.3 text connection is missing')
  return {selection,issues,mapping,inFlight:{...contentReport?.inFlight,kanbanAssetBatches:batches},importedModels:Object.keys(mapping).length,connections:connections.size}
}

export async function importLegacyModels(actorId:string,expectedRevision:number){
  return changeDraft(expectedRevision,actorId,async(client,draft)=>{
    const report=await importRecords(actorId,client)
    // Preserve deliberate draft edits on retries, but advance unchanged imported references.
    const oldMapping=draft.initializationReport?.mapping||{}
    const translated=(id:string)=>{const legacy=Object.keys(oldMapping).find(k=>oldMapping[k]===id);return legacy&&report.mapping[legacy]||id}
    const existing=draft.configuration
    const merge=(kind:'defaults'|'exceptions')=>{
      const next:any={...report.selection[kind]}
      for(const key of Object.keys(draft.initializationReport?.importedSelection?.[kind]||{}))if(!(key in existing[kind]))delete next[key]
      return {...next,...Object.fromEntries(Object.entries(existing[kind]).map(([k,v])=>[k,translated(String(v))]))}
    }
    draft.configuration={defaults:merge('defaults'),exceptions:merge('exceptions')}
    draft.initializationReport={...report,importedSelection:report.selection,selection:draft.configuration,complete:report.issues.length===0,checkedAt:new Date().toISOString()}
    return draft.initializationReport
  })
}
