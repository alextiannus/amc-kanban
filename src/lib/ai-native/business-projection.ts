/** Only the model-facing copy is bounded. Source records are never changed. */
export const BUSINESS_RESULT_MAX_BYTES=64000
const bytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value)||'null')
const priority=(key:string)=>/^(ok|id|status|state|total|hasMore|nextCursor|researchRequest|researchReport|marketingSolution)$/.test(key)||/Id$/.test(key)
function compact(value:any,textLimit:number,arrayLimit:number,depth:number,key=''):any{
 if(typeof value==='string'){
  // Never manufacture a shortened resource ID or cursor.
  if(/(^id$|Id$|Cursor$|^status$|^state$)/.test(key))return value
  return value.length>textLimit?value.slice(0,textLimit)+' [excerpt]':value
 }
 if(!value||typeof value!=='object')return value
 if(Array.isArray(value))return depth<=0?{contentOmitted:true,originalCount:value.length}:value.slice(0,arrayLimit).map(v=>compact(v,textLimit,arrayLimit,depth-1))
 const entries=Object.entries(value).sort(([a],[b])=>Number(priority(b))-Number(priority(a)))
 if(depth<=0)return {...Object.fromEntries(entries.filter(([k,v])=>priority(k)&&(v===null||typeof v!=='object')).slice(0,12)),contentOmitted:true}
 return Object.fromEntries(entries.slice(0,40).map(([k,v])=>[k,compact(v,textLimit,arrayLimit,depth-1,k)]))
}
export function projectBusinessResult(tool:string,result:any){
 if(bytes(result)<=BUSINESS_RESULT_MAX_BYTES)return result
 const notice='Partial model-facing result: long text, nested details and list items may be omitted. IDs and status values are retained. Do not treat omitted data as absent or the excerpt as a complete report. Use smaller list pages or an individual resource read where available.'
 for(const [textLimit,arrayLimit,depth] of [[1600,10,7],[700,5,6],[200,2,4],[80,1,2]]){
  const content=(Array.isArray(result.content)?result.content:[]).slice(0,10).map((block:any)=>{
   if(block.type!=='text')return {type:'text',text:JSON.stringify({partial:true,instructions:notice})}
   let data:any;try{data=JSON.parse(block.text)}catch{return {type:'text',text:block.text.slice(0,textLimit)+'\n[Partial result: read a smaller resource.]'}}
   if(tool==='get_brand_marketing_plan'&&data?.marketingSolution&&JSON.stringify(data.brandPlan)===JSON.stringify(data.marketingSolution)){const {brandPlan,...unique}=data;data=unique}
   const projected=compact(data,textLimit,arrayLimit,depth)
   return {type:'text',text:JSON.stringify(projected&&typeof projected==='object'&&!Array.isArray(projected)?{...projected,partial:true,projectionInstructions:notice}:{data:projected,partial:true,projectionInstructions:notice})}
  })
  const candidate={...(result.isError?{isError:true}:{}),content}
  if(bytes(candidate)<=BUSINESS_RESULT_MAX_BYTES)return candidate
 }
 return {...(result.isError?{isError:true}:{}),outcomeUnknown:true,content:[{type:'text',text:JSON.stringify({error:'business_result_too_large',partial:true,instructions:'The operation returned a result too large to display. This does not prove the operation failed. Read the original resource in smaller pages; do not repeat a write.'})}]}
}
