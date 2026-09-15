import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { runtimeConfig } from './registry.ts'
import { capabilityFor, selectModel, type RuntimeConfig } from './types.ts'
import { prisma } from '../prisma.ts'
const scopes=new AsyncLocalStorage<RuntimeConfig>()
export async function boundModels():Promise<RuntimeConfig>{
  const scope=scopes.getStore();if(scope)return scope
  const {boundPolicy}=await import('../global-text/policy.ts')
  const binding=await boundPolicy()
  return runtimeConfig({version:binding.modelRevision,secrets:true})
}
export function withModels<T>(config:RuntimeConfig,run:()=>Promise<T>){return scopes.run(config,run)}
export async function selectedExecution(task:string,required:string[]=[],source='kanban'){
  const config=await boundModels();if(!config.active)return null
  const model=selectModel(config,source,task,capabilityFor(task,required),required)
  const secret=config.secrets?.[model.secretRef];if(!secret)throw new Error('Pinned model credential unavailable')
  return {id:model.id,legacyId:model.legacyId,provider:model.protocol,displayName:model.definition.name,modelName:model.definition.modelName,baseUrl:model.baseUrl,apiKey:secret,timeoutMs:model.definition.timeoutMs,policyVersion:config.version,connectionId:model.connectionId,definition:model.definition}
}
export async function recordExecution(input:{source:string;task:string;version:number;modelId:string;connectionId:string;targetModel:string;responseModel?:string;status:string;latencyMs:number}){
  if(!['kanban','content','mm'].includes(input.source)||!['success','failed','submitted','processing'].includes(input.status))throw new Error('Invalid model execution record')
  try {
    await prisma.$executeRawUnsafe('INSERT INTO "ModelExecutionLog" (id,source,task,version,"modelId","connectionId","targetModel","responseModel",status,"latencyMs") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',randomUUID(),input.source,input.task.slice(0,100),input.version,input.modelId,input.connectionId,input.targetModel,input.responseModel||null,input.status,Math.max(0,Math.floor(input.latencyMs)))
  } catch {
    // Audit outages must not turn an accepted provider operation into a retry.
    console.warn(JSON.stringify({event:'model_execution_log_unavailable',...input}))
  }
}
