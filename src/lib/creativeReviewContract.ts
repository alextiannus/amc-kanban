// Browser-only projection of the MM review contract; parity is checked in UI tests.
export const revisionReasons = [
 ['sku_mismatch','商品不匹配','SKU mismatch'],['selling_point','卖点','Selling point'],['transitions','镜头衔接','Shot transitions'],['visual_description','画面描述','Visual description'],['voiceover','旁白','Voiceover'],['subtitle','字幕','Subtitles'],['platform_style','平台风格','Platform style'],['material_feasibility','素材可行性','Material feasibility'],['brand_facts','品牌事实','Brand facts'],['other','其他','Other'],
] as const
// Match only the authoritative shot labels retained in the saved adaptation.
// A free-form edit without those labels must never be presented as a matched shot.
export function scriptForSourceShot(script:string,shotId:string,shotIds:string[]){
 const lines=script.split('\n'),heading=(line:string,id:string)=>new RegExp(`^\\s*\\d+\\.\\s+${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:\\s|$)`).test(line)
 const start=lines.findIndex(line=>heading(line,shotId));if(start<0)return null
 const next=lines.findIndex((line,i)=>i>start&&shotIds.some(id=>heading(line,id)))
 return lines.slice(start,next<0?undefined:next).join('\n')
}
