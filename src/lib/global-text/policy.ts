import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { prisma } from '../prisma.ts'
import { complete, fingerprint, type Connection, type TextRequest } from './transport.ts'

export type Binding = { version:number; enabled:boolean; connectionId:string|null; fingerprint:string|null; source:string; expires:number; probe?:boolean }
const scopes = new AsyncLocalStorage<{binding:Promise<Binding>}>()
export const PROTOCOL_VERSION = 1
function signingKey() { const key=process.env.JWT_SECRET || process.env.CONTENT_SERVICE_INTERNAL_TOKEN; if (!key) throw new Error('Global text signing secret is not configured'); return key }
export function signBinding(binding:Binding) {
  const payload=Buffer.from(JSON.stringify(binding)).toString('base64url')
  return `${payload}.${createHmac('sha256',signingKey()).update(payload).digest('base64url')}`
}
export function verifyBinding(token:string):Binding {
  const [payload,signature]=token.split('.')
  const expected=createHmac('sha256',signingKey()).update(payload||'').digest()
  const actual=Buffer.from(signature||'','base64url')
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) throw new Error('Invalid text policy binding')
  const binding=JSON.parse(Buffer.from(payload,'base64url').toString()) as Binding
  if(!Number.isInteger(binding.version)||binding.expires<Date.now()) throw new Error('Text policy binding expired')
  return binding
}
export async function currentBinding(source='kanban'):Promise<Binding> {
  const rows:any[]=await prisma.$queryRawUnsafe('SELECT r.* FROM "GlobalTextPolicy" p JOIN "GlobalTextRevision" r ON r.version=p.version WHERE p.id=$1','default')
  if(!rows[0]) throw new Error('Global text policy migration is required')
  return {...rows[0],source,expires:Date.now()+7*24*3600_000}
}
export async function jobBinding(source:string,jobId:string):Promise<Binding>{
  if(!jobId||jobId.length>250)throw new Error('Invalid global text job ID')
  const id=`${source}:${jobId}`
  await prisma.$executeRawUnsafe('INSERT INTO "GlobalTextJob" (id,version) SELECT $1,version FROM "GlobalTextPolicy" WHERE id=$2 ON CONFLICT(id) DO NOTHING',id,'default')
  const rows:any[]=await prisma.$queryRawUnsafe('SELECT r.* FROM "GlobalTextJob" j JOIN "GlobalTextRevision" r ON r.version=j.version WHERE j.id=$1',id)
  if(!rows[0])throw new Error('Job policy unavailable')
  return {...rows[0],source,expires:Date.now()+7*24*3600_000}
}
export async function boundPolicy():Promise<Binding> {
  const scoped=scopes.getStore(); if(scoped) return scoped.binding
  // Proxy attaches an authenticated binding at the start of each HTTP request.
  try { const {headers}=await import('next/headers');const h=await headers();const token=h.get('x-amc-text-binding');if(token)return verifyBinding(token) } catch(error) {
    if(error instanceof Error && /binding/.test(error.message)) throw error
  }
  return currentBinding()
}
export async function withTextScope<T>(run:()=>Promise<T>, binding?:Binding):Promise<T> {
  if(scopes.getStore())return run()
  return scopes.run({binding:binding?Promise.resolve(binding):currentBinding()},run)
}
export async function connectionFor(binding:Binding):Promise<Connection> {
  if(!binding.enabled||!binding.connectionId)throw new Error('Global text policy is disabled')
  const c=await prisma.lLMConfig.findUnique({where:{id:binding.connectionId}}) as Connection|null
  if(!c||!c.apiKey||fingerprint(c)!==binding.fingerprint) throw new Error('Pinned text connection changed or is missing; no fallback allowed')
  return c
}
export async function executeBound(binding:Binding,input:TextRequest) {
  const c=await connectionFor(binding)
  const started=Date.now(); let result;let failure:string|null=null
  try { result=await complete(c,input);return {...result,policyVersion:binding.version,connectionId:c.id} }
  catch(e) { failure=e instanceof Error?e.message:'Text call failed';throw e }
  finally {
    // No prompt, output, key or upstream error body is persisted.
    await prisma.$executeRawUnsafe('INSERT INTO "GlobalTextCall" (id,source,task,version,"connectionId",provider,"targetModel","responseModel",status,"latencyMs",error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',randomUUID(),binding.source,String(input.task||'text').slice(0,100),binding.version,c.id,c.provider,c.modelName,result?.responseModel||null,failure?'failed':'success',Date.now()-started,failure)
  }
}
export async function strictText(input:TextRequest) {
  const binding=await boundPolicy()
  return binding.enabled?executeBound(binding,input):null
}
export async function candidateBinding(connectionId:string,source='kanban'):Promise<Binding> {
  const c=await prisma.lLMConfig.findUnique({where:{id:connectionId}}) as Connection|null
  if(!c?.apiKey)throw new Error('Connection or API key is missing')
  return {version:-1,enabled:true,connectionId,fingerprint:fingerprint(c),source,expires:Date.now()+15*60_000,probe:true}
}
export async function policyOverview() {
  const current=await currentBinding()
  const revisions=await prisma.$queryRawUnsafe('SELECT r.version,r.enabled,r."connectionId",r."createdAt",c."displayName",c.provider,c."modelName" FROM "GlobalTextRevision" r LEFT JOIN "LLMConfig" c ON c.id=r."connectionId" ORDER BY version DESC LIMIT 20')
  const validations=await prisma.$queryRawUnsafe('SELECT id,"connectionId",report,"createdAt" FROM "GlobalTextValidation" ORDER BY "createdAt" DESC LIMIT 15')
  const calls=await prisma.$queryRawUnsafe('SELECT * FROM "GlobalTextCall" ORDER BY "createdAt" DESC LIMIT 30')
  return {current:{version:current.version,enabled:current.enabled,connectionId:current.connectionId},revisions,validations,calls,protocolVersion:PROTOCOL_VERSION}
}
export async function applyPolicy(input:{expectedVersion:number;enabled:boolean;connectionId:string|null;validationId?:string},actorId:string) {
  return prisma.$transaction(async(tx:any)=>{
    const rows=await tx.$queryRawUnsafe('SELECT version FROM "GlobalTextPolicy" WHERE id=$1 FOR UPDATE','default')
    if(rows[0]?.version!==input.expectedVersion)throw new Error('Configuration changed; reload before applying')
    let hash:null|string=null
    if(input.enabled){
      // Serialize a first selection against concurrent edits to its credentials.
      await tx.$queryRawUnsafe('SELECT id FROM "LLMConfig" WHERE id=$1 FOR UPDATE',input.connectionId)
      const c=await tx.lLMConfig.findUnique({where:{id:input.connectionId}})
      if(!c?.isEnabled)throw new Error('Enable the selected connection first')
      hash=fingerprint(c)
      const validations=await tx.$queryRawUnsafe('SELECT * FROM "GlobalTextValidation" WHERE id=$1 AND "connectionId"=$2',input.validationId||'',input.connectionId)
      const v=validations[0]
      if(!v||v.fingerprint!==hash||Date.now()-new Date(v.createdAt).getTime()>30*60_000||!v.report?.passed)throw new Error('Fresh successful connection test and three-system preflight required')
    }
    const version=input.expectedVersion+1
    await tx.$executeRawUnsafe('INSERT INTO "GlobalTextRevision" (version,enabled,"connectionId",fingerprint,"actorId") VALUES ($1,$2,$3,$4,$5)',version,input.enabled,input.enabled?input.connectionId:null,hash,actorId)
    await tx.$executeRawUnsafe('UPDATE "GlobalTextPolicy" SET version=$1 WHERE id=$2',version,'default')
    await tx.auditLog.create({data:{actorId,actorType:'HUMAN',action:'GLOBAL_TEXT_POLICY_APPLIED',resourceType:'GlobalTextPolicy',resourceId:'default',newValue:{version,enabled:input.enabled,connectionId:input.connectionId}}})
    return {version}
  })
}
