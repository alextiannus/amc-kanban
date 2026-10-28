import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
let access=true,write=true,calls:any[]=[]
const db={brand:{findUnique:async()=>({id:'brand',name:'Brand',knowledge:{}})}}
const deps:any={'../prisma':{prisma:db},'../user-management/brandAccess':{canUserAccessBrand:async(_b:any,_u:any,mode:string)=>access&&(mode==='READ'||write)},'../promotion-strategy/clients':{},'./brainstorm-match':{brainstormTagContext:(facts:any)=>facts},'./facts':{skuFacts:()=>[]},'./contract':{nativeError:(code:string,statusCode:number)=>Object.assign(Error(code),{code,statusCode})}}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/brand-keywords.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id:string)=>deps[id],mod,mod.exports)
const call=async(input:any)=>{calls.push(input);return {brandId:'brand',revision:1,tags:[]}}
const run=(input:any)=>mod.exports.brandKeywordsForUser('session-user','brand',input,db,call)
access=false;await assert.rejects(run({action:'read'}));assert.equal(calls.length,0)
access=true;write=false;assert.equal((await run({action:'read'})).canEdit,false);await assert.rejects(run({action:'save',entries:[],expectedRevision:1}))
write=true;await run({action:'save',entries:[],expectedRevision:1,actorId:'spoof',brandId:'other'})
assert.equal(calls.at(-1).actorId,'session-user');assert.equal(calls.at(-1).brandId,'brand')
console.log('PASS shared keyword access before service call, write permission, session actor and route brand binding')
