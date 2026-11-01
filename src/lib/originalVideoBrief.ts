import {nativeError} from './ai-native/contract'
export function originalVideoRequest(body:any){
 if(!body||Object.keys(body).some(k=>!['action','tagIds','language','requestKey'].includes(k))||!/^[-\w]{12,90}$/.test(body.requestKey||'')||!['zh','en','id','ms'].includes(body.language)||!Array.isArray(body.tagIds)||body.tagIds.length>20||body.tagIds.some((id:any)=>typeof id!=='string'||!/^tag_[^\s]{1,155}$/.test(id)))throw nativeError('invalid_original_video_request',400)
 return {requestKey:body.requestKey,language:body.language,tagIds:[...new Set<string>(body.tagIds)].sort()}
}
export function originalVideoBrief(input:ReturnType<typeof originalVideoRequest>,tags:any[]){
 const selected=input.tagIds.map(id=>tags.find(t=>t.id===id))
 if(selected.some(t=>!t||typeof t.label!=='string'))throw nativeError('brand_keywords_changed',409)
 const directions=selected.map(t=>t.label.slice(0,80))
 return {creationDirections:directions,action:'rewrite',requestKey:'original-'+input.requestKey,editorRevision:input.requestKey,language:input.language,targetDurationSec:30,
 script:'原创视频创作简报（不是已有剧本或来源视频）：'+JSON.stringify({promotionDirections:directions.length?directions:['品牌推广'],durationSec:30}),
 instructions:'请为当前品牌原创一份30秒社交媒体短视频剧本。输入仅是创作简报，没有已有剧情需要保留，也没有来源视频。必须读取编剧、分镜、品牌表达技能，综合推广方向选择自然成立的叙事，不强制喜剧或反转。写清人物行动和动机、每镜动作起止、道具状态、镜头衔接、声音与字幕，完成独立审稿。推广标签仅是方向，不是品牌已提供产品、优惠或活动的证明；只使用可信品牌事实。不要伪造素材已存在。输出完整可编辑剧本，不生成视频。推广方向：'+JSON.stringify(directions.length?directions:['品牌推广'])}
}
