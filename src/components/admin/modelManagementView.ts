export const modelCapabilityLabels:Record<string,string>={text:'全局文本',image_understanding:'图片理解',video_understanding:'视频理解',image_generation:'图片生成',video_generation:'视频生成',speech_recognition:'语音识别',speech_synthesis:'语音合成',music:'音乐'}
const names:Record<string,string>={kanban:'Kanban',content:'Content',mm:'MM',instagram:'Instagram',facebook:'Facebook',google_business:'Google 商家',xiaohongshu:'小红书',tiktok:'TikTok',reference_audio_transcription:'参考音频转写',reference_subtitle_ocr:'参考字幕识别',reference_video_analysis:'参考视频分析',asset_image_analysis:'素材图片分析',basic_video_generation:'基础视频生成',video_generation:'视频生成',tts_generation:'语音合成',music_generation:'音乐生成'}
export const taskLabel=(key:string)=>key.split(':').map(k=>names[k]||modelCapabilityLabels[k]||k).join(' / ')
export const selectionIds=(selection:any)=>new Set<string>([...Object.values(selection?.defaults||{}),...Object.values(selection?.exceptions||{})] as string[])
export function modelUses(selection:any,id:string){return [...Object.entries(selection?.defaults||{}).filter(([,v])=>v===id).map(([key])=>modelCapabilityLabels[key]||key),...Object.entries(selection?.exceptions||{}).filter(([,v])=>v===id).map(([key])=>taskLabel(key))]}
export function filterModels(models:any[],connections:any[],current:any,draft:any,filters:{search:string;provider:string;capability:string;status:string}){
 const live=selectionIds(current),pending=selectionIds(draft),superseded=new Set(models.map(m=>m.definition.previousModelId).filter(Boolean))
 const result=models.filter(m=>{
  const d=m.definition,c=connections.find(c=>c.id===m.connectionId),historical=superseded.has(m.id)
  if(filters.status==='history'?!historical:historical&&!live.has(m.id)&&!pending.has(m.id))return false
  if(filters.status==='current'&&!live.has(m.id)||filters.status==='draft'&&!pending.has(m.id)||filters.status==='unused'&&(live.has(m.id)||pending.has(m.id))||filters.status==='disabled'&&d.isEnabled!==false)return false
  return (!filters.provider||c?.name===filters.provider)&&(!filters.capability||d.capabilities.includes(filters.capability))&&`${d.name} ${d.modelName} ${c?.name||''} ${m.connectionId}`.toLowerCase().includes(filters.search.trim().toLowerCase())
 })
 const rank=(m:any)=>m.definition.isEnabled===false?3:live.has(m.id)?0:pending.has(m.id)?1:2
 return result.sort((a,b)=>rank(a)-rank(b)||a.definition.name.localeCompare(b.definition.name)||a.id.localeCompare(b.id))
}
export function groupIssues(issues:string[]){
 const groups=new Map<string,{category:string;label:string;items:string[]}>()
 for(const original of issues){
  const category=/HTTP|export unavailable|service|protocol mismatch/i.test(original)?'服务连接':/credential|endpoint|HTTPS|provider URL/i.test(original)?'密钥或地址':/Unresolved|route|mapping/i.test(original)?'任务路由':/capabilit|protocol|adapter/i.test(original)?'协议与能力':'其他'
  const key=original.replace(/\b(instagram|facebook|google_business|xiaohongshu|tiktok)\b/g,'各平台')
  const group=groups.get(key)||{category,label:key,items:[]};group.items.push(original);groups.set(key,group)
 }
 return [...groups.values()].sort((a,b)=>a.category.localeCompare(b.category))
}
