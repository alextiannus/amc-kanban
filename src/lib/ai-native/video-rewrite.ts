import {createHash} from 'node:crypto'
import {stableJson} from '../brand-plan/creativeRevisionContract'

// Explicit empty configuration disables new admissions; existing task receipts still reconcile.
export const videoRewriteEnabled=(brandId:string)=>(process.env.AMC_VIDEO_AGENT_BRANDS??'cmr1sictu003eio2auldwt26m').split(',').map(v=>v.trim()).filter(Boolean).includes(brandId)
export const VIDEO_SKILL='amc-creative/SKILL.md'
export const VIDEO_RESOURCE='references/video-rewrite.md'
// Explicitly requested disciplines are required; other craft references remain agent-selected.
export function requestedVideoCraft(goal:string){return [
 [/导演|director|叙事|narrative/i,'references/video-director.md'],
 [/剧情|劇情|编剧|編劇|对白|對白|台词|臺詞|screenwrit|story[- ]led|dialogue/i,'references/video-screenwriting.md'],
 [/剧情|劇情|分镜|分鏡|镜头衔接|鏡頭銜接|转场|轉場|storyboard|story[- ]led|shot.*(?:transition|continuity)/i,'references/video-storyboard.md'],
 [/品牌口吻|品牌表达|品牌表達|营销口播|行銷口播|brand voice|marketing copy/i,'references/video-brand-voice.md'],
 [/运镜|camera|镜头运动/i,'references/video-camera.md'],
 [/制作|production|音效|audio|时长/i,'references/video-production.md'],
].filter(([pattern])=>(pattern as RegExp).test(goal)).map(([,resource])=>resource as string)}
export const videoDigest=(value:unknown)=>createHash('sha256').update(stableJson(value)).digest('hex')
export type VideoRewriteIntent={kind:'video_rewrite';brandId:string;userId:string;goal:string;requestKey:string;artifactPath:string;script:string;language:'zh'|'en'|'id'|'ms';durationSec:number;editorRevision:string;facts:unknown;factsDigest:string;noVoice:boolean;noOverlay:boolean;singleSegment:boolean;predecessorTaskId?:string}
export type VideoIssue={code:string;severity:'error'|'warning';location:string;message:string}
export type VideoSegment={id:string;start:number;end:number;visual:string;action:string;spokenText:string;audio:string;camera:Array<{start:number;end:number;description:string;stable:boolean}>;overlays:Array<{start:number;end:number;text:string}>;evidenceRefs:string[];plannedNeeds:string[]}
export type VideoArtifact={kind:'video_rewrite';brandId:string;editorRevision:string;factsDigest:string;language:VideoRewriteIntent['language'];durationSec:number;segments:VideoSegment[];literalEdit?:{from:string;to:string};script?:string}
const fail=(code:string)=>Object.assign(new Error(code),{code,statusCode:400})
export function videoInput(body:any){
 if(typeof body.script!=='string'||!body.script.trim()||body.script.length>12000||!['zh','en','id','ms'].includes(body.language)||typeof body.editorRevision!=='string'||!/^[-\w]{1,100}$/.test(body.editorRevision))throw fail('invalid_video_input')
 let duration=body.targetDurationSec??15
 const explicit=String(body.goal).match(/(?:^|[^\d])(\d{1,3}(?:\.\d+)?)\s*(?:秒|seconds?\b|secs?\b)/i)
 if(explicit)duration=Number(explicit[1])
 if(!Number.isFinite(duration)||duration<=0||duration>600)throw fail('invalid_video_duration')
 if(body.predecessorTaskId!==undefined&&(typeof body.predecessorTaskId!=='string'||!/^[-a-f0-9]{36}$/i.test(body.predecessorTaskId)))throw fail('invalid_video_predecessor')
 const goal=String(body.goal)
 const language=/改(?:为|成|用).*英文|用英文|in English/i.test(goal)?'en':/改(?:为|成|用).*中文|用中文|in Chinese/i.test(goal)?'zh':body.language
 return {...(body.predecessorTaskId?{predecessorTaskId:body.predecessorTaskId}:{}),script:body.script,language,durationSec:duration,editorRevision:body.editorRevision,noVoice:/无口播|不要口播|不加口播|no (?:voiceover|narration)|without (?:voiceover|narration)/i.test(goal),noOverlay:/无字幕|不要字幕|no (?:captions|subtitles|overlays)/i.test(goal),singleSegment:/单素材|连续同一|同一锅|single (?:segment|continuous)/i.test(goal)}
}
// A narrow, explicit one-occurrence wording change has an exact preservation contract.
// Ambiguous, multi-change or numeric/timeline edits continue through normal drafting.
export function literalVideoEdit(intent:Pick<VideoRewriteIntent,'goal'|'script'>){
 const g=intent.goal
 if(!/只|仅|only/i.test(g))return null
 const match=g.match(/^(?:只|仅)(?:做一个小修改[：:]\s*)?(?:将|把)?(?:备注中的)?[“"]([^”"\n]{1,160})[”"]\s*(?:改为|改成|替换为)\s*[“"]([^”"\n]{1,160})[”"][。；;，,\s]*(?:(?:其余|其他)(?:所有)?(?:内容|文字)?(?:全部|逐字)?(?:保持)?不变[。\s]*)?$/)
 if(!match)return null
 const [,from,to]=match
 if(from===to||/[0-9\n]/.test(from+to)||intent.script.split(from).length!==2)return null
 return {from,to}
}
export function videoContractFor(intent:VideoRewriteIntent){
 const patch=literalVideoEdit(intent)
 return patch?{kind:'video_rewrite',brandId:intent.brandId,editorRevision:intent.editorRevision,factsDigest:intent.factsDigest,language:intent.language,durationSec:intent.durationSec,literalEdit:patch,baseScriptDigest:videoDigest(intent.script),instructions:'Submit only these binding fields and literalEdit/baseScriptDigest; omit script, segments and this instructions field. The host applies the exact patch to the frozen baseline. Independent review still required.'}:{...videoArtifactContract,brandId:intent.brandId,editorRevision:intent.editorRevision,factsDigest:intent.factsDigest,language:intent.language,durationSec:intent.durationSec,segments:videoArtifactContract.segments.map(s=>({...s,end:intent.durationSec,camera:s.camera.map(c=>({...c,end:intent.durationSec}))}))}
}
export const videoArtifactContract={kind:'video_rewrite',brandId:'from intent',editorRevision:'from intent',factsDigest:'from intent',language:'from intent',durationSec:'from intent',segments:[{id:'segment-1',start:0,end:'durationSec',visual:'visible subject and setting',action:'performable action',spokenText:'empty when no narration',audio:'sound plan, distinguish proposed and observed',camera:[{start:0,end:'durationSec',description:'camera movement or hold',stable:true}],overlays:[{start:0,end:3,text:'optional factual overlay'}],evidenceRefs:['brand or merchant fact source'],plannedNeeds:['proposed footage, not claimed existing']} ]}
const str=(v:unknown,max=4000)=>typeof v==='string'&&v.length<=max
const interval=(v:any,start:number,end:number)=>v&&Number.isFinite(v.start)&&Number.isFinite(v.end)&&v.start>=start&&v.end<=end&&v.end>v.start
export function validateVideoArtifact(content:string,intent:VideoRewriteIntent):{artifact:VideoArtifact;issues:VideoIssue[]}{
 if(Buffer.byteLength(content)>64000)throw fail('video_artifact_too_large')
 const a=JSON.parse(content)
 if(a?.kind!=='video_rewrite'||a.brandId!==intent.brandId||a.editorRevision!==intent.editorRevision||a.factsDigest!==intent.factsDigest)throw fail('video_binding_mismatch')
 if(a.language!==intent.language||a.durationSec!==intent.durationSec)throw fail('video_requirements_mismatch')
 const patch=literalVideoEdit(intent)
 if(patch){
  const edited=intent.script.replace(patch.from,()=>patch.to)
  if(edited.length>12000)throw fail('video_script_too_long')
  const legacyExact=a.baseScriptDigest===undefined&&a.script===edited
  if(a.literalEdit?.from!==patch.from||a.literalEdit?.to!==patch.to||(!legacyExact&&(a.baseScriptDigest!==videoDigest(intent.script)||a.script!==undefined))||a.segments!==undefined)throw fail('literal_edit_must_preserve_other_characters')
  return {artifact:{...a,script:edited},issues:[]}
 }
 if(a.literalEdit!==undefined||a.script!==undefined)throw fail('unexpected_literal_edit')
 if(!Array.isArray(a.segments)||a.segments.length<1||a.segments.length>40)throw fail('video_requirements_mismatch')
 const issues:VideoIssue[]=[],ids=new Set<string>()
 const issue=(code:string,location:string,message:string,severity:'error'|'warning'='error')=>issues.push({code,location,message,severity})
 let end=0
 for(const s of a.segments){
  if(!s||!str(s.id,80)||!s.id||ids.has(s.id)||!interval(s,0,a.durationSec)||!['visual','action','spokenText','audio'].every(k=>str(s[k]))||!s.visual.trim()||!Array.isArray(s.camera)||s.camera.length>30||!Array.isArray(s.overlays)||s.overlays.length>30||!Array.isArray(s.evidenceRefs)||s.evidenceRefs.length>30||s.evidenceRefs.some((x:unknown)=>!str(x,500))||!Array.isArray(s.plannedNeeds)||s.plannedNeeds.length>30||s.plannedNeeds.some((x:unknown)=>!str(x,500)))throw fail('video_segment_invalid')
  ids.add(s.id)
  if(Math.abs(s.start-end)>0.01)issue('timeline_gap_or_overlap',s.id,'Segments must be continuous and non-overlapping.')
  end=s.end
  if(intent.noVoice&&s.spokenText.trim())issue('narration_forbidden',s.id,'Remove narration as requested.')
  if(intent.noOverlay&&s.overlays.length)issue('overlay_forbidden',s.id,'Remove overlays as requested.')
  const words=a.language==='zh'?s.spokenText.replace(/\s/g,'').length:s.spokenText.trim().split(/\s+/).filter(Boolean).length
  if(words>(s.end-s.start)*(a.language==='zh'?4:2))issue('speech_timing_risk',s.id,'Shorten speech to fit natural timing; this is an estimate, not measured audio.')
  for(const c of s.camera)if(!interval(c,s.start,s.end)||!str(c.description,1000)||typeof c.stable!=='boolean')throw fail('video_camera_invalid')
  for(const c of s.camera){
   const positive=c.description.replace(/(?:不|无|禁止|避免|不要)[^，。；;]*|\b(?:no|without|avoid)\b[^,.;]*/gi,'')
   if(c.stable&&/拉远|推近|下移|上移|摇移|环绕|变焦|\b(?:zoom|dolly|panning|orbit|tracking)\b/i.test(positive))issue('camera_stability_mismatch',s.id,'A stable reading window cannot contain described camera movement. Rewrite the camera description or mark it moving and relocate the overlay.')
  }
  for(const o of s.overlays){
   if(!interval(o,s.start,s.end)||!str(o.text,300)||!o.text.trim())throw fail('video_overlay_invalid')
   if(o.end-o.start<Math.max(1.5,Array.from(o.text).length/6))issue('overlay_reading_time',s.id,'Extend readable overlay duration or shorten text.')
   if(s.camera.some((c:any)=>!c.stable&&c.start<o.end&&c.end>o.start))issue('overlay_camera_conflict',s.id,'Provide a stable reading window for the overlay.')
  }
 }
 if(Math.abs(end-a.durationSec)>0.01)issue('duration_mismatch','timeline','Final timestamp must match the requested duration.')
 if(intent.singleSegment&&a.segments.length!==1)issue('continuous_material_split','segments','Keep the continuous subject in one material segment.')
 const artifact=a as VideoArtifact
 if(serializeVideo(artifact).length>12000)issue('script_too_long','script','Reduce editable script to 12000 characters.')
 return {artifact,issues}
}
export function serializeVideo(a:VideoArtifact){
 if(a.literalEdit&&typeof a.script==='string')return a.script
 const line=(s:string)=>s.replace(/\s*\n+\s*/g,' ')
 const labels={zh:['镜头','画面','动作','口播','字幕','声音','运镜','备注'],en:['Scene','Visual','Action','Speech','Overlay','Sound','Camera','Needed'],id:['Adegan','Visual','Aksi','Ucapan','Teks','Bunyi','Kamera','Kebutuhan'],ms:['Babak','Visual','Aksi','Pertuturan','Teks','Bunyi','Kamera','Keperluan']}[a.language]
 return a.segments.map((s,i)=>[`${labels[0]} ${i+1} · ${s.start}–${s.end}s`,`${labels[1]}：${s.visual}`,`${labels[2]}：${s.action}`,`${labels[3]}：${s.spokenText||(a.language==='zh'?'无':'none')}`,`${labels[4]}：${s.overlays.map(o=>`${o.start}–${o.end}s ${o.text}`).join('；')||(a.language==='zh'?'无':'none')}`,`${labels[5]}：${s.audio}`,`${labels[6]}：${s.camera.map(c=>`${c.start}–${c.end}s ${c.description}`).join('；')}`,...(s.plannedNeeds.length?[`${labels[7]}：${s.plannedNeeds.join('；')}`]:[])].map(line).join('\n')).join('\n\n')
}
export function requireVideoSkill(calls:any[],goal=''){
 const main=calls.findIndex(c=>c.capability==='assistant.skills.read'&&c.status==='succeeded'&&c.input?.id===VIDEO_SKILL&&!c.input?.resource)
 const workflow=calls.findIndex(c=>c.capability==='assistant.skills.read'&&c.status==='succeeded'&&c.input?.id===VIDEO_SKILL&&c.input?.resource===VIDEO_RESOURCE)
 if(main<0||workflow<=main)throw fail('read_video_skill_then_workflow_first')
 for(const resource of requestedVideoCraft(goal))if(!calls.some((c,i)=>i>workflow&&c.capability==='assistant.skills.read'&&c.status==='succeeded'&&c.input?.id===VIDEO_SKILL&&c.input?.resource===resource))throw fail('read_requested_video_resource:'+resource)
 const traces=calls.filter(c=>c.capability==='assistant.skills.read'&&c.status==='succeeded').map(c=>({id:c.input.id,resource:c.input.resource??null,version:c.result?.version,skillVersion:c.result?.skillVersion}))
 return [...new Map(traces.map(trace=>[JSON.stringify(trace),trace])).values()]
}

export function videoProgress(status:string,calls:any[]){
 if(status==='succeeded')return 'complete'
 if(['waiting','paused','failed','cancelled'].includes(status))return 'paused'
 if(status==='queued')return 'queued'
 if(calls.some(c=>c.capability==='amc.video_review'&&c.status==='succeeded'&&c.result?.status==='repair_required'))return 'repairing'
 if(calls.some(c=>c.capability==='my_write_workspace'&&c.status==='succeeded'))return 'reviewing'
 if(calls.some(c=>c.capability==='amc.video_facts'&&c.status==='succeeded'))return 'writing'
 return 'loading'
}
