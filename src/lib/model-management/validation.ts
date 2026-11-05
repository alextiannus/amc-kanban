import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.ts'
import { complete, type TextRequest } from '../global-text/transport.ts'
import { textTimeoutMs as requestTimeoutMs } from '../global-text/deadline.ts'
import { configurationRuntime, configurationFingerprint } from './registry.ts'
import { CAPABILITIES, capabilityFor, selectModel, type Selection } from './types.ts'
import { EXECUTION_CONTRACT_VERSION, qianfanPreflightRequests, assertQianfanPreflightConfirmation } from './executionContract.ts'
export async function validateSelection(selection:Selection){
  if(!selection?.defaults?.text||!selection.exceptions||typeof selection.exceptions!=='object')throw new Error('A global text model and media exception map are required')
  if(Object.keys(selection.defaults).some(c=>!(CAPABILITIES as readonly string[]).includes(c)))throw new Error('Unknown default capability')
  const runtime=await configurationRuntime(selection,-1,true),checks:Record<string,boolean>={},errors:Record<string,string>={}
  const qianfanRequests=qianfanPreflightRequests(runtime)
  const diagnostics:Record<string,{latencyMs?:number;timeoutMs?:number;responseChars?:number;matchesExpected?:boolean;containsExpected?:boolean}>={}
  async function check(name:string,run:()=>Promise<boolean>,failureReason='Validation response did not satisfy the required check'){
    const started=Date.now()
    diagnostics[name]={timeoutMs:name.startsWith('system.')?60000:textTimeoutMs}
    try{checks[name]=await run();if(!checks[name]&&!errors[name])errors[name]=failureReason}
    catch(e){checks[name]=false;errors[name]=e instanceof Error?e.message:'Validation failed';if(e instanceof Error&&e.name==='TimeoutError')errors[name]=`Preflight request timed out after ${diagnostics[name].timeoutMs} ms`}
    finally{diagnostics[name].latencyMs=Date.now()-started}
  }
  const failedTextChecks=()=>['text','json','conversation','tools','body_composition'].filter(k=>checks[k]===false)
  for(const capability of Object.keys(selection.defaults))selectModel(runtime,'kanban',capability,capability as any)
  for(const [key,id]of Object.entries(selection.exceptions)){
    if(!/^(kanban|content|mm):[a-z_]+(?::[a-z_]+)?$/.test(key))throw new Error('Invalid media task exception')
    const model=runtime.models!.find(m=>m.id===id)
    const capability=capabilityFor(key.split(':')[1])
    if(capability==='text')throw new Error('Pure text tasks cannot have exceptions')
    if(!model||!model.definition.capabilities.includes(capability))throw new Error('Media exception model lacks the task capability')
  }
  const text=selectModel(runtime,'kanban','text','text',['text_input','structured_json'])
  const tasks:any[]=[]
  checks['system.kanban']=false
  const textTimeoutMs=requestTimeoutMs(text.definition.timeoutMs,{})
  const isGlm=/^glm-5\.3(?:$|-)/i.test(text.definition.modelName)
  const connection={id:text.id,provider:text.protocol,displayName:text.definition.name,modelName:text.definition.modelName,baseUrl:text.baseUrl,apiKey:runtime.secrets![text.secretRef],timeoutMs:textTimeoutMs,reasoningEffort:text.definition.reasoningEffort??(isGlm?'low' as const:undefined)}
  async function probe(name:string,input:TextRequest,expected?:string){
    const result=await complete(name==='body_composition'?{...connection,reasoningEffort:text.definition.reasoningEffort}:connection,input)
    diagnostics[name].responseChars=result.text?.length||0
    if(expected!==undefined){diagnostics[name].matchesExpected=result.text?.trim()===expected;diagnostics[name].containsExpected=result.text?.includes(expected)===true}
    return result
  }
  const textChecks=[
    check('text',async()=>!!(await probe('text',{messages:[{role:'user',content:'Reply OK'}],maxTokens:1024})).text),
    check('json',async()=>JSON.parse((await probe('json',{messages:[{role:'user',content:'Return only JSON: {"ok":true}'}],maxTokens:1024})).text!).ok===true),
  ]
  if(isGlm)textChecks.push(check('body_composition',async()=>{
    const maxTokens=Math.min(2048,text.definition.maxTokensByTask?.body_composition||text.definition.maxTokensByTask?.text||2048)
    const result=await probe('body_composition',{task:'body_composition',messages:[{role:'system',content:'Return valid JSON only with a non-empty caption string and a hashtags array. No markdown.'},{role:'user',content:'Write an Instagram caption for a neighbourhood cafe weekday lunch. Use a warm practical tone, a short call to action and three relevant hashtags. Do not invent prices, discounts or opening hours. Keep the caption under 80 words.'}],maxTokens})
    const value=JSON.parse(result.text!);return typeof value.caption==='string'&&!!value.caption.trim()&&Array.isArray(value.hashtags)
  }))
  textChecks.push(check('conversation',async()=>{const code=randomUUID();return (await probe('conversation',{messages:[{role:'user',content:`Remember this verification code: ${code}`},{role:'assistant',content:'Remembered'},{role:'user',content:'Reply only with the exact verification code, without quotes, markdown or explanation.'}],maxTokens:1024},code)).text?.trim()===code},'Conversation response did not exactly repeat the verification code'))
  textChecks.push(check('tools',async()=>{
    const tools=[{type:'function',function:{name:'echo_probe',parameters:{type:'object',properties:{value:{type:'string'}},required:['value']}}}]
    const messages=[{role:'user',content:'Call echo_probe with value test.'}]
    const first=await probe('tools',{messages,tools,toolChoice:{type:'function',function:{name:'echo_probe'}},maxTokens:2048})
    const call=first.message.tool_calls?.[0];if(!call||first.message.tool_calls!.length!==1||call.function.name!=='echo_probe')return false
    const marker=randomUUID()
    return (await probe('tools',{messages:[...messages,first.message,{role:'tool',tool_call_id:call.id,content:marker},{role:'user',content:'Repeat the tool result only.'}],maxTokens:2048},marker)).text?.trim()===marker
  },'Tool probe must call echo_probe exactly once and repeat its exact result'))
  await Promise.all(textChecks)
  await Promise.all([
    ['content',process.env.AMC_CONTENT_SERVICE_URL,'/v1/internal/models/preflight'],
    ['mm',process.env.AMC_MM_SERVICE_URL||'https://amc-mm.immedi.ai','/api/internal/models/preflight'],
  ].map(([source,base,path])=>check(`system.${source}`,async()=>{
    if(!base||!process.env.CONTENT_SERVICE_INTERNAL_TOKEN)throw new Error('Service URL or internal token missing')
    const r=await fetch(`${base.replace(/\/+$/,'')}${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-content-service-token':process.env.CONTENT_SERVICE_INTERNAL_TOKEN},body:JSON.stringify({...runtime,executionContractVersion:EXECUTION_CONTRACT_VERSION}),signal:AbortSignal.timeout(60000),cache:'no-store'})
    if(!r.ok)throw new Error(`${source} preflight HTTP ${r.status}`)
    const data=await r.json()
    if(source==='content'){
      if(data.executionContractVersion!==EXECUTION_CONTRACT_VERSION||data.delegatedMedia!==true||!Array.isArray(data.tasks))throw new Error('Content delegated media contract is unavailable; deploy Content first')
      if(data.tasks.some((t:any)=>t.version!==runtime.version||t.executor!=='content'))throw new Error('Content media preflight configuration version or executor mismatch')
      assertQianfanPreflightConfirmation(qianfanRequests,data.tasks)
      tasks.push(...data.tasks)
      checks['system.kanban']=data.protocolVersion===2&&['text','json','conversation','tools'].every(k=>checks[k])&&checks.body_composition!==false&&data.tasks.filter((t:any)=>t.source==='kanban').every((t:any)=>t.passed)
      if(!checks['system.kanban'])errors['system.kanban']=[
        ...(failedTextChecks().length?[`Kanban text preflight failed: ${failedTextChecks().join(', ')}`]:[]),
        ...(data.protocolVersion!==2?['Content media preflight protocol version mismatch']:[]),
        ...data.tasks.filter((t:any)=>t.source==='kanban'&&!t.passed).map((t:any)=>`Content media task ${t.task}: ${t.error||'Validation failed'}`),
      ].join('; ')
      if(!data.success)errors['system.content']=data.tasks.filter((t:any)=>!t.passed).map((t:any)=>`${t.source}:${t.task}: ${t.error}`).join('; ')
    }
    return data.protocolVersion===2&&data.success===true
  })))
  if(!checks['system.kanban']&&!errors['system.kanban'])errors['system.kanban']=[
    ...(failedTextChecks().length?[`Kanban text preflight failed: ${failedTextChecks().join(', ')}`]:[]),
    `Kanban media delegation preflight unavailable: ${errors['system.content']||'Content returned no valid delegation result'}`,
  ].join('; ')
  const id=randomUUID(),report={checks,errors,diagnostics,tasks,models:runtime.models!.map(m=>({id:m.id,connectionId:m.connectionId,modelName:m.definition.modelName})),passed:Object.values(checks).every(Boolean)}
  await prisma.$executeRawUnsafe('INSERT INTO "ModelPolicyValidation" (id,fingerprint,report) VALUES ($1,$2,$3::jsonb)',id,configurationFingerprint(selection),JSON.stringify(report))
  return {id,...report}
}
