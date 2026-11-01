import {createHash} from 'node:crypto'
import {materialPassages} from './shooting-passages'
export const shotHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,40)
export function monthAt(now:Date,timezone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit'}).formatToParts(now);return p.find(x=>x.type==='year')!.value+'-'+p.find(x=>x.type==='month')!.value}
export function nextMonth(month:string){const [y,m]=month.split('-').map(Number);return `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`}
export function nextShootingMonth(rows:any[],current:string){const open=rows.filter(r=>r.status!=='COMPLETED').sort((a,b)=>a.period.localeCompare(b.period))[0];if(open)return open.period;const closed=new Set(rows.filter(r=>r.status==='COMPLETED').map(r=>r.period));let m=current;while(closed.has(m))m=nextMonth(m);return m}
export type ShotNeed={id:string;mediaType:'image'|'video';sku:string;skuId:string;scene:string;scriptTitle:string;shot:number;requirement:string;done:boolean}
export function shootingNeeds(draft:any,catalog:any[]):ShotNeed[]{
 const script=draft.versions?.[draft.language]?.script||'',assets=new Set((draft.assets||[]).map((a:any)=>a.id))
 return materialPassages(script).flatMap((block:string,index:number)=>{
  const binding=draft.bindings?.['passage-'+(index+1)]
  if(Array.isArray(binding)&&binding.some((id:string)=>assets.has(id)))return []
  const matched=catalog.filter(s=>typeof s.name==='string'&&s.name&&block.includes(s.name)).sort((a,b)=>b.name.length-a.name.length),sku=matched[0]
  const scene=block.match(/(?:^|\n)\s*(?:场景|地点|location|setting)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim()||'未指定场景'
  const mediaType=/^(?:.*\n)?\s*(?:素材类型|素材|media type|asset type)\s*[:：]\s*(?:图片|照片|image|photo)/im.test(block)?'image':'video'
  // Keep action, framing, continuity and duration verbatim; speech/captions are not camera requirements.
  const requirement=block.split('\n').filter(line=>!/^\s*(?:旁白|口播|对白|字幕|voiceover|dialogue|caption|subtitle|narration)\s*[:：]/i.test(line)).join('\n').trim()||block
  return [{id:shotHash([index,block]),mediaType,sku:sku?.name||'未指定SKU',skuId:sku?.id||'',scene,scriptTitle:draft.title||'视频脚本',shot:index+1,requirement,done:false}]
 })
}
export function sortShootingNeeds(items:any[]){return [...items].sort((a,b)=>a.mediaType.localeCompare(b.mediaType)||a.sku.localeCompare(b.sku,'zh-CN')||a.scene.localeCompare(b.scene,'zh-CN')||a.scriptTitle.localeCompare(b.scriptTitle,'zh-CN')||a.shot-b.shot)}
export function shootingCsv(month:string,items:any[]){const cell=(v:unknown)=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';return '\ufeff'+[['月份','类型','SKU','场景','脚本','镜头','拍摄要求','状态'],...sortShootingNeeds(items).map(x=>[month,x.mediaType==='image'?'图片':'视频',x.sku,x.scene,x.scriptTitle,x.shot,x.requirement,x.done?'已完成':'待拍摄'])].map(r=>r.map(cell).join(',')).join('\r\n')}
export function shootingHtml(brand:string,month:string,items:any[]){const e=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));let group='';return '<!doctype html><html lang="zh"><meta charset="utf-8"><title>'+e(brand)+' '+e(month)+' 拍摄清单</title><style>body{font:15px/1.6 system-ui;margin:32px;color:#172b28}h1{font-size:24px}h2{font-size:18px;margin-top:28px}article{break-inside:avoid;border-bottom:1px solid #ddd;padding:12px 0}p{white-space:pre-wrap;margin:6px 0}small{color:#566} @media print{body{margin:0}button{display:none}}</style><h1>'+e(brand)+' · '+e(month)+' 拍摄清单</h1>'+sortShootingNeeds(items).map(x=>{const key=[x.mediaType,x.sku,x.scene].join(' / '),title=key!==group?'<h2>'+e((x.mediaType==='image'?'图片':'视频')+' · '+x.sku+' · '+x.scene)+'</h2>':'';group=key;return title+'<article><strong>'+(x.done?'☑ ':'☐ ')+e(x.scriptTitle)+' · 镜头'+x.shot+'</strong><p>'+e(x.requirement)+'</p></article>'}).join('')+'</html>'}
