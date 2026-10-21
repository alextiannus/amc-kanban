// Keep this wire contract and compiler identical in MM and Content.
export const MAX_VIDEO_SCRIPT_CHARS = 12000
export const VIDEO_NEGATIVE_PROMPT = 'distorted text, inaccurate logo, fake price, fake address, fake review, fake award, extra fingers, uncanny faces, low quality, watermark'
export type VideoMaterialBindings = {version:1; allowAi:boolean; passages:Array<{id:string; assetIds:string[]; manual:boolean}>}
export type PromptValidation = {valid:boolean; length:number; maxLength:number; source:'system'|'channel'; error?:string}
const shotStart=/^\s*(?:【?\s*(?:分镜|镜头|scene|shot|adegan|babak|syot)\s*\d|\d+[.、]\s*(?:镜头|分镜|scene|shot|adegan|babak|syot)\s*\d)/i
export function materialPassages(value:string,groupTimed=true){
 const script=value.split(/\n\s*(?:#{1,6}\s*)?(?:素材要求|素材需求|required assets|material requirements)\s*[:：]?/i)[0]
 const blocks=script.split(/\n\s*\n|\n(?=\s*(?:【?\s*(?:分镜|镜头|scene|shot|adegan|babak|syot)\s*\d|(?:画面|镜头|visual|shot|visualisasi|gambar)\s*[:：]|\d+[.、]))/i).map(x=>x.trim()).filter(Boolean)
 const hasShots=blocks.some(x=>shotStart.test(x))
 const filtered=blocks.filter(text=>{
  const normalized=text.replace(/^[#*\s]+|[*\s]+$/g,'').replace(/^\d+[.、]\s*/,'').replace(/[【】]/g,'').replace(/[：:。\s]+$/g,'').replace(/\s*[（(][^）)]*[）)]\s*$/,'')
  if(/^(?:正文\s*[/／、与]?\s*分镜|正文|分镜|完整脚本|脚本|视频脚本|body\s*[/&]?\s*storyboard|storyboard|script)$/i.test(normalized))return false
  // A timed shot list defines the visuals. Introductory style/copy notes are not another shot.
  if(hasShots&&!shotStart.test(text)&&!/(?:^|\n)\s*(?:画面|visual|visualisasi|gambar)\s*[:：]/i.test(text)&&/^(?:标题|开场钩子|视频风格|视频结构|title|style)\s*[:：（(]/i.test(text))return false
  return true
 })
 for(let i=filtered.length-2;i>=0;i--)if(shotStart.test(filtered[i])&&/^(?:画面|visual|visualisasi|gambar)\s*[:：]/i.test(filtered[i+1]))filtered.splice(i,2,filtered[i]+'\n'+filtered[i+1])
 if(filtered.length>1&&!/[\n:：]/.test(filtered[0])&&/^(?:画面|镜头|visual|shot|visualisasi|gambar)\s*[:：]/i.test(filtered[1]))filtered.splice(0,2,filtered[0]+'\n'+filtered[1])
 if(!groupTimed)return filtered
 // A timestamp is a shot header, not a separate shot requiring its own material.
 const timed=/^\s*(?:#{1,6}\s*)?(?:【|\[)?\d+(?:\.\d+)?\s*[-–—~～至]\s*\d+(?:\.\d+)?\s*(?:秒|seconds?\b|secs?\b|s\b)(?:】|\])?(?:\s|$)/i
 const grouped:string[]=[]
 for(const block of filtered){
  const previous=grouped.at(-1)
  if(previous&&timed.test(previous)&&!timed.test(block)&&!shotStart.test(block))grouped[grouped.length-1]=previous+'\n'+block
  else grouped.push(block)
 }
 return grouped
}

const invalid = () => Object.assign(new Error('INVALID_MATERIAL_BINDINGS'), {status:400, code:'INVALID_MATERIAL_BINDINGS'})
export function validateVideoMaterialBindings(script:string, raw:unknown, references:Array<{id:string;mimeType?:string;sourceAssetId?:string}>):VideoMaterialBindings|undefined {
 if(raw===undefined||raw===null)return undefined
 const value=raw as VideoMaterialBindings, blocks=materialPassages(script)
 if(value.version!==1||typeof value.allowAi!=='boolean'||!Array.isArray(value.passages)||value.passages.length!==blocks.length)throw invalid()
 const ids=new Set(references.map(a=>a.id))
 if(ids.size!==references.length)throw invalid()
 return {version:1,allowAi:value.allowAi,passages:value.passages.map((p,i)=>{
  if(!p||p.id!=='passage-'+(i+1)||typeof p.manual!=='boolean'||!Array.isArray(p.assetIds)||p.assetIds.length>2||new Set(p.assetIds).size!==p.assetIds.length||p.assetIds.some(id=>typeof id!=='string'||!ids.has(id)))throw invalid()
  return {id:p.id,assetIds:[...p.assetIds],manual:p.manual}
 })}
}
export function materialBindingsText(bindings:VideoMaterialBindings|undefined,references:Array<{id:string;mimeType?:string;sourceAssetId?:string}>):string {
 if(!bindings)return ''
 let images=0,videos=0
 const labels=new Map<string,string>()
 for(const a of references){const label=a.mimeType?.startsWith('video/')?'Video '+(++videos):'Image '+(++images);labels.set(a.id,label);if(a.sourceAssetId)labels.set(a.sourceAssetId,[labels.get(a.sourceAssetId),label].filter(Boolean).join(', '))}
 return '\n\n制作绑定（保留脚本全部内容及顺序，不新增口播或卖点；参考仅用于对应主体）：\n'+
 (bindings.allowAi?'用户允许对此未确认或动作缺口生成 AI 画面，保持参考主体，不冒充实拍，不挪用其他菜品或品牌。\n':'')+
 bindings.passages.map((p,i)=>'段落 '+(i+1)+': '+(p.assetIds.length?p.assetIds.map(id=>{const label=labels.get(id);if(!label)throw invalid();return label}).join(', '):'未确认')+(p.manual?'（用户指定）':'')).join('\n')
}
export function videoPromptLimits(config?:{maxPromptChars?:number}) {
 const channel=config?.maxPromptChars
 if(channel!==undefined&&(!Number.isInteger(channel)||channel<1))throw Object.assign(new Error('Invalid channel prompt limit'),{status:503})
 return {maxScriptChars:MAX_VIDEO_SCRIPT_CHARS,maxCompiledPromptChars:Math.min(MAX_VIDEO_SCRIPT_CHARS,channel??MAX_VIDEO_SCRIPT_CHARS),promptLimitSource:channel!==undefined&&channel<MAX_VIDEO_SCRIPT_CHARS?'channel' as const:'system' as const}
}
export function videoPromptValidation(prompt:string,config?:{maxPromptChars?:number}):PromptValidation {
 const {maxCompiledPromptChars:maxLength,promptLimitSource:source}=videoPromptLimits(config)
 const length=prompt.length
 return {valid:length<=maxLength,length,maxLength,source,...(length>maxLength?{error:'生成指令共 '+length+' 字符，超过'+(source==='channel'?'渠道配置':'系统')+'上限 '+maxLength+' 字符；完整脚本及绑定已保留，请调整后生成。'}:{})}
}
export function assertVideoPrompt(prompt:string,config?:{maxPromptChars?:number}) {
 const result=videoPromptValidation(prompt,config)
 if(!result.valid)throw Object.assign(new Error(result.error),{status:400,code:'VIDEO_PROMPT_TOO_LONG',promptValidation:result})
}
