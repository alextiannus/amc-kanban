import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
let session:any={user:{id:'user',type:'HUMAN'}},allowed=true,calls:any[]=[]
let row:any={brandId:'brand',brandTone:'tone',audienceAssumptions:'audience',productAssumptions:'products',voiceId:'legacy',companionVoiceId:'',marketingSolution:{publishingCalendar:{large:'history'}},researchReport:'report'}
const deps:any={'next/server':{NextResponse:Response},'@/lib/auth':{getSession:async()=>session,extractApiKey:()=>null,getAgentFromApiKey:async()=>null},'@/lib/brandAccess':{canSessionAccessBrandProject:async()=>allowed},'@/lib/prisma':{prisma:{brandKnowledge:{findUnique:async(args:any)=>{calls.push(args);return row&&(!args.select?row:Object.fromEntries(Object.keys(args.select).map(k=>[k,row[k]])))}}}}}
const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync('src/app/api/brands/[id]/knowledge/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports)
const get=(view='')=>mod.exports.GET(new Request('https://app.test/api/brands/brand/knowledge'+view),{params:Promise.resolve({id:'brand'})})
const full=await(await get()).json(),response=await get('?view=companion'),small=await response.json()
assert.equal(response.headers.get('cache-control'),'no-store')
assert.deepEqual(small,Object.fromEntries(['brandId','brandTone','audienceAssumptions','productAssumptions','voiceId','companionVoiceId'].map(k=>[k,full[k]])))
assert(!calls[0].select);assert.equal(Object.keys(calls[1].select).length,6);assert(!calls[1].select.marketingSolution);assert(!('researchReport'in small));assert.equal(small.companionVoiceId,'legacy')
row=null;assert.deepEqual(await(await get('?view=companion')).json(),{brandId:'brand',brandTone:'',audienceAssumptions:'',productAssumptions:'',voiceId:'',companionVoiceId:''})
allowed=false;const count=calls.length;assert.equal((await get('?view=companion')).status,404);assert.equal(calls.length,count)
session=null;assert.equal((await get('?view=companion')).status,401);assert.equal(calls.length,count)
console.log('PASS companion projection parity, six DB columns, legacy voice fallback, missing row, no-store and authorization before reading')
