import assert from 'node:assert/strict'
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test'
process.env.JWT_SECRET='test-signing-secret-not-production'
const {prisma}=await import('../src/lib/prisma.ts')
const {fingerprint,complete}=await import('../src/lib/global-text/transport.ts')
const {currentBinding,withTextScope,strictText,signBinding,verifyBinding,executeBound,applyPolicy}=await import('../src/lib/global-text/policy.ts')
const {callLLM,callLLMChat}=await import('../src/lib/llmRouter.ts')
const c={id:'one',provider:'custom_shim',displayName:'Any compatible supplier',modelName:'glm-5.3',baseUrl:'https://supplier.test/v1',apiKey:'test-only',timeoutMs:1000,isEnabled:true}
const d={...c,id:'two',modelName:'another-model',apiKey:'test-two'}
const revisions:any[]=[{version:0,enabled:false,connectionId:null,fingerprint:null},{version:1,enabled:true,connectionId:c.id,fingerprint:fingerprint(c)}]
let version=1, failure=0
const logs:any[]=[], requests:any[]=[]
const original={fetch:globalThis.fetch,query:prisma.$queryRawUnsafe,exec:prisma.$executeRawUnsafe,transaction:prisma.$transaction,findUnique:prisma.lLMConfig.findUnique,findMany:prisma.lLMConfig.findMany}
prisma.lLMConfig.findUnique=async({where}:any)=>where.id==='one'?c:d
prisma.lLMConfig.findMany=async()=>[]
prisma.$queryRawUnsafe=async(sql:string,...args:any[])=>{
 if(sql.includes('JOIN "GlobalTextRevision"'))return [revisions.find(r=>r.version===version)]
 if(sql.includes('FOR UPDATE'))return [{version}]
 if(sql.includes('GlobalTextValidation'))return [{fingerprint:fingerprint(d),report:{passed:true},createdAt:new Date()}]
 throw new Error(`Unexpected query ${sql}`)
}
prisma.$executeRawUnsafe=async(sql:string,...args:any[])=>{
 if(sql.includes('INSERT INTO "GlobalTextRevision"'))revisions.push({version:args[0],enabled:args[1],connectionId:args[2],fingerprint:args[3]})
 else if(sql.includes('UPDATE "GlobalTextPolicy"'))version=args[0]
 else if(sql.includes('GlobalTextCall'))logs.push(args)
 return 1
}
prisma.$transaction=async(fn:any)=>fn({...prisma,auditLog:{create:async()=>({})}})
globalThis.fetch=async(url,init)=>{
 requests.push({url:String(url),body:JSON.parse(String(init?.body))})
 if(failure)return new Response('Do not reveal provider response body',{status:failure})
 return Response.json({model:'glm-5.3-resolved',choices:[{message:{role:'assistant',content:'OK'}}]})
}
try{
 await withTextScope(async()=>{
   const first=await callLLM('unmapped_task','Hello',1500,{allowAnyFallback:true,allowSystemFallback:true})
   assert.equal(first.modelName,'glm-5.3')
   version=0
   assert.equal((await callLLMChat('unmapped',[{role:'user',content:'Again'}],1500)).modelName,'glm-5.3','job must retain pinned revision')
 })
 assert.equal(await strictText({messages:[{role:'user',content:'off'}]}),null)
 version=1
 const binding=await currentBinding()
 assert.deepEqual(verifyBinding(signBinding(binding)),binding)
 assert.throws(()=>verifyBinding(signBinding(binding)+'x'))
 assert.throws(()=>verifyBinding(signBinding({...binding,expires:1})))
 for(const status of [400,401,429,500]){
   failure=status;const before=requests.length
   await assert.rejects(()=>callLLM('copywriting','hello'),new RegExp(`HTTP ${status}`))
   assert.equal(requests.length,before+1,'strict error must never call a second provider')
 }
 failure=0
 await assert.rejects(()=>executeBound(binding,{messages:[{role:'user',content:[{type:'image_url'}]}]}),/text only/)
 const key=c.apiKey;c.apiKey='changed'
 await assert.rejects(()=>executeBound(binding,{messages:[{role:'user',content:'hi'}]}),/changed/);c.apiKey=key
 await applyPolicy({expectedVersion:1,enabled:true,connectionId:'two',validationId:'valid'},'admin')
 assert.equal(version,2)
 await assert.rejects(()=>applyPolicy({expectedVersion:1,enabled:false,connectionId:null},'admin'),/changed/)
 assert.equal((await executeBound(binding,{messages:[{role:'user',content:'pinned'}]})).modelName,'glm-5.3')
 assert.equal((await strictText({messages:[{role:'user',content:'new'}]}))?.modelName,'another-model')
 assert.ok(logs.length>=7);assert.ok(!JSON.stringify(logs).includes('test-only'))
 assert.ok(!JSON.stringify(logs).includes('Do not reveal'))
 await complete(c,{messages:[{role:'user',content:'hello'}],maxTokens:1500})
 assert.equal(requests.at(-1).body.model,'glm-5.3')
 assert.equal(requests.at(-1).body.stream,false)
 assert.equal(requests.at(-1).body.max_tokens,1500)
 const gateway=await import('../src/app/api/internal/global-text/route.ts')
 process.env.CONTENT_SERVICE_INTERNAL_TOKEN='test-service-token'
 assert.equal((await gateway.GET(new Request('http://localhost/api/internal/global-text'))).status,401)
 assert.equal((await gateway.POST(new Request('http://localhost/api/internal/global-text',{method:'POST',body:'{}'}))).status,401)
 const beforeInvalid=requests.length
 assert.equal((await gateway.POST(new Request('http://localhost/api/internal/global-text',{method:'POST',headers:{'x-content-service-token':'test-service-token'},body:JSON.stringify({binding:'invalid'})}))).status,502)
 assert.equal(requests.length,beforeInvalid)
 globalThis.fetch=async()=>Response.json({choices:[{message:{role:'assistant',content:''}}]})
 await assert.rejects(()=>complete(c,{messages:[{role:'user',content:'hello'}]}),/empty response/)
 globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('timeout did not abort')),500)
   init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal?.reason)},{once:true})
 })
 await assert.rejects(()=>executeBound(binding,{messages:[{role:'user',content:'hello'}],timeoutMs:5}),/timeout/i)
 console.log('PASS: strict routing, explicit unmapped tasks, pinning, signatures, no fallback, CAS, connection integrity, redacted logs')
}finally{
 globalThis.fetch=original.fetch;prisma.$queryRawUnsafe=original.query;prisma.$executeRawUnsafe=original.exec;prisma.$transaction=original.transaction;prisma.lLMConfig.findUnique=original.findUnique;prisma.lLMConfig.findMany=original.findMany
 await prisma.$disconnect()
}
