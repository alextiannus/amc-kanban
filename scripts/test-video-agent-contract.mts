import {videoHostStep} from '../src/lib/ai-native/video-host-steps'
import {videoOutcome} from '../src/lib/ai-native/video-review'
import {prepareVideoCompletion} from '../src/lib/ai-native/video-completion'
import {parseScreenplay} from '../src/vendor/mm-video/lib/video-screenplay'
import assert from 'node:assert/strict'
import {literalVideoEdit,videoContractFor,videoProgress,requestedVideoCraft,videoInput,validateVideoArtifact,serializeVideo,requireVideoSkill,videoDigest,type VideoRewriteIntent} from '../src/lib/ai-native/video-rewrite'
const intent:VideoRewriteIntent={kind:'video_rewrite',brandId:'brand-a',userId:'actor',goal:'15秒，无口播，连续同一锅',requestKey:'test-request',artifactPath:'work/test.json',script:'人工稿',language:'zh',durationSec:15,editorRevision:'v1',facts:{},factsDigest:videoDigest({}),noVoice:true,noOverlay:false,singleSegment:true}
const good:any={kind:'video_rewrite',brandId:'brand-a',factsDigest:intent.factsDigest,editorRevision:'v1',language:'zh',durationSec:15,segments:[{id:'pot',start:0,end:15,visual:'同一锅食物',action:'保留人工动作',spokenText:'',audio:'拟拍环境声',camera:[{start:0,end:15,description:'稳定构图',stable:true}],overlays:[{start:12,end:15,text:'品牌'}],evidenceRefs:[],plannedNeeds:['拍摄真实锅物']}]}
const issues=(change:(a:any)=>void,i=intent)=>{const a=structuredClone(good);change(a);return validateVideoArtifact(JSON.stringify(a),i).issues.map(x=>x.code)}
assert.deepEqual(issues(()=>{}),[])
assert(issues(a=>a.segments[0].spokenText='不该有口播').includes('narration_forbidden'))
assert(issues(()=>{},{...intent,noOverlay:true}).includes('overlay_forbidden'))
assert(issues(a=>a.segments[0].overlays[0].start=14.5).includes('overlay_reading_time'))
assert(issues(a=>a.segments[0].camera[0].stable=false).includes('overlay_camera_conflict'))
assert(issues(a=>a.segments[0].spokenText='长'.repeat(90),{...intent,noVoice:false}).includes('speech_timing_risk'))
assert(issues(a=>{a.segments[0].end=14;a.segments[0].camera=[];a.segments[0].overlays=[]}).includes('duration_mismatch'))
assert(issues(a=>{a.segments[0].start=1;a.segments[0].camera[0].start=1}).includes('timeline_gap_or_overlap'))
for(const field of ['brandId','editorRevision','factsDigest'])assert.throws(()=>issues(a=>a[field]='forged'),/binding_mismatch/)
for(const [field,value] of [['durationSec',20],['language','en']])assert.throws(()=>issues(a=>a[field]=value),/requirements_mismatch/)
assert.throws(()=>issues(a=>a.segments[0].end=Infinity),/segment_invalid/)
assert.throws(()=>issues(a=>a.segments[0].camera[0].end=30),/camera_invalid/)
assert.throws(()=>issues(a=>a.segments[0].overlays[0].end=30),/overlay_invalid/)
const input={script:'人工保留句',language:'zh',editorRevision:'v1',targetDurationSec:15,goal:'改为英文，20秒，无口播'}
assert.equal(videoInput(input).durationSec,20);assert.equal(videoInput(input).language,'en');assert(videoInput(input).noVoice)
assert.equal(videoInput({...input,goal:'只改一个词'}).durationSec,15)
assert.throws(()=>videoInput({...input,targetDurationSec:-1,goal:'改文案'}),/duration/)
assert.throws(()=>videoInput({...input,script:'x'.repeat(12001)}),/input/)
assert.throws(()=>requireVideoSkill([]),/skill/)
const read=(resource?:string)=>({capability:'assistant.skills.read',status:'succeeded',input:{id:'amc-creative/SKILL.md',...(resource?{resource}:{})},result:{version:'fixed',skillVersion:'fixed'}})
assert.throws(()=>requireVideoSkill([read('references/video-rewrite.md'),read()]),/skill/)
assert.equal(requireVideoSkill([read(),read('references/video-rewrite.md')]).length,2)
assert.equal(serializeVideo(good).split('\n\n').length,1)
assert(serializeVideo(good).includes('保留人工动作'))
console.log('PASS video contract: constraints, timing, stable overlay windows, speech estimate, bindings, duration/language override, limits, required read ordering and single-segment serialization')

assert.deepEqual(requestedVideoCraft('只把品牌名称改成东北人餐厅'),[])
assert.equal(requestedVideoCraft('使用导演、运镜、制作技能').length,3)
assert.throws(()=>requireVideoSkill([read(),read('references/video-rewrite.md')],'使用导演技能'),/video-director/)
assert.equal(requireVideoSkill([read(),read('references/video-rewrite.md'),read('references/video-director.md')],'使用导演技能').length,3)
assert(issues(a=>a.segments[0].camera[0].description='固定机位缓慢拉远').includes('camera_stability_mismatch'))
assert(!issues(a=>a.segments[0].camera[0].description='固定机位，不拉远').includes('camera_stability_mismatch'))
for(const language of ['zh','en','id','ms'] as const){const artifact={...good,language};assert.equal(parseScreenplay(serializeVideo(artifact))[0].turns.length,0,'metadata must not become narration: '+language)}
console.log('PASS named craft loading gates, stable-wording conflict, and four-language no-narration editor serialization')

assert.equal(videoProgress('running',[{capability:'amc.video_review',status:'succeeded',result:{status:'repair_required'}}]),'repairing');assert.equal(videoProgress('waiting',[]),'paused');assert.equal(videoProgress('running',[{capability:'my_write_workspace',status:'succeeded'}]),'reviewing')

assert.equal(requireVideoSkill([read(),read('references/video-rewrite.md'),read(),read('references/video-rewrite.md')]).length,2,'reviewer receives one copy of each exact resource version')

assert(issues(a=>{a.segments=[{...a.segments[0],end:7.5,camera:[],overlays:[]},{...a.segments[0],id:'two',start:7.5,camera:[],overlays:[]}]}).includes('continuous_material_split'))

const narrow={...intent,goal:'只将“浅色描边”改为“深色描边”，其他内容不变',script:'备注：白字加浅色描边。\n保留人工句。'}
const patch={kind:'video_rewrite',brandId:narrow.brandId,editorRevision:narrow.editorRevision,factsDigest:narrow.factsDigest,language:narrow.language,durationSec:narrow.durationSec,literalEdit:literalVideoEdit(narrow),baseScriptDigest:videoDigest(narrow.script)}
assert.equal(serializeVideo(validateVideoArtifact(JSON.stringify(patch),narrow).artifact),'备注：白字加深色描边。\n保留人工句。')
assert.throws(()=>validateVideoArtifact(JSON.stringify({...patch,script:'额外正文'}),narrow),/preserve/)
assert.throws(()=>validateVideoArtifact(JSON.stringify({...patch,segments:good.segments}),narrow),/preserve/)
assert.throws(()=>validateVideoArtifact(JSON.stringify(patch),intent),/unexpected_literal/)
assert.equal(literalVideoEdit({...narrow,script:'浅色描边浅色描边'}),null)
assert.equal(literalVideoEdit({...narrow,goal:'只将“15秒”改为“20秒”'}),null)
assert('literalEdit' in videoContractFor(narrow))
console.log('PASS literal wording patch preserves every other character and rejects ambiguous or forged patches')

const ref={path:'work/test',revision:2,digest:'a'.repeat(64)}
const completeData={calls:[{capability:'amc.context',status:'succeeded',result:{intent:{kind:'video_rewrite',artifactPath:ref.path}}},{capability:'my_write_workspace',status:'succeeded',result:{reference:ref}},{id:'review',capability:'amc.video_review',status:'succeeded',result:{status:'passed',artifactRevision:2,artifactDigest:ref.digest}}],events:[{kind:'call_settled',data:{callId:'review'}}]}
const req=(d:any)=>({messages:[{role:'user',content:JSON.stringify(d)}],tools:[{name:'write'}]})
assert.equal(prepareVideoCompletion(req(completeData)).tools.length,0)
assert(prepareVideoCompletion(req(completeData)).messages.at(-1).content.includes(ref.digest))
for(const status of ['pending','repair_required']){const d=structuredClone(completeData);d.calls[2].result.status=status;assert.equal(prepareVideoCompletion(req(d)).tools.length,1)}
{const d=structuredClone(completeData);d.calls[2].result.artifactDigest='b'.repeat(64);assert.equal(prepareVideoCompletion(req(d)).tools.length,1)}
console.log('PASS terminal review receipt hint; pending, repair and stale review retain normal tools')

for(const goal of ['只将“浅色描边”改为“深色描边”，并改为英文20秒','只将“浅色描边”改为“深色描边”，再删除最后一句'])assert.equal(literalVideoEdit({...narrow,goal}),null,'compound instructions must not be reduced to one patch')
assert.throws(()=>validateVideoArtifact(JSON.stringify({...patch,baseScriptDigest:'wrong'}),narrow),/preserve/)

assert.equal(serializeVideo(validateVideoArtifact(JSON.stringify({...patch,baseScriptDigest:undefined,script:narrow.script.replace('浅色描边','深色描边')}),narrow).artifact),narrow.script.replace('浅色描边','深色描边'),'exact legacy receipt remains readable after deployment')

await assert.rejects(()=>videoOutcome({workspace:{read:async()=>({reference:{revision:2,digest:'same'}})}},{} as any,intent,'task',{reference:{revision:1,digest:'same'}},{calls:[read(),read('references/video-rewrite.md')]}),/video_artifact_stale/)
await assert.rejects(()=>videoOutcome({workspace:{read:async(_a:any,r:any)=>r.path===intent.artifactPath?{reference:{revision:1,digest:'same'}}:{content:JSON.stringify({artifactDigest:'same',artifactRevision:2,status:'passed'})}}},{} as any,intent,'task',{reference:{revision:1,digest:'same'}},{calls:[read(),read('references/video-rewrite.md')]}),/video_review_stale/)
console.log('PASS same-content different-revision artifacts cannot reuse a prior review')

const dollarIntent={...narrow,goal:'只将“浅色描边”改为“$&”'}
const dollarPatch={...patch,literalEdit:literalVideoEdit(dollarIntent)}
assert.equal(serializeVideo(validateVideoArtifact(JSON.stringify(dollarPatch),dollarIntent).artifact),'备注：白字加$&。\n保留人工句。','replacement metacharacters are literal user text')
const longIntent={...narrow,script:'浅色描边'+'字'.repeat(11996),goal:'只将“浅色描边”改为“非常长的深色描边”'}
assert.throws(()=>validateVideoArtifact(JSON.stringify({...patch,literalEdit:literalVideoEdit(longIntent),baseScriptDigest:videoDigest(longIntent.script)}),longIntent),/too_long/)

const hostCalls:any[]=[{id:'ctx',capability:'amc.context',status:'succeeded',result:{intent:narrow}}]
const hostRequest=()=>({billingContext:{capability:'agent.work'},messages:[{role:'user',content:JSON.stringify({calls:hostCalls,events:[]})}],tools:['amc.context','assistant.skills.read','amc.video_facts','my_write_workspace','amc.video_review'].map(name=>({name}))})
assert.equal(videoHostStep(hostRequest(),narrow),null,'model must select the main Skill')
hostCalls.push(read());assert.equal(videoHostStep(hostRequest(),narrow).input.resource,'references/video-rewrite.md')
hostCalls.push({...read('references/video-rewrite.md'),status:'failed'});assert.equal(videoHostStep(hostRequest(),narrow),null,'failed reads are not automatically replayed')
hostCalls.pop();hostCalls.push(read('references/video-rewrite.md'));assert.equal(videoHostStep(hostRequest(),narrow).name,'amc.video_facts')
hostCalls.push({capability:'amc.video_facts',status:'succeeded',result:{brand:'fixture'}})
const hostPatch=videoHostStep(hostRequest(),narrow);assert.equal(hostPatch.name,'my_write_workspace');assert.equal(JSON.parse(hostPatch.input.content).baseScriptDigest,videoDigest(narrow.script))
assert.equal(serializeVideo(validateVideoArtifact(hostPatch.input.content,narrow).artifact),narrow.script.replace('浅色描边','深色描边'))
hostCalls.push({id:'write',capability:'my_write_workspace',status:'succeeded',result:{reference:{path:narrow.artifactPath,revision:1,digest:'a'.repeat(64)}}})
assert.equal(videoHostStep(hostRequest(),narrow).name,'amc.video_review')
hostCalls.push({id:'review',capability:'amc.video_review',input:{revision:1,digest:'a'.repeat(64)},status:'succeeded',result:{status:'pending'}})
assert.equal(videoHostStep(hostRequest(),narrow),null,'pending reviews cannot finish or replay')
assert.equal(videoHostStep({...hostRequest(),billingContext:{capability:'amc.video_review'}},narrow),null,'review inference is never replaced by host steps')
console.log('PASS host proposal boundaries: model Skill choice, failed read/pending no replay, exact host patch, independent reviewer')
