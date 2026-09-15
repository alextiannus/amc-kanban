import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.ts'
import { complete } from '../global-text/transport.ts'
import { configurationRuntime, configurationFingerprint } from './registry.ts'
import { CAPABILITIES, capabilityFor, selectModel, type Selection } from './types.ts'
export async function validateSelection(selection:Selection){
  if(!selection?.defaults?.text||!selection.exceptions||typeof selection.exceptions!=='object')throw new Error('A global text model and media exception map are required')
  if(Object.keys(selection.defaults).some(c=>!(CAPABILITIES as readonly string[]).includes(c)))throw new Error('Unknown default capability')
  const runtime=await configurationRuntime(selection,-1,true),checks:Record<string,boolean>={},errors:Record<string,string>={}
  async function check(name:string,run:()=>Promise<boolean>){try{checks[name]=await run()}catch(e){checks[name]=false;errors[name]=e instanceof Error?e.message:'Validation failed'}}
  for(const capability of Object.keys(selection.defaults))selectModel(runtime,'kanban',capability,capability as any)
  for(const [key,id]of Object.entries(selection.exceptions)){
    if(!/^(kanban|content|mm):[a-z_]+(?::[a-z_]+)?$/.test(key))throw new Error('Invalid media task exception')
    const model=runtime.models!.find(m=>m.id===id)
    const capability=capabilityFor(key.split(':')[1])
    if(capability==='text')throw new Error('Pure text tasks cannot have exceptions')
    if(!model||!model.definition.capabilities.includes(capability))throw new Error('Media exception model lacks the task capability')
  }
  const text=selectModel(runtime,'kanban','text','text')
  await check('system.kanban',async()=>{
    const supported:Record<string,string[]>={image_understanding:['google','openai','custom_shim','kopix','deepseek'],video_generation:['seedance','kieai','minimax'],speech_synthesis:['minimax']}
    for(const [capability,protocols]of Object.entries(supported)){
      if(!selection.defaults[capability as keyof Selection['defaults']]&&!Object.keys(selection.exceptions).some(key=>key.startsWith('kanban:')&&capabilityFor(key.split(':')[1])===capability))continue
      const m=selectModel(runtime,'kanban',capability==='speech_synthesis'?'tts_generation':capability,capability as any)
      if(!protocols.includes(m.protocol))throw new Error(`Kanban has no ${capability} adapter for ${m.protocol}; configure its task exception`)
    }
    return true
  })
  const connection={id:text.id,provider:text.protocol,displayName:text.definition.name,modelName:text.definition.modelName,baseUrl:text.baseUrl,apiKey:runtime.secrets![text.secretRef],timeoutMs:30000}
  await check('text',async()=>!!(await complete(connection,{messages:[{role:'user',content:'Reply OK'}],maxTokens:1024})).text)
  await check('json',async()=>JSON.parse((await complete(connection,{messages:[{role:'user',content:'Return only JSON: {"ok":true}'}],maxTokens:1024})).text!).ok===true)
  await check('conversation',async()=>{const code=randomUUID();return (await complete(connection,{messages:[{role:'user',content:code},{role:'assistant',content:'Remembered'},{role:'user',content:'Repeat the exact code only.'}],maxTokens:1024})).text?.trim()===code})
  await check('tools',async()=>{
    const tools=[{type:'function',function:{name:'echo_probe',parameters:{type:'object',properties:{value:{type:'string'}},required:['value']}}}]
    const messages=[{role:'user',content:'Call echo_probe with value test.'}]
    const first=await complete(connection,{messages,tools,toolChoice:{type:'function',function:{name:'echo_probe'}},maxTokens:2048})
    const call=first.message.tool_calls?.[0];if(!call||first.message.tool_calls!.length!==1||call.function.name!=='echo_probe')return false
    const marker=randomUUID()
    return (await complete(connection,{messages:[...messages,first.message,{role:'tool',tool_call_id:call.id,content:marker},{role:'user',content:'Repeat the tool result only.'}],maxTokens:2048})).text?.trim()===marker
  })
  for(const [source,base,path]of [
    ['content',process.env.AMC_CONTENT_SERVICE_URL,'/v1/internal/models/preflight'],
    ['mm',process.env.AMC_MM_SERVICE_URL||'https://amc-mm.immedi.ai','/api/internal/models/preflight'],
  ])await check(`system.${source}`,async()=>{
    if(!base||!process.env.CONTENT_SERVICE_INTERNAL_TOKEN)throw new Error('Service URL or internal token missing')
    const r=await fetch(`${base.replace(/\/+$/,'')}${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-content-service-token':process.env.CONTENT_SERVICE_INTERNAL_TOKEN},body:JSON.stringify(runtime),signal:AbortSignal.timeout(60000),cache:'no-store'})
    if(!r.ok)throw new Error(`${source} preflight HTTP ${r.status}`)
    const data=await r.json();return data.protocolVersion===2&&data.success===true
  })
  const id=randomUUID(),report={checks,errors,models:runtime.models!.map(m=>({id:m.id,connectionId:m.connectionId,modelName:m.definition.modelName})),passed:Object.values(checks).every(Boolean)}
  await prisma.$executeRawUnsafe('INSERT INTO "ModelPolicyValidation" (id,fingerprint,report) VALUES ($1,$2,$3::jsonb)',id,configurationFingerprint(selection),JSON.stringify(report))
  return {id,...report}
}
