import {allowedTaskTools} from '../src/lib/ai-native/task-tools'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {insightDownloads,insightDocument} from '../src/lib/brand-plan/report-download'
import {conversationFiles,planningDocument} from '../src/lib/ai-native/chat-files'
import {conversationFrom} from '../src/lib/ai-native/contract'
import {validatePlanningDraft} from '../src/lib/ai-native/planning-workspace-contract'
const report:any={id:'51',title:'品牌洞察',content:'# 洞察\n\n完整原文，不是摘录。',source:'AMC Growth',pdfPath:'/downloads/brand-intelligence-intake/report.pdf'}
const links=insightDownloads('brand',report);assert.equal(links.length,2);assert(links.every(f=>f.url.includes('version=51')))
assert.equal(insightDownloads('brand',null).length,0)
assert.equal(insightDownloads('brand',{...report,pdfPath:undefined}).length,1)
assert.equal(insightDocument(report,'50').status,409)
assert.equal(insightDocument(report,null).status,409)
const download=insightDocument(report,'51');assert.match(download.headers.get('content-disposition')!,/^attachment/);assert.equal(await download.text(),report.content)
assert.equal(insightDocument({...report,content:''},'51').status,404)
assert.equal(conversationFiles('brand','task','你好',null,{report}).length,0,'ordinary reply does not attach repeated reports')
assert.equal(conversationFiles('brand','task','下载报告',null,{report}).length,2)
assert.equal(conversationFiles('brand','task','下载报告',{downloads:[{url:'https://bad'}]},null).length,0)
const plain:any={kind:'conversation',brandId:'brand',content:'可以，先从现有资料开始。',contextDigest:'a'.repeat(64)}
const intent:any={kind:'conversation',brandId:'brand',topic:'general'}
for(const interviewDraft of [null,{}, {answers:[]},{answers:[{question:'Q',answer:'hidden'}]}]){
 const reply=conversationFrom(JSON.stringify({...plain,interviewDraft}),intent);assert.equal(reply.content,plain.content);assert.equal(reply.interviewDraft,undefined)
}
const scope:any={stage:'quarter',mode:'draft',startMonth:'2027-01',quarter:2}
const draft:any={scope,expectedRevision:'a'.repeat(64),title:'秋季获客计划',content:'先做好门店转化。',data:{strategy:'策略',focus:'门店',campaigns:[],contentThemes:[],promotionPoints:[],monthlyFocus:['2027-07','2027-08','2027-09'].map(month=>({month,focus:'门店',promotionPoints:[]}))}}
assert.equal(validatePlanningDraft(draft,scope).title,'秋季获客计划')
assert.throws(()=>validatePlanningDraft({...draft,data:{...draft.data,monthlyFocus:[]}},scope),/invalid_quarter_draft/,'business months remain validated')
assert.equal(planningDocument({planningDraft:draft})?.content,draft.content)
const checklist=planningDocument({planningDraft:{title:'执行清单',content:'本期工作',scope:{stage:'execution_checklist'},data:{items:[{month:'2026-11',action:'制作美食探店视频',plannedTime:'11月中旬'}],informationToSupplement:['拍摄时间']}}})!
assert(checklist.content.includes('制作美食探店视频'));assert(checklist.content.includes('11月中旬'));assert(checklist.content.includes('拍摄时间'))
// Actual route handlers with controlled auth/source dependencies exercise status and no-read-before-auth behavior.
let auth:any=null,allowed=false,reads=0
function compile(file:string,imports:Record<string,unknown>){const m={exports:{} as any};const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)((name:string)=>{assert(name in imports,name);return imports[name]},m,m.exports);return m.exports}
const route=compile('src/app/api/brands/[id]/insight/document/route.ts',{
 '@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>auth},'@/lib/brandAccess':{canSessionAccessBrandProject:async()=>allowed},
 '@/lib/brand-plan/insight-service':{readAvailableInsight:async()=>{reads++;return {report}}},'@/lib/brand-plan/report-download':{insightDocument}
})
const get=(version='51')=>route.GET(new Request('https://host/api?version='+version),{params:Promise.resolve({id:'brand'})})
assert.equal((await get()).status,401);assert.equal(reads,0)
auth={user:{id:'owner',type:'HUMAN'}};assert.equal((await get()).status,404);assert.equal(reads,0)
allowed=true;assert.equal(await (await get()).text(),report.content);assert.equal((await get('old')).status,409)
console.log('PASS plain prose, hidden metadata discard, business validation retained, real versioned documents and route authorization')

assert.deepEqual(allowedTaskTools(['amc.growth_insight'],{kind:'conversation',topic:'general'} as any,[]),['amc.growth_insight'])
assert.deepEqual(allowedTaskTools(['amc.growth_insight'],{kind:'creative'} as any,[]),[])
