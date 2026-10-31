import {parseScreenplay} from '../src/vendor/mm-video/lib/video-screenplay'
import assert from 'node:assert/strict'
import {requestedVideoCraft,videoInput,validateVideoArtifact,serializeVideo,requireVideoSkill,videoDigest,type VideoRewriteIntent} from '../src/lib/ai-native/video-rewrite'
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
