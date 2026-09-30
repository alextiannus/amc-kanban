// Shared AMC diversity policy v1. Keep identical in Content and Kanban.
import {createHash} from 'node:crypto'
export const DIRECTIONS=['process','product','tasting','education','comparison','customer_story','brand_story','occasion','store_visit','offer','humor','unclassified'] as const
export type Direction=typeof DIRECTIONS[number]
const patterns:Array<[Direction,RegExp]>=[
 ['comparison',/对比|测评|盲测|横评|before.?after|compar(?:e|ison)|versus|\bvs\b/i],
 ['customer_story',/顾客|客户故事|用户反馈|评价|证言|testimonial|customer|review/i],
 ['education',/教程|科普|知识|技巧|误区|揭秘|教学|how.to|tutorial|tips|myth|explain|faq/i],
 ['brand_story',/品牌故事|主理人|创始人|团队|员工|创业|匠人|founder|brand.story|team|staff/i],
 ['occasion',/节日|节庆|庆祝|纪念|场景|约会|聚会|家庭|festival|holiday|occasion|celebrat|date.night|family/i],
 ['store_visit',/探店|门店导览|路线|环境|空间|店面|store.tour|location|ambien|interior|visit/i],
 ['offer',/优惠|促销|折扣|活动规则|限时|套餐|promotion|discount|offer|bundle/i],
 ['humor',/搞笑|反转|段子|剧情|挑战|幽默|comedy|humor|skit|challenge|plot.twist/i],
 ['tasting',/试吃|品尝|口感|试喝|味觉|taste|tasting|reaction|first.bite/i],
 ['process',/制作|烹饪|烤制|工序|备料|烘焙|拉面|生产过程|asmr|cooking|preparation|making|baking|behind.the.scenes|sizzle/i],
 ['product',/产品特写|产品展示|开箱|细节|招牌展示|product|showcase|close.up|unbox|detail/i],
]
export function originalEvidence(source:any):string{
 const value=source?.nativeSourceSnapshot?.source||source
 const original=[value?.sourceVideo?.title,value?.sourcePost?.title,value?.sourcePost?.copySummary,value?.title,value?.bodyText,value?.creativeMechanism,JSON.stringify(value?.features||{})].filter(text=>text&&text!=='{}').join(' ')
 if(original.trim())return original.slice(0,9000)
 return [value?.sourceVideo?.title,value?.sourcePost?.title,value?.sourcePost?.copySummary,value?.title,value?.bodyText,value?.contentAngle,value?.creativeMechanism,...(value?.matchedTags||[]),JSON.stringify(value?.features||{}),value?.scriptContent?.opening,value?.scriptContent?.body].filter(Boolean).join(' ').slice(0,9000)
}
export function creativeDirection(source:any):Direction{
 const explicit=source?.creativeDirection||source?.nativeSourceSnapshot?.source?.creativeDirection
 if(DIRECTIONS.includes(explicit))return explicit
 const text=originalEvidence(source)
 return patterns.find(([,pattern])=>pattern.test(text))?.[0]||'unclassified'
}
export function normalizedCreative(source:any){return originalEvidence(source).normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+/g,'').replace(/[\p{P}\p{S}\s\d]+/gu,'').slice(0,6000)}
export function creativeFingerprint(source:any){return createHash('sha256').update(normalizedCreative(source)).digest('hex')}
function sourceUrl(source:any){source=source?.nativeSourceSnapshot?.source||source;try{const u=new URL(source.sourceVideo?.sourceUrl||source.sourcePost?.sourceUrl||source.sampleOriginalUrl||source.sourceUrl);u.hash='';for(const key of [...u.searchParams.keys()])if(/^(utm_|fbclid|igsh|ref)/i.test(key))u.searchParams.delete(key);return u.href.replace(/\/$/,'')}catch{return ''}}
export function duplicateCreative(a:any,b:any){
 const id=(s:any)=>s.inspirationCreativeId||s.nativeSourceSnapshot?.source?.inspirationCreativeId
 if(id(a)&&id(a)===id(b))return true
 const url=sourceUrl(a);if(url&&url===sourceUrl(b))return true
 const x=normalizedCreative(a),y=normalizedCreative(b)
 if(!x||!y)return false
 if(x===y)return true
 if(Math.min(x.length,y.length)<35)return false
 const grams=(s:string)=>new Set(Array.from({length:s.length-2},(_,i)=>s.slice(i,i+3)))
 const left=grams(x),right=grams(y);let overlap=0;for(const gram of left)if(right.has(gram))overlap++
 return 2*overlap/(left.size+right.size)>=0.82
}
export function diverseCreatives<T>(candidates:T[],existing:T[],limit:number,counts:Partial<Record<Direction,number>>={}){
 const used={...counts};for(const item of existing){const direction=creativeDirection(item);used[direction]=(used[direction]||0)+1}
 const result:T[]=[],remaining=[...candidates]
 while(result.length<limit&&remaining.length){
  remaining.sort((a,b)=>(used[creativeDirection(a)]||0)-(used[creativeDirection(b)]||0))
  const item=remaining.shift()!,direction=creativeDirection(item)
  if((used[direction]||0)>=2||[...existing,...result].some(other=>duplicateCreative(item,other)))continue
  result.push(item);used[direction]=(used[direction]||0)+1
 }
 return result
}
