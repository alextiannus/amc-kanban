// Kept aligned with MM materialPassages for passage-N binding identities.
const shotStart=/^\s*(?:【?\s*(?:分镜|镜头|scene|shot|adegan|babak|syot)\s*\d|\d+[.、]\s*(?:镜头|分镜|scene|shot|adegan|babak|syot)\s*\d)/i
export function materialPassages(value:string,groupTimed=true){
 const script=value.split(/\n\s*(?:#{1,6}\s*)?(?:素材要求|素材需求|required assets|material requirements)\s*[:：]?/i)[0]
 const blocks=script.split(/\n\s*\n|\n(?=\s*\d+(?::\d{1,2})?(?:\.\d+)?\s*[-–—~～至]\s*\d+(?::\d{1,2})?(?:\.\d+)?\s*(?:秒|s\b|seconds?\b))|\n(?=\s*(?:【?\s*(?:分镜|镜头|scene|shot|adegan|babak|syot)\s*\d|(?:画面|镜头|visual|shot|visualisasi|gambar)\s*[:：]|\d+[.、]))/i).map(x=>x.trim()).filter(Boolean)
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
 const timed=/^\s*(?:#{1,6}\s*)?(?:【|\[)?\d+(?::\d{1,2})?(?:\.\d+)?\s*[-–—~～至]\s*\d+(?::\d{1,2})?(?:\.\d+)?\s*(?:秒|seconds?\b|secs?\b|s\b)(?:】|\])?(?:\s|$)/i
 const grouped:string[]=[]
 for(const block of filtered){
  const previous=grouped.at(-1)
  if(previous&&timed.test(previous)&&!timed.test(block)&&!shotStart.test(block))grouped[grouped.length-1]=previous+'\n'+block
  else grouped.push(block)
 }
 return grouped
}
