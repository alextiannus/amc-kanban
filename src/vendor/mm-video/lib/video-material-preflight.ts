import {materialPassages, type VideoMaterialBindings} from '@/vendor/mm-video/lib/video-material-bindings'
export {materialPassages} from '@/vendor/mm-video/lib/video-material-bindings'
import {createHash} from 'node:crypto'
export type MaterialAsset={id:string;mimeType?:string|null;aiCaption?:string|null;aiTags?:string[]|null;filename?:string|null;sourceType?:string|null}
export type MaterialBindings=Record<string,string[]>
export type MaterialDecision={digest:string;allowAi:boolean;bindings?:MaterialBindings}
export type MaterialPlan={digest:string;passages:Array<{id:string;text:string;assetIds:string[];referenceNumbers:number[];referenceLabels:string[];gap:string|null;matchBasis?:'manual'|'description'|'unconfirmed'}>}
const subjectPatterns=[/面条|大面|noodles?/i,/锅包肉|sweet.and.sour.{0,30}pork|guo.?bao.?rou/i,/铁锅炖|火锅|hot.pot|stew/i,/大鹅|goose/i,/鸡爪|chicken.feet/i,/排骨|pork.ribs?/i,/豆腐|tofu/i,/水饺|dumplings?/i,/鱼(?!香)|fish/i,/虾|shrimp|prawns?/i,/地三鲜|土豆|茄子|di.?san.?xian|potato|eggplant/i,/门头|店招|店外|门口|玻璃店门|store.?front|entrance|exterior|signage/i,/店内|室内|装修|花布|interior|decor/i,/聚餐|客流|顾客|食客|多人围坐|diners|customers|crowd|dining.room/i]
const ignored=new Set(['东北','餐厅','画面','镜头','特写','近景','素材','视频','展示','口播','这个','还有','scene','video','image','shot','close','view','restaurant'])
const words=(value:string)=>new Set((value.toLowerCase().match(/[a-z]{3,}|[\u3400-\u9fff]{2,}/g)||[]).flatMap(w=>/^[a-z]/.test(w)?[w]:Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2))).filter(w=>!ignored.has(w)))
export function materialPreflight(input:{brandId:string;script:string;templateId?:string;duration:number;assets:MaterialAsset[];bindings?:MaterialBindings}):MaterialPlan{
 const blocks=materialPassages(input.script),bindings=input.bindings||{}
 if(typeof bindings!=='object'||Array.isArray(bindings)||Object.entries(bindings).some(([id,ids])=>!/^passage-[1-9]\d*$/.test(id)||Number(id.slice(8))>blocks.length||!Array.isArray(ids)||ids.length>2||new Set(ids).size!==ids.length||ids.some(a=>typeof a!=='string'||!input.assets.some(asset=>asset.id===a))))throw new Error('INVALID_MATERIAL_BINDINGS')
 const usage=new Map<string,number>()
 let previous=new Set<string>()
 const passages=blocks.map((text,index)=>{
  const id=`passage-${index+1}`,visualLines=text.split('\n').filter(line=>/^\s*(?:画面|visual)\s*[:：]/i.test(line))
  const visual=visualLines.length?visualLines.join(' '):text.split('\n').filter(line=>!/^\s*(?:口播|旁白|字幕|voiceover|narration)\s*[:：]/i.test(line)).join(' ')
  const keys=words(visual),requiredSubjects=subjectPatterns.filter(pattern=>pattern.test(visual))
  const ranked=input.assets.map((asset,position)=>{
    const description=[asset.aiCaption,...(asset.aiTags||[])].filter(Boolean).join(' ')
    const subjectMatches=requiredSubjects.filter(pattern=>pattern.test(description)).length
    const eligible=!requiredSubjects.length||subjectMatches===requiredSubjects.length
    return {asset,position,score:eligible?[...words(description)].filter(w=>keys.has(w)).length+subjectMatches*5:0}
  }).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score||a.position-b.position)
  const manual=Object.hasOwn(bindings,id)
  // Keep relevance as a floor; only distribute references among similarly good matches.
  const alternatives=ranked.filter(candidate=>candidate.score>=ranked[0].score-2).sort((a,b)=>
   Number(previous.has(a.asset.id))-Number(previous.has(b.asset.id))||
   (usage.get(a.asset.id)||0)-(usage.get(b.asset.id)||0)||b.score-a.score||a.position-b.position)
  const chosen=manual?bindings[id].map(assetId=>({asset:input.assets.find(a=>a.id===assetId)!,position:input.assets.findIndex(a=>a.id===assetId)})):alternatives.slice(0,1)
  previous=new Set(chosen.map(candidate=>candidate.asset.id))
  for(const {asset} of chosen)usage.set(asset.id,(usage.get(asset.id)||0)+1)
  const action=/出锅|拉面|拌面|夹起|夹着|上桌|热气|拉远|进食|咀嚼|吃东西|吃面|吃肉|客流|翻炒|倒入|推开|跟随|横移|lifting|eating|cooking|crowd/i.test(visual)
  const hasVideo=chosen.some(x=>x.asset.mimeType?.startsWith('video/')&&!['ai_video','generated_video','basic_video_reference'].includes(x.asset.sourceType||''))
  // A missing metadata match is uncertainty, not proof that a selected asset is absent.
  const gap=!chosen.length?(input.assets.length?'已选素材的对应关系待确认，可直接指定已有素材 / Selected references need matching; assign an existing asset':'尚未选择参考素材 / No references selected'):action&&!hasVideo?'已匹配图片参考，动作需 AI 补充或提供实拍视频 / Image reference matched; animate with AI or add live-action footage':action?'已匹配视频参考，动作覆盖尚未逐帧确认 / Video reference matched; action coverage is unverified':chosen.some(x=>['ai_video','generated_video'].includes(x.asset.sourceType||''))?'已匹配生成内容参考 / Generated reference matched':null
  return {id,text,assetIds:chosen.map(x=>x.asset.id),referenceNumbers:chosen.map(x=>x.position+1),referenceLabels:chosen.map(x=>{const video=x.asset.mimeType?.startsWith('video/');return `${video?'Video':'Image'} ${input.assets.slice(0,x.position+1).filter(a=>Boolean(a.mimeType?.startsWith('video/'))===Boolean(video)).length}`}),gap,matchBasis:manual?'manual' as const:chosen.length?'description' as const:'unconfirmed' as const}
 })
 const digest=createHash('sha256').update(JSON.stringify({version:4,...input,passages})).digest('hex')
 return {digest,passages}
}
export function materialDecisionValid(plan:MaterialPlan,decision?:MaterialDecision){return decision?.digest===plan.digest&&(!plan.passages.some(p=>p.gap)||decision.allowAi===true)}
export function structuredMaterialBindings(plan:MaterialPlan,allowAi:boolean):VideoMaterialBindings{return {version:1,allowAi,passages:plan.passages.map(p=>({id:p.id,assetIds:p.assetIds,manual:p.matchBasis==='manual'}))}}
