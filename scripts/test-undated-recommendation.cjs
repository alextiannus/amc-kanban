const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {createHash} = require('node:crypto')
const ts = require('typescript')
const {validateCreativeWorkspacePatch} = require('../src/lib/brand-plan/creativeWorkspaceContract.ts')
const revisionContract = require('../src/lib/brand-plan/creativeRevisionContract.ts')
const matchingContract = require('../src/lib/brand-plan/matchingContract.ts')

const source = readFileSync('src/lib/ai-native/recommendations.ts', 'utf8')
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let saved
const candidate={sourceCreativeId:'cre_fixture',title:'Original title',planning:'Original script',aiCaption:'Original caption',materialRequirements:['Footage'],skuIds:[]}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const deps={
  './facts':{readBrandFacts:async()=>({timezone:'Asia/Singapore',productCatalog:[]}),validateSkuReferences:()=>true},
  '../prisma':{prisma:{}},
  '../brand-plan/creativeRevisionContract':{creativeDigest:digest},
  '../brand-plan/creativeWorkspaceContract':{validateCreativeWorkspacePatch},
  '../brand-plan/creativeRevisions':{
    saveCreativeRevision:async(...args)=>{saved={month:args[2],body:args[4],seed:args[7]};return {receipt:{id:'revision-1',contentHash:'hash',content:saved.seed}}},
    readCreativeRevisions:async()=>({revisions:[{contentHash:'hash'}]})
  },
  '../brand-plan/calendarSync':{calendarCreativeOption:content=>content},
  './contract':{digest,nativeError:(code,statusCode)=>Object.assign(new Error(code),{code,statusCode})},
  './library':{discoveryFrom:()=>({recommendations:[candidate],contextDigest:'context'})},
}
const moduleRef={exports:{}}
new Function('require','module','exports',compiled)((key)=>{assert(key in deps,key);return deps[key]},moduleRef,moduleRef.exports)
const {saveRecommendation}=moduleRef.exports
const intent={kind:'creative_discovery',automaticDaily:true,poolIdeaId:'pool-1',planningRequest:{id:'request-1',month:'2026-12',platform:'instagram'}}
const library={sources:[{inspirationCreativeId:'cre_fixture',sourcePost:{title:'Source'},scriptContent:{kind:'post'}}],retrievedAt:'2026-10-16T00:00:00Z',libraryDigest:'digest',contentMatchRequestId:'source-request'}
const patch={title:'Reviewed title',planning:'Reviewed script',aiCaption:'Reviewed caption',materialRequirements:['Owned footage'],platformTargets:['instagram']}

;(async()=>{
  const result=await saveRecommendation('user','brand','task',intent,{path:'artifact',revision:1,digest:'artifact'},'{}',library,{sourceCreativeId:'cre_fixture',month:'2026-12',patch},false,{id:'request-1',targetId:'target-1',month:'2026-12'})
  assert.equal(result.verified,true)
  assert.equal(saved.month,'2026-12')
  assert.equal(saved.seed.status,'idea_pending')
  assert.equal(saved.seed.schedule,null)
  assert.equal(saved.seed.date,undefined)
  assert.equal(saved.body.patch.date,undefined)
  assert.deepEqual(saved.seed.platformTargets,['instagram'])
  await assert.rejects(()=>saveRecommendation('user','brand','task',intent,{path:'artifact',revision:1,digest:'artifact'},'{}',library,{sourceCreativeId:'cre_fixture',month:'2026-12',patch:{...patch,date:'2026-12-01'}},false,{id:'request-1',targetId:'target-1',month:'2026-12'}),error=>error.code==='reviewed_creative_required')
  let requestRow=null
  const knowledge={marketingSolution:{annualPlan:{strategy:'Fixture strategy'}}}
  const tx={
    $queryRaw:async()=>[],
    brandKnowledge:{findUnique:async()=>knowledge},
    brandMarketingSolution:{findFirst:async()=>requestRow,create:async({data})=>{requestRow={...data,id:'request-1'};return requestRow}},
  }
  const database={
    brand:{findUniqueOrThrow:async()=>({timezone:'Asia/Singapore',status:'ACTIVE'})},
    brandKnowledge:{findUnique:async()=>knowledge},
    brandMarketingSolution:{findFirst:async()=>requestRow},
    $transaction:async fn=>fn(tx),
  }
  const matchingSource=readFileSync('src/lib/ai-native/calendar-planning.ts','utf8')
  const matchingCompiled=ts.transpileModule(matchingSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const matchingDeps={
    '../prisma':{prisma:database},
    '../brand-plan/creativeRevisionContract':revisionContract,
    '../brand-plan/matchingContract':matchingContract,
    './contract':{actorFor:()=>({}),nativeError:(code,statusCode)=>Object.assign(new Error(code),{code,statusCode})},
    './application':{requireActor:async()=>{}},
    './service':{},'./store':{},'./library':{},'./recommendations':{},'./creative-diversity':{},
  }
  const matchingModule={exports:{}}
  new Function('require','module','exports',matchingCompiled)((key)=>{assert(key in matchingDeps,key);return matchingDeps[key]},matchingModule,matchingModule.exports)
  const response=await matchingModule.exports.requestCalendarMatching('user','brand',{month:'2099-12',publishingFreqOverride:{platforms:{instagram:{postsPerMonth:2},tiktok:{postsPerMonth:1}}}})
  assert.equal(requestRow.input.targetCount,3)
  assert.deepEqual(requestRow.input.platformTargets,[{platform:'instagram',count:2},{platform:'tiktok',count:1}])
  assert.equal(requestRow.input.slots,undefined)
  assert(requestRow.input.targets.every(target=>target.date===undefined))
  assert.equal(response.request.pending.length,3)
  console.log('PASS: monthly request has undated targets; recommendation seeds an undated idea and rejects dated input')
})().catch(error=>{console.error(error);process.exitCode=1})
