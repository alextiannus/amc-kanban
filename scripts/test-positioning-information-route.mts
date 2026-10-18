import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
let allowed=true,created=0,revision='a'.repeat(64),originalStatus='running',originalReason='',cancelled=0,resumed=0;const records:any[]=[]
const module={exports:{} as any},code=ts.transpileModule(readFileSync('src/app/api/brands/[id]/interview-information/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',code)((name:string)=>{
 if(name.includes('/http'))return {nativeHttp:async(request:Request,run:any)=>{try{return Response.json(await run('owner',request.method==='GET'?{}:await request.json()))}catch(e){return Response.json({error:'rejected'},{status:(e as any).statusCode||503})}}}
 if(name.includes('/contract'))return {actorFor:(brandId:string,userId:string)=>({brandId,userId})}
 if(name.includes('/application'))return {requireActor:async(actor:any)=>{assert.equal(actor.brandId,'brand-one');if(!allowed)throw Object.assign(Error(),{statusCode:403})}}
 if(name.includes('ai-native/service'))return {createNativeTask:async()=>({id:'task-'+(++created)}),readNativeTask:async()=>({status:originalStatus,waitingReason:originalReason}),controlNativeTask:async(_user:any,_brand:any,_task:any,input:any)=>{if(input.action==='resume')resumed++;else{assert.equal(input.action,'cancel');cancelled++}return {}}}
 if(name.includes('brand-plan/interview-information'))return {readInterviewInformationSources:async()=>({sourceRevision:revision,sourceHashes:{brand:'p',report:'r',interview:'i'},sources:{reportId:'11',skillVersion:'real-skill'},skillVersion:'real-skill',language:'zh',interviewInput:{content:'Real owner input'}}),interviewInformationTaskBody:(source:any)=>({requestKey:source.sourceRevision})}
 if(name.includes('/prisma'))return {prisma:{auditLog:{findFirst:async({where}:any)=>records.find(record=>{
  const resourceMatches=typeof where.resourceId==='string'?record.resourceId===where.resourceId:record.resourceId.startsWith(where.resourceId.startsWith)
  return resourceMatches&&(!where.metadata||record.metadata.sourceRevision===where.metadata.equals)
 })||null,create:async({data}:any)=>{records.push(data);return data}}}}
 throw Error('Unexpected import '+name)
},module,module.exports)
const request=(body:any)=>module.exports.POST(new Request('https://mm.test/api/brands/brand-one/interview-information',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:'brand-one'})})
let response=await request({sourceRevision:revision});assert.equal(response.status,200);assert.equal(created,1)
response=await request({sourceRevision:revision,language:'en'});assert.equal((await response.json()).taskId,'task-1');assert.equal(created,1,'Unchanged sources reuse the existing task even across language changes')
response=await request({sourceRevision:'stale'});assert.equal(response.status,409);assert.equal(created,1)
response=await request({sourceRevision:revision,retryOf:'task-1'});assert.equal(response.status,409);assert.equal(created,1,'Active tasks must not be duplicated')
originalStatus='failed';response=await request({sourceRevision:revision,retryOf:'task-1'});assert.equal(response.status,200);assert.equal(created,2)
originalStatus='waiting';originalReason='external_result';response=await request({sourceRevision:revision,retryOf:'task-2'});assert.equal(response.status,409);assert.equal(cancelled,0,'Uncertain external work is not cancelled or duplicated')
originalReason='limit';response=await request({sourceRevision:revision,retryOf:'task-2'});assert.equal(response.status,200);assert.equal(created,3);assert.equal(cancelled,1,'Explicit capacity recovery cancels the paused task before a reviewed new version')
originalReason='interrupted';response=await request({sourceRevision:revision,retryOf:'task-3'});assert.equal(response.status,200);assert.equal((await response.json()).taskId,'task-3');assert.equal(resumed,1);assert.equal(created,3,'Interrupted recovery resumes the same task under Core version and uncertainty checks');
response=await request({sourceRevision:revision,retryOf:'foreign-task'});assert.equal(response.status,409);assert.equal(created,3)
revision='b'.repeat(64);response=await request({sourceRevision:revision});assert.equal(response.status,200);assert.equal(created,4)
allowed=false;response=await request({sourceRevision:revision});assert.equal(response.status,403);assert.equal(created,4)
console.log('PASS: scoped positioning task creation, same-source reuse, locale reuse, stale source rejection, active retry rejection, failed retry and new-source generation, access denial')
