import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {prisma} from '../src/lib/prisma.ts'
const url=new URL(process.env.DATABASE_URL||'')
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const brandId=randomUUID(),userId=randomUUID(),sourceRevision='a'.repeat(64)
let created=0
const module={exports:{} as any}
const code=ts.transpileModule(readFileSync('src/app/api/brands/[id]/interview-information/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',code)((name:string)=>{
 if(name.includes('/http'))return {nativeHttp:async(request:Request,run:any)=>{try{return Response.json(await run(userId,await request.json()))}catch{return Response.json({error:'storage_request_failed'},{status:503})}}}
 if(name.includes('/contract'))return {actorFor:()=>({})}
 if(name.includes('/application'))return {requireActor:async()=>{}}
 if(name.includes('interview-task-recovery'))return {prepareInterviewRetry:async()=>{}}
 if(name.includes('ai-native/service'))return {createNativeTask:async()=>({id:'storage-task-'+(++created)}),readNativeTask:async()=>({status:'failed'})}
 if(name.includes('brand-plan/interview-information'))return {readInterviewInformationSources:async()=>({sourceRevision,sourceHashes:{brand:'p',report:'r',interview:'i'},sources:{reportId:'fixture'},skillVersion:'fixture',language:'zh',interviewInput:{content:'fixture',attachmentIds:[]}}),interviewInformationTaskBody:()=>({})}
 if(name.includes('/prisma'))return {prisma}
 throw Error('Unexpected import')
},module,module.exports)
const request=(extra={})=>module.exports.POST(new Request('https://mm.test/api/brands/'+brandId+'/interview-information',{method:'POST',body:JSON.stringify({sourceRevision,...extra})}),{params:Promise.resolve({id:brandId})})
try{
 let response=await request();assert.equal(response.status,200,'Actual audit schema must permit the first task lookup and receipt write')
 assert.equal((await response.json()).taskId,'storage-task-1')
 response=await request({language:'en'});assert.equal((await response.json()).taskId,'storage-task-1');assert.equal(created,1)
 response=await request({retryOf:'storage-task-1'});assert.equal((await response.json()).taskId,'storage-task-2')
 response=await request();assert.equal((await response.json()).taskId,'storage-task-2','Latest timestamp receipt wins after explicit failed-task retry')
 assert.equal(created,2)
 console.log('PASS: real audit schema, initial creation, same-source reuse and latest retry receipt')
}finally{
 await prisma.auditLog.deleteMany({where:{actorId:userId,resourceId:{startsWith:'interview-info:'+brandId+':'}}})
 await prisma.$disconnect()
}
