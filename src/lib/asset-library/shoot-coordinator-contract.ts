export type SourceShot={id:string;requestId:string;requestVersion:number;mediaType:string;sku:string;skuId?:string;scene:string;requirement:string}
type Cut={n:number;use:string}
type Group={mode:'single'|'reuse'|'sequence';instruction:string;cuts:Cut[]}
const bounded=(s:unknown,max:number):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=max
function constraints(s:SourceShot){
 const explicit=s.requirement.split(/\r?\n/).map(l=>l.trim().normalize('NFKC').toLowerCase()).filter(l=>/^(?:景别|运镜|机位|道具|人物|光线|灯光|连续性|连贯性|声音|shot scale|camera movement|lighting|continuity|sound)\s*:/.test(l)).sort()
 return JSON.stringify([s.mediaType,s.skuId||s.sku,s.scene,explicit])
}
export function validateCoverage(value:any,shots:SourceShot[]){
 if(!Array.isArray(value?.groups)||!value.groups.length||value.groups.length>shots.length)throw Error('invalid_groups')
 const seen=new Set<number>()
 const groups=value.groups.map((g:Group)=>{
  if(!g||!['single','reuse','sequence'].includes(g.mode)||!bounded(g.instruction,640)||!Array.isArray(g.cuts)||!g.cuts.length||(g.mode==='single')!==(g.cuts.length===1))throw Error('invalid_group')
  const cuts=g.cuts.map(c=>{
   if(!c||!Number.isSafeInteger(c.n)||!shots[c.n]||seen.has(c.n)||!bounded(c.use,240))throw Error('invalid_cut')
   seen.add(c.n)
   const shot=shots[c.n]
   return {requestId:shot.requestId,id:shot.id,version:shot.requestVersion,use:c.use.trim()}
  })
  const first=shots[g.cuts[0].n]
  if(g.cuts.some(c=>constraints(shots[c.n])!==constraints(first))||g.mode==='sequence'&&first.mediaType!=='video')throw Error('incompatible_capture')
  return {mode:g.mode,instruction:g.instruction.trim(),cuts}
 })
 if(seen.size!==shots.length)throw Error('incomplete_coverage')
 return groups
}
