import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
let role='VIEWER',writes=0
const draft={revision:4,baseVersion:null,configuration:{defaults:{text:'model'},exceptions:{}},initializationReport:{complete:true}}
const dependencies:any={
  'next/server':{NextResponse:Response},
  '@/lib/auth':{getSession:async()=>({user:{id:'admin',role}})},
  '@/lib/model-management/registry':{overview:async()=>({draft})},
  '@/lib/model-management/migration':{importLegacyModels:async()=>{writes++;return {}}},
  '@/lib/model-management/validation':{validateSelection:async()=>{writes++;return {passed:true}}},
  '@/lib/model-management/draft':{readDraft:async()=>draft,saveDraft:async(s:any,r:number)=>{assert.equal(r,4);writes++;return{}},saveModelVersion:async()=>{writes++;return{}},publishDraft:async()=>{writes++;return{}}},
}
const exports:any={}
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/api/admin/models/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>dependencies[id],Response,Error})
const post=(body:any)=>exports.POST(new Request('https://fixture/api/admin/models',{method:'POST',body:JSON.stringify(body)}))
assert.equal((await exports.GET()).status,403)
for(const action of ['save-model','save-draft','import','validate','publish'])assert.equal((await post({action,expectedRevision:4})).status,403)
assert.equal(writes,0)
role='ADMIN'
assert.equal((await exports.GET()).status,200)
assert.equal(writes,0,'GET is read-only')
assert.equal((await post({action:'model'})).status,400,'obsolete standalone creation cannot bypass draft workflow')
assert.equal((await post({action:'validate',expectedRevision:3})).status,409)
assert.equal(writes,0)
draft.initializationReport.complete=false
assert.equal((await post({action:'validate',expectedRevision:4})).status,409)
assert.equal(writes,0)
draft.initializationReport.complete=true
assert.equal((await post({action:'validate',expectedRevision:4})).status,200)
assert.equal((await post({action:'save-draft',expectedRevision:4,selection:draft.configuration})).status,200)
const ui=readFileSync(new URL('../src/components/admin/SystemTab.tsx',import.meta.url),'utf8')
assert.equal((ui.match(/<UnifiedModelManagement/g)||[]).length,1)
assert.ok(!ui.includes('/api/admin/llm-configs'))
assert.ok(!ui.includes('GlobalTextModel'))
console.log('PASS: admin authorization, read-only GET, obsolete write rejection, draft revision and incomplete-initialization gates, single UI entry')
