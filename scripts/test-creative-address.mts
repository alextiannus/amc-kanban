import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as contract from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as address from '../src/lib/brand-plan/creativeAddress.ts'
let authorized=true,reads=0,history:any[]=[]
let knowledge:any={marketingSolution:{publishingCalendar:{months:{'2026-09':[{id:'idea',date:'2026-12-20',planning:'Stored September',materialRequirements:[]}]}}}}
const actor={id:'user',type:'HUMAN'}
const db:any={
 user:{findUnique:async()=>({id:'user',status:'ACTIVE',businessRoles:[],role:'ADMIN'})},
 brandKnowledge:{findUnique:async({where}:any)=>{assert.equal(where.brandId,'brand');reads++;return knowledge}},
 brand:{findUnique:async()=>({id:'brand',name:'Brand'})},
 brandMarketingSolution:{findMany:async({where}:any)=>{assert.equal(where.brandId,'brand');assert.equal(where.kind,contract.CREATIVE_REVISION_KIND);return where.period?history.filter(row=>row.period===where.period):history},findFirst:async()=>history[0]},
}
const deps:any={
 './creativeAddress.ts':address,'./creativeRevisionContract.ts':contract,
 '../prisma.ts':{prisma:db},'../user-management/brandAccess.ts':{canUserAccessBrand:async()=>authorized},
 '../auth-v2/types.ts':{principalFromUser:()=>({globalRoles:['ADMIN']})},
 './creativeWorkspaceContract.ts':{normalizeCreativeWorkspaceItem:(item:any)=>item},
 '../revisionFeedback':{},'./revisionFeedback':{readCreativeFeedback:()=>null},
}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/brand-plan/creativeRevisions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports)
const read=(revisionId?:string)=>mod.exports.readCreativeRevisions(actor,'brand','','idea',revisionId,db)
let value=await read();assert.equal(value.month,'2026-09');assert.equal(value.current.date,'2026-12-20');assert.equal(value.expectedRevision,contract.creativeDigest(value.current))
knowledge.marketingSolution.publishingCalendar.months['2026-09'][0].date=null
assert.equal((await read()).month,'2026-09')
authorized=false;const before=reads;await assert.rejects(read(),(e:any)=>e.code==='creative_access_denied');assert.equal(reads,before);authorized=true
knowledge.marketingSolution.publishingCalendar.months['2026-10']=[{id:'idea'}]
await assert.rejects(read(),(e:any)=>e.code==='creative_not_found_or_ambiguous')
delete knowledge.marketingSolution.publishingCalendar.months['2026-10']
knowledge.marketingSolution.publishingCalendar.months['2026-09'].push({id:'idea'})
await assert.rejects(read(),(e:any)=>e.code==='creative_not_found_or_ambiguous')
knowledge={marketingSolution:{publishingCalendar:{months:{}}}}
await assert.rejects(read(),(e:any)=>e.code==='creative_not_found_or_ambiguous')
history=[{id:'revision-1',input:{creativeId:'idea',month:'2026-09'},period:contract.revisionPeriod('2026-09','idea'),version:1,createdAt:new Date(),output:{id:'idea',planning:'Historic'}}]
value=await read('revision-1');assert.equal(value.month,'2026-09');assert.equal(value.current,null);assert.equal(value.revisions[0].id,'revision-1')
history.push({...history[0],period:contract.revisionPeriod('2026-10','idea'),input:{creativeId:'idea',month:'2026-10'}})
await assert.rejects(read(),(e:any)=>e.code==='creative_not_found_or_ambiguous')
console.log('PASS: ID lookup resolves undated/date-shifted ideas; authorization before reads; duplicate/missing IDs fail closed; historical reads retain identity')
