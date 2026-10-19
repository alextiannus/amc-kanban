import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {admitBrandIdeas} from '../src/lib/ai-native/idea-selection'
import {creativeIsSelected,CREATIVE_SELECTION_POLICY} from '../src/lib/brand-plan/creativeVisibility'
import {nativeError,digest} from '../src/lib/ai-native/contract'
let calls=0
for(const score of [76,90,95,100]){
 const result=await admitBrandIdeas('user','brand',undefined,{$transaction:()=>{throw Error('automatic write')}} as any,async()=>{throw Error('automatic admission')})
 assert.equal(result.reason,'human_choice_required');assert.equal(result.selected.length,0)
 assert(!creativeIsSelected({matchScore:score,creativeBrowserSelection:{policy:CREATIVE_SELECTION_POLICY,reason:'automatic_high_match'}}))
}
assert(creativeIsSelected({creativeBrowserSelection:{policy:CREATIVE_SELECTION_POLICY,reason:'like'}}))
const lock={query:async()=>({rows:[]}),release:()=>{}},row={id:'run',enabled:true,current_owner:'user',current_account:'account',account_id:'account',daily_limit:2,current_limit:2,evidence:{strategyVersionId:'strategy'}}
const pool={connect:async()=>lock,query:async()=>({rows:[row]})}
const forbidden=new Proxy({}, {get:()=>()=>{calls++;throw Error('automatic creative effect')}})
const deps:any={'./autopilot-store':{autopilotDb:async()=>pool,requireAutopilotOwner:async()=>{}},'../prisma':{prisma:{socialAccount:{findFirst:async()=>({id:'account'})}}},'./idea-pool':{readIdeaPool:async()=>({items:[{source:{matchScore:95}}],shortfall:0})},'./contract':{nativeError,digest},'../amc-content/contentGenerationService':{generateContentDirect:forbidden.generate}}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/autopilot.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||forbidden,mod,mod.exports)
for(const action of ['adapt','save_adaptation','generate']){
 const result=await mod.exports.executeAutopilot('user','brand','run',action,{creativeId:'high-score-95'})
 assert.equal(result.waitingForUser,true);assert.equal(result.nextAction,'replicate_in_calendar')
}
const ideas=await mod.exports.readAutopilot('user','brand','run','ideas');assert.equal(ideas.ready,true);assert.equal(ideas.waitingForUser,true);assert.deepEqual(ideas.candidates,[]);assert.deepEqual(ideas.assets,[])
assert.equal(calls,0)
console.log('PASS real admission and autopilot handlers: 90+ never bypasses Like/Replicate; no automatic selection, adaptation, adoption or generation; real human Like remains visible')
