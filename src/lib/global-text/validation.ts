import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.ts'
import { candidateBinding, connectionFor, executeBound, signBinding, PROTOCOL_VERSION } from './policy.ts'

export async function validateGlobalConnection(connectionId:string,preflight=false) {
  const binding=await candidateBinding(connectionId)
  const c=await connectionFor(binding)
  const checks:Record<string,boolean>={}
  const errors:Record<string,string>={}
  async function check(name:string,run:()=>Promise<boolean>){try{checks[name]=await run()}catch(e){checks[name]=false;errors[name]=e instanceof Error?e.message:'Check failed'}}
  await check('text',async()=>Boolean((await executeBound(binding,{timeoutMs:30000,task:'validation.text',messages:[{role:'user',content:'Reply only OK'}],maxTokens:1024})).text?.trim()))
  await check('json',async()=>{const r=await executeBound(binding,{timeoutMs:30000,task:'validation.json',messages:[{role:'user',content:'Return only valid JSON, no markdown: {"ok":true}'}],maxTokens:1024});return JSON.parse(r.text||'').ok===true})
  await check('conversation',async()=>{const code=randomUUID().slice(0,8);const r=await executeBound(binding,{timeoutMs:30000,task:'validation.conversation',messages:[{role:'user',content:`Remember ${code}`},{role:'assistant',content:'OK'},{role:'user',content:'Reply only with the code I provided.'}],maxTokens:1024});return r.text?.trim()===code})
  await check('tools',async()=>{
    const tools=[{type:'function',function:{name:'echo_probe',description:'Return the supplied string',parameters:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}}]
    const messages:any[]=[{role:'user',content:'Call echo_probe with value test.'}]
    const first=await executeBound(binding,{timeoutMs:30000,task:'validation.tools',messages,tools,toolChoice:{type:'function',function:{name:'echo_probe'}},maxTokens:2048})
    const calls=first.message.tool_calls;if(calls?.length!==1||calls[0].function.name!=='echo_probe'||JSON.parse(calls[0].function.arguments).value!=='test')return false
    const marker=randomUUID().slice(0,8)
    const second=await executeBound(binding,{timeoutMs:30000,task:'validation.tool_result',messages:[...messages,first.message,{role:'tool',tool_call_id:calls[0].id,content:marker},{role:'user',content:'Reply only with the exact tool result.'}],maxTokens:2048})
    return second.text?.trim()===marker
  })
  const systems:Record<string,boolean>={kanban:Object.values(checks).every(Boolean),content:false,mm:false}
  if(preflight&&systems.kanban){
    for(const [source,base,path]of [
      ['content',process.env.AMC_CONTENT_SERVICE_URL,'/v1/internal/global-text/preflight'],
      ['mm',process.env.AMC_MM_SERVICE_URL||'https://amc-mm.immedi.ai','/api/internal/global-text/preflight'],
    ] as Array<[string,string|undefined,string]>)await check(`system.${source}`,async()=>{
      if(!base)throw new Error(`${source} service URL is not configured`)
      const token=process.env.CONTENT_SERVICE_INTERNAL_TOKEN;if(!token)throw new Error('Internal service token is not configured')
      const b={...binding,source}
      const response=await fetch(`${base.replace(/\/+$/,'')}${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-content-service-token':token},body:JSON.stringify({binding:signBinding(b),protocolVersion:PROTOCOL_VERSION}),signal:AbortSignal.timeout(60000),cache:'no-store'})
      if(!response.ok)throw new Error(`${source} preflight HTTP ${response.status}`)
      const data=await response.json();systems[source]=data.protocolVersion===PROTOCOL_VERSION&&data.connectionId===c.id&&data.success===true;return systems[source]
    })
  }
  const report={checks,errors,systems,passed:Object.values(checks).every(Boolean)&&Object.values(systems).every(Boolean)}
  const id=randomUUID()
  await prisma.$executeRawUnsafe('INSERT INTO "GlobalTextValidation" (id,"connectionId",fingerprint,report) VALUES ($1,$2,$3,$4::jsonb)',id,c.id,binding.fingerprint,JSON.stringify(report))
  return {id,connectionId:c.id,...report}
}
