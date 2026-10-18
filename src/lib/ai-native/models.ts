import {prepareConversationCompletion} from './conversation-completion'
import type {PlanningScope} from './planning-workspace-contract'
import {PLANNING_TEXT_TIMEOUT_MS} from '../global-text/deadline'
import {nativeWireTools,nativeWireCalls} from './tool-wire'
import type { ApplicationOptions, ModelProfile } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
// The public provider JavaScript contract is documented in agent/model-provider.js.
// @ts-expect-error Core candidate.114 does not ship provider module declarations.
import { createModelProvider } from '@immedi/iaic-core/agent/model-provider.js'
import { prisma } from '../prisma'
import { runtimeConfig } from '../model-management/registry'
import { selectModel } from '../model-management/types'
import { recordExecution } from '../model-management/runtime'
import { complete } from '../global-text/transport'
import { boundInvalidActions, MODEL_INVOCATION_ALLOWANCE } from './model-guards'
import { nativeError } from './contract'
import {DEFAULT_NATIVE_OUTPUT_TOKENS,FULL_PLANNING_OUTPUT_TOKENS,fullPlanningScope,nativeOutputTokens} from './planning-model-budget'

export async function centralModels():Promise<Pick<ApplicationOptions,'profiles'|'resolveSecret'|'modelFactory'|'tokenPolicies'>>{
  const current=await runtimeConfig()
  if(!current.active||!current.version)throw nativeError('central_model_not_configured',503)
  const versions=await prisma.$queryRawUnsafe('SELECT version FROM "ModelPolicyRevision" ORDER BY version DESC') as Array<{version:number}>
  const profiles:ModelProfile[]=[]
  for(const {version} of versions){
    const config=await runtimeConfig({version})
    try{
      const model=selectModel(config,'mm','ai_native','text')
      profiles.push({id:`central-${version}`,label:model.definition.name,provider:'openai',model:`amc-policy-${version}`,credentialRef:`amc-policy-${version}`,invocation:{parallelToolCalls:false}})
    }catch{if(version===current.version)throw nativeError('central_model_not_configured',503)}
  }
  profiles.sort((a,b)=>Number(b.id===`central-${current.version}`)-Number(a.id===`central-${current.version}`))
  return {
    profiles,
    resolveSecret:async reference=>{
      const version=Number(reference.replace('amc-policy-','')),config=await runtimeConfig({version,secrets:true})
      const model=selectModel(config,'mm','ai_native','text')
      return config.secrets?.[model.secretRef]
    },
    tokenPolicies:Object.fromEntries(profiles.map(p=>[p.id,{maximum:MODEL_INVOCATION_ALLOWANCE,price:{revision:'amc-ai-allowance-v1',input:1,cachedInput:1,output:1}}])),
    modelFactory:configuration=>{
     const provider=(full:boolean,scope?:PlanningScope)=>createModelProvider({apiKey:configuration.apiKey,model:configuration.model,provider:'openai',maxOutputTokens:full?FULL_PLANNING_OUTPUT_TOKENS:DEFAULT_NATIVE_OUTPUT_TOKENS,invocation:{parallelToolCalls:false},fetchImpl:async(_url:string,options:RequestInit)=>{
      const version=Number(configuration.model.replace('amc-policy-','')),config=await runtimeConfig({version,secrets:true})
      const model=selectModel(config,'mm','ai_native','text'),wire=JSON.parse(String(options.body)),started=Date.now()
      let result;try{
        result=await complete({id:model.id,provider:model.protocol,displayName:model.definition.name,modelName:model.definition.modelName,baseUrl:model.baseUrl,apiKey:config.secrets![model.secretRef],timeoutMs:model.definition.timeoutMs,reasoningEffort:model.definition.reasoningEffort},{messages:wire.input,tools:nativeWireTools(wire.tools,full,scope).map((t:any)=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}})),toolChoice:'required',maxTokens:nativeOutputTokens(full,model.definition.maxTokensByTask),signal:options.signal||undefined,task:full?'brand_planning':'ai_native',...(full?{timeoutMs:PLANNING_TEXT_TIMEOUT_MS}:{})})
        return new Response(JSON.stringify({id:result.providerReference,provider_usage:result.rawUsage,usage:result.usage,status:'completed',output:nativeWireCalls(result.message?.tool_calls,result,wire.tools,full).map((t:any)=>({type:'function_call',name:t.function.name,arguments:t.function.arguments}))}))
      }finally{
        await recordExecution({source:'mm',executor:'kanban',task:'ai_native',version,modelId:model.id,connectionId:model.connectionId,targetModel:model.definition.modelName,responseModel:result?.responseModel||undefined,status:result?'success':'failed',latencyMs:Date.now()-started})
      }
    }})
     const regular=provider(false)
     return boundInvalidActions({name:regular.name,next:async(request:any)=>{
      const taskId=request.billingContext?.taskId
      let full=false,intent:any
      if(typeof taskId==='string'&&/^[0-9a-f-]{36}$/i.test(taskId)){
       const rows=await prisma.$queryRawUnsafe(`SELECT intent FROM amc_iaic.amc_ai_requests WHERE task_id=$1::uuid AND intent->>'kind'='conversation' AND intent->>'topic'='brand_planning'`,taskId) as Array<{intent:any}>
       intent=rows[0]?.intent;full=!!fullPlanningScope(intent?.planningScope)
      }
      return (full?provider(true,intent.planningScope):regular).next(prepareConversationCompletion(request,intent))
     }})
    },
  }
}
