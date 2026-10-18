import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {creativeIsVisible,dislikedCreativeSources} from '../src/lib/brand-plan/creativeVisibility.ts'
import {readBrandFacts,creativePortfolioFromMarketingSolution} from '../src/lib/ai-native/facts.ts'
import {digest,nativeError} from '../src/lib/ai-native/contract.ts'
const solution={publishingCalendar:{months:{'2026-10':[{id:'dismissed',inspirationCreativeId:'cre_old',brandDismissal:{decision:'dislike',sourceId:'cre_old'}},{id:'kept',inspirationCreativeId:'cre_good'}]}}}
assert.deepEqual([...dislikedCreativeSources(solution)],['cre_old']);assert(!creativeIsVisible(solution.publishingCalendar.months['2026-10'][0]));assert.equal(creativePortfolioFromMarketingSolution(solution).length,1)
const facts=await readBrandFacts({brand:{findUnique:async()=>({id:'brand',name:'Test brand',knowledge:{marketingSolution:solution}})}},'brand')
assert.deepEqual(facts.dislikedSourceIds,['cre_old']);assert(!JSON.stringify(facts.creativePortfolio).includes('cre_old'))
let request:any
const deps:any={'./idea-pool':{},'../promotion-strategy/clients':{matchPromotionStrategyCreativeCandidates:async(input:any)=>{request=input;return {creativeCandidates:[{inspirationCreativeId:'cre_old'},{inspirationCreativeId:'cre_good'}]}}},'./contract':{digest,nativeError},'../brand-plan/creativeRevisionContract':{}}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/library.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key],mod,mod.exports)
const result=await mod.exports.brandLibrary({brandId:'brand',requestKey:'test',planningRequest:{platform:'instagram',excludeCreativeIds:['cre_previous']}},facts)
assert.deepEqual(request.excludeCreativeIds,['cre_old','cre_previous']);assert.deepEqual(result.sources.map((s:any)=>s.inspirationCreativeId),['cre_good'])
console.log('PASS: disliked sources are removed from creative context and generic recommendations, even if the matching service returns an excluded source')
