import { randomUUID, createHash } from 'node:crypto'
import { prisma } from '../prisma.ts'
import { decryptSecret, encryptSecret, secretFingerprint } from './secrets.ts'
import { CAPABILITIES, type ModelDefinition, type RuntimeConfig, type Selection } from './types.ts'
const db=prisma as any
export function configurationFingerprint(selection:Selection){return createHash('sha256').update(JSON.stringify({defaults:Object.fromEntries(Object.entries(selection.defaults).sort()),exceptions:Object.fromEntries(Object.entries(selection.exceptions).sort())})).digest('hex')}
export async function activeVersion():Promise<number|null>{
  const rows=await db.$queryRawUnsafe('SELECT version FROM "ModelPolicyState" WHERE id=$1','default')
  if(!rows.length)throw new Error('Unified model migration is required')
  return rows[0].version
}
export async function rejectLegacyModelWrite(){if(await activeVersion()!==null)throw new Error('MODEL_CONFIGURATION_MOVED: use Kanban unified model management')}
export async function runtimeConfig(options:{version?:number|null;jobId?:string;source?:string;secrets?:boolean}={}):Promise<RuntimeConfig>{
  let version=options.version===undefined?await activeVersion():options.version
  if(options.jobId){
    if(options.jobId.length>250)throw new Error('Invalid model job identity')
    const id=`${options.source||'kanban'}:${options.jobId}`
    await db.$executeRawUnsafe('INSERT INTO "ModelPolicyJob" (id,version) VALUES ($1,$2) ON CONFLICT(id) DO NOTHING',id,version)
    version=(await db.$queryRawUnsafe('SELECT version FROM "ModelPolicyJob" WHERE id=$1',id))[0].version
  }
  if(version===null)return {protocolVersion:2,version:null,active:false}
  const rows=await db.$queryRawUnsafe('SELECT configuration FROM "ModelPolicyRevision" WHERE version=$1',version)
  if(!rows[0])throw new Error('Pinned model revision is unavailable')
  return configurationRuntime(rows[0].configuration,version,options.secrets===true)
}
export async function configurationRuntime(selection:Selection,version:number,secrets=false):Promise<RuntimeConfig>{
  const ids=[...new Set([...Object.values(selection.defaults),...Object.values(selection.exceptions)])].filter(Boolean)
  const models:any[]=[],credentials:Record<string,string>={}
  for(const id of ids){
    const rows=await db.$queryRawUnsafe('SELECT m.*,c.protocol,c.name AS "connectionName",c."baseUrl",c."encryptedSecret" FROM "ModelCatalogEntry" m JOIN "ModelConnection" c ON c.id=m."connectionId" WHERE m.id=$1',id)
    const m=rows[0];if(!m)throw new Error(`Central model ${id} is unavailable`)
    const secretRef=`central:${version}:${m.connectionId}`
    models.push({id:m.id,connectionId:m.connectionId,legacyId:m.legacyId,definition:m.definition,protocol:m.protocol,baseUrl:m.baseUrl,connectionName:m.connectionName,secretRef})
    if(secrets)credentials[secretRef]=decryptSecret(m.encryptedSecret)
  }
  return {protocolVersion:2,version,active:true,selection,models,...(secrets?{secrets:credentials}:{})}
}
export async function createConnection(input:{name:string;protocol:string;baseUrl:string;secret:string;previousId?:string},actorId:string,client:any=db){
  if(!input.name?.trim()||!input.secret?.trim())throw new Error('Connection name and credential are required')
  input={...input,baseUrl:input.baseUrl?.trim()}
  if(!['openai','anthropic','google','custom_shim','deepseek','kopix','minimax','cn_gateway','seedance','volcengine','fal','kieai','baidu_seedance'].includes(input.protocol))throw new Error('Unsupported model protocol')
  const url=new URL(input.baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid provider URL')
  if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw new Error('Production model connections require HTTPS')
  const id=randomUUID()
  await client.$executeRawUnsafe('INSERT INTO "ModelConnection" (id,"previousId",name,protocol,"baseUrl","encryptedSecret","secretFingerprint","actorId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',id,input.previousId||null,input.name.trim(),input.protocol,input.baseUrl.replace(/\/+$/,''),encryptSecret(input.secret.trim()),secretFingerprint(input.secret.trim()),actorId)
  return {id}
}
export async function createModel(input:{connectionId:string;legacyId?:string;definition:ModelDefinition},actorId:string,client:any=db){
  const raw=input.definition
  if(raw?.isEnabled!==undefined&&typeof raw.isEnabled!=='boolean')throw new Error('Invalid model availability')
  const d:ModelDefinition=raw&&{isEnabled:raw.isEnabled??true,previousModelId:raw.previousModelId,name:raw.name,modelName:raw.modelName,capabilities:raw.capabilities,inputCapabilities:raw.inputCapabilities,timeoutMs:raw.timeoutMs,maxRetries:raw.maxRetries,temperature:raw.temperature,jsonMode:raw.jsonMode,maxTokensByTask:raw.maxTokensByTask,videoConstraints:raw.videoConstraints,costMetadata:raw.costMetadata}
  if(!d?.name||!d.modelName||!Array.isArray(d.capabilities)||!d.capabilities.length||d.capabilities.some(c=>!CAPABILITIES.includes(c)))throw new Error('Model name and declared capabilities are required')
  if(!Number.isFinite(d.timeoutMs)||d.timeoutMs<1000||d.timeoutMs>600000)throw new Error('Invalid model timeout')
  if(!Array.isArray(d.inputCapabilities)||!Number.isInteger(d.maxRetries)||d.maxRetries<0||d.maxRetries>3)throw new Error('Invalid model parameters')
  if(Object.values(d.maxTokensByTask||{}).some(n=>!Number.isInteger(n)||n<1||n>1000000))throw new Error('Invalid output token limits')
  if(/"(?:apiKey|secret|token|authorization|password)"\s*:/i.test(JSON.stringify(d)))throw new Error('Credentials belong in provider connections only')
  const id=randomUUID()
  await client.$executeRawUnsafe('INSERT INTO "ModelCatalogEntry" (id,"connectionId","legacyId",definition,"actorId") VALUES ($1,$2,$3,$4::jsonb,$5)',id,input.connectionId,input.legacyId||null,JSON.stringify(d),actorId)
  return {id}
}
export async function overview(){
  const [connections,models,revisions,calls,validations,drafts]=await Promise.all([
    db.$queryRawUnsafe('SELECT id,"previousId",name,protocol,"baseUrl","createdAt" FROM "ModelConnection" ORDER BY "createdAt" DESC'),
    db.$queryRawUnsafe('SELECT id,"connectionId","legacyId",definition FROM "ModelCatalogEntry" ORDER BY "createdAt"'),
    db.$queryRawUnsafe('SELECT version,configuration,"createdAt" FROM "ModelPolicyRevision" ORDER BY version DESC LIMIT 20'),
    db.$queryRawUnsafe('SELECT * FROM "ModelExecutionLog" ORDER BY "createdAt" DESC LIMIT 50'),
    db.$queryRawUnsafe('SELECT id,report,"createdAt" FROM "ModelPolicyValidation" ORDER BY "createdAt" DESC LIMIT 10'),
    db.$queryRawUnsafe('SELECT * FROM "ModelManagementDraft" WHERE id=$1','default'),
  ])
  return {connections:connections.map((c:any)=>({...c,maskedSecret:'********'})),models,revisions,calls,validations,draft:drafts[0]||null,current:await runtimeConfig(),capabilities:CAPABILITIES}
}
export async function publish(selection:Selection,expectedVersion:number|null,validationId:string,actorId:string,client?:any){
  const execute=async(tx:any)=>{
    const state=(await tx.$queryRawUnsafe('SELECT version FROM "ModelPolicyState" WHERE id=$1 FOR UPDATE','default'))[0]
    if(!state||state.version!==expectedVersion)throw new Error('Model configuration changed; reload before publishing')
    const validation=(await tx.$queryRawUnsafe('SELECT * FROM "ModelPolicyValidation" WHERE id=$1',validationId))[0]
    if(!validation?.report?.passed||validation.fingerprint!==configurationFingerprint(selection)||Date.now()-new Date(validation.createdAt).getTime()>1800000)throw new Error('Fresh successful three-system validation required')
    const row=(await tx.$queryRawUnsafe('INSERT INTO "ModelPolicyRevision" (configuration,"actorId") VALUES ($1::jsonb,$2) RETURNING version',JSON.stringify(selection),actorId))[0]
    await tx.$executeRawUnsafe('UPDATE "ModelPolicyState" SET version=$1 WHERE id=$2',row.version,'default')
    await tx.auditLog.create({data:{actorId,actorType:'HUMAN',action:'MODEL_POLICY_PUBLISHED',resourceType:'ModelPolicy',resourceId:'default',newValue:{version:row.version,selection}}})
    return {version:row.version}
  }
  return client?execute(client):db.$transaction(execute)
}
