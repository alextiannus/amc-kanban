import type { Application } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import { digest, nativeError, type NativeActor } from './contract'

const key='brand-working-preference'
type Preference={key:string;revision:number;status:string;content:string|null}
export async function readPreference(app:Application,actor:NativeActor):Promise<Preference>{
  try{return await app.dispatcher.invoke('my_read_assistant_memory',{key},{actor}) as Preference}
  catch(e){if((e as {statusCode?:number}).statusCode!==404)throw e;return {key,revision:0,status:'absent',content:null}}
}
// Human-only entry: the model's allowed tools contain read/list, never these writes.
export async function changePreference(app:Application,actor:NativeActor,body:any){
  if(!['remember','forget'].includes(body?.action)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw nativeError('invalid_preference')
  const context={actor,callId:`preference-${digest([actor,body])}`}
  const current=await readPreference(app,actor)
  if(body.action==='forget'){
    if(current.status==='forgotten'&&current.revision===body.expectedRevision+1)return current
    await app.dispatcher.invoke('my_forget_assistant_memory',{key,expectedRevision:body.expectedRevision},context)
  }else{
    if(typeof body.content!=='string'||!body.content.trim()||body.content.length>4000)throw nativeError('invalid_preference')
    const content=body.content.trim()
    if(current.status==='active'&&current.content===content&&current.revision===body.expectedRevision+1)return current
    // Relearning requires a freshly read tombstone revision and newly supplied content.
    const capability=current.status==='forgotten'?'my_relearn_assistant_memory':'my_remember_assistant_memory'
    await app.dispatcher.invoke(capability,{key,kind:'preference',content,expectedRevision:body.expectedRevision},context)
  }
  return readPreference(app,actor)
}

// A current brand projection, never a newly inferred fact or an implicit memory write.
export function brandWorkingDefaults(facts:any){
  const knowledge=facts?.knowledge||{}
  const text=(value:unknown):string=>typeof value==='string'?value.trim():Array.isArray(value)?value.filter(v=>typeof v==='string').join('；'):''
  const fields:[string,unknown][]=[['品牌 / Brand',facts?.name],['行业 / Industry',facts?.industry],['品牌语气 / Tone',knowledge.brandTone],['目标受众 / Audience',knowledge.audienceAssumptions],['产品 / Products',knowledge.productAssumptions],['市场 / Market',knowledge.market||facts?.location],['内容限制 / Content restrictions',knowledge.negPrompts]]
  const content=fields.map(([label,value])=>{const v=text(value);return v?`${label}：${v.slice(0,450)}`:''}).filter(Boolean).join('\n')
  return {brandId:facts?.id,brandName:text(facts?.name),content}
}
export function preferenceSettings(preference:Preference,facts:unknown){
  const defaults=brandWorkingDefaults(facts)
  const personal=preference.status==='active'&&!!preference.content
  return {...preference,defaults,effectiveContent:personal?preference.content:defaults.content,source:personal?'personal':'brand'}
}
