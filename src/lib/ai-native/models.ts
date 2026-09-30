import type { ApplicationOptions, ModelProfile } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
// The public provider JavaScript contract is documented in agent/model-provider.js.
// @ts-expect-error Core candidate.114 does not ship provider module declarations.
import { createModelProvider } from '@immedi/iaic-core/agent/model-provider.js'
import { prisma } from '../prisma'
import { runtimeConfig } from '../model-management/registry'
import { selectModel } from '../model-management/types'
import { recordExecution } from '../model-management/runtime'
import { complete } from '../global-text/transport'
import { nativeError } from './contract'

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
    tokenPolicies:Object.fromEntries(profiles.map(p=>[p.id,{maximum:150000,price:{revision:'amc-ai-allowance-v1',input:1,cachedInput:1,output:1}}])),
    modelFactory:configuration=>createModelProvider({apiKey:configuration.apiKey,model:configuration.model,provider:'openai',maxOutputTokens:6000,invocation:{parallelToolCalls:false},fetchImpl:async(_url:string,options:RequestInit)=>{
      const version=Number(configuration.model.replace('amc-policy-','')),config=await runtimeConfig({version,secrets:true})
      const model=selectModel(config,'mm','ai_native','text'),wire=JSON.parse(String(options.body)),started=Date.now()
      let result;try{
        result=await complete({id:model.id,provider:model.protocol,displayName:model.definition.name,modelName:model.definition.modelName,baseUrl:model.baseUrl,apiKey:config.secrets![model.secretRef],timeoutMs:model.definition.timeoutMs,reasoningEffort:model.definition.reasoningEffort},{messages:wire.input,tools:wire.tools.map((t:any)=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}})),toolChoice:'required',maxTokens:Math.min(6000,model.definition.maxTokensByTask?.ai_native||model.definition.maxTokensByTask?.text||6000),signal:options.signal||undefined,task:'ai_native'})
        return new Response(JSON.stringify({id:result.providerReference,provider_usage:result.rawUsage,usage:result.usage,status:'completed',output:(result.message.tool_calls||[]).map((t:any)=>({type:'function_call',name:t.function.name,arguments:t.function.arguments}))}))
      }finally{
        await recordExecution({source:'mm',executor:'kanban',task:'ai_native',version,modelId:model.id,connectionId:model.connectionId,targetModel:model.definition.modelName,responseModel:result?.responseModel||undefined,status:result?'success':'failed',latencyMs:Date.now()-started})
      }
    }}),
  }
}
