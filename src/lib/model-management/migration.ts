import { prisma } from '../prisma.ts'
import { createConnection, createModel, rejectLegacyModelWrite } from './registry.ts'
import { secretFingerprint } from './secrets.ts'
import { capabilityFor, type Selection } from './types.ts'
export async function importLegacyModels(actorId:string){
  await rejectLegacyModelWrite()
  const old:any[]=await prisma.lLMConfig.findMany()
  const selection:Selection={defaults:{},exceptions:{}},issues:string[]=[],mapping:Record<string,string>={}
  const defaultUrls:Record<string,string>={google:'https://generativelanguage.googleapis.com/v1beta',openai:'https://api.openai.com/v1',deepseek:'https://api.deepseek.com/v1',kopix:'https://www.kopix.ai/v1',minimax:'https://api.minimaxi.com/v1/t2a_v2',seedance:'https://ark.ap-southeast.bytepluses.com',kieai:'https://api.kie.ai'}
  const records:any[]=old.filter(c=>c.isEnabled).map(c=>({legacyId:`kanban:${c.id}`,source:'kanban',name:c.displayName,modelName:c.modelName,protocol:c.provider,baseUrl:c.baseUrl||defaultUrls[c.provider],secret:c.apiKey,capabilities:c.capabilities||[],tasks:c.taskTags||[],timeoutMs:c.timeoutMs,maxRetries:c.maxRetries,definition:c}))
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
    const response=await fetch(`${base.replace(/\/+$/,'')}/v1/internal/models/export`,{method:'POST',headers:{'x-content-service-token':token},signal:AbortSignal.timeout(30000),cache:'no-store'})
    if(!response.ok)throw new Error(`Content migration export HTTP ${response.status}`)
    contentReport=await response.json();if(contentReport.protocolVersion!==2)throw new Error('Content migration protocol mismatch')
    records.push(...contentReport.models);issues.push(...contentReport.issues)
  }else issues.push('Content export unavailable: configure the service URL and internal token')
  const connections=new Map<string,string>()
  for(const item of records){
    if(!item.secret||!item.baseUrl){issues.push(`${item.legacyId}: missing credential or explicit endpoint`);continue}
    const identity=secretFingerprint(JSON.stringify([item.protocol,item.baseUrl.replace(/\/+$/,''),item.secret]))
    let connectionId=connections.get(identity)
    if(!connectionId){
      const existing:any[]=await prisma.$queryRawUnsafe('SELECT id FROM "ModelConnection" WHERE protocol=$1 AND "baseUrl"=$2 AND "secretFingerprint"=$3',item.protocol,item.baseUrl.replace(/\/+$/,''),secretFingerprint(item.secret))
      connectionId=existing[0]?.id||(await createConnection({name:item.name,protocol:item.protocol,baseUrl:item.baseUrl,secret:item.secret},actorId)).id;connections.set(identity,connectionId!)
    }
    const capabilities=[...new Set([...(item.tasks.length?item.tasks:['text']).map((t:string)=>capabilityFor(t)),...item.capabilities.filter((c:string)=>['image_input','video_input','audio_input','video_output','image_output'].includes(c)).map((c:string)=>capabilityFor('',[c]))])] as any
    const definition={name:item.name,modelName:item.modelName,capabilities,inputCapabilities:item.capabilities,timeoutMs:item.timeoutMs||120000,maxRetries:Math.min(3,item.maxRetries||0),temperature:item.definition?.temperature,jsonMode:item.definition?.jsonMode,maxTokensByTask:item.definition?.maxTokensByTask,videoConstraints:item.definition?.videoConstraints,costMetadata:item.definition?.costMetadata}
    const existing:any[]=await prisma.$queryRawUnsafe('SELECT id FROM "ModelCatalogEntry" WHERE "legacyId"=$1 AND "connectionId"=$2 AND definition=$3::jsonb',item.legacyId,connectionId,JSON.stringify(definition))
    const modelId=existing[0]?.id||(await createModel({connectionId:connectionId!,legacyId:item.legacyId,definition},actorId)).id
    mapping[item.legacyId]=modelId
    if(item.modelName==='glm-5.3'&&['kopix','openai','custom_shim'].includes(item.protocol))selection.defaults.text=modelId
    for(const task of item.tasks){const cap=capabilityFor(task);if(cap!=='text'&&item.source==='kanban')selection.exceptions[`kanban:${task}`]=modelId}
  }
  for(const route of contentReport?.routes||[]){
    const modelId=mapping[`content:${route.profileId}`]
    if(!modelId){issues.push(`Unresolved media route ${route.task}: ${route.profileId}`);continue}
    if(route.capability==='text')continue
    selection.defaults[route.capability as keyof Selection['defaults']] ||=modelId
    selection.exceptions[`content:${route.task}${route.platform?`:${route.platform}`:''}`]=modelId
  }
  for(const route of kanbanRoutes){const model=mapping[`kanban:${route.row?.id}`];if(model)selection.exceptions[`kanban:${route.task}`]=model}
  for(const jobId of contentReport?.legacyJobIds||[])await prisma.$executeRawUnsafe('INSERT INTO "ModelPolicyJob" (id,version) VALUES ($1,NULL) ON CONFLICT(id) DO NOTHING',`content:${jobId}`)
  const batches=await prisma.assetAnalysisBatch.findMany({where:{status:{in:['QUEUED','RUNNING','FAILED']}},select:{id:true,status:true}})
  for(const batch of batches)await prisma.$executeRawUnsafe('INSERT INTO "ModelPolicyJob" (id,version) VALUES ($1,NULL) ON CONFLICT(id) DO NOTHING',`kanban:asset-batch:${batch.id}`)
  if(!selection.defaults.text)issues.push('Kopix glm-5.3 text connection is missing')
  return {selection,issues,mapping,inFlight:{...contentReport?.inFlight,kanbanAssetBatches:batches},importedModels:Object.keys(mapping).length,connections:connections.size}
}
