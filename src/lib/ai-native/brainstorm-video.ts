import {creativeSourceScript} from '../brand-plan/creativeSourceScript'
import {revisionSource} from '../brand-plan/creativeRevisionContract'
import {resolveCreativeSourceEvidence} from '../brand-plan/creativeSourceEvidence'
import {sourceMediaAllowedHosts,sourceMediaLocation,publicSourceMediaUrl} from '../brand-plan/creativeSourceMediaPolicy'

// Request-local cache only: signed media and pinned versions must be revalidated.
export async function resolveBrainstormVideos(candidates:{idea:any;current:any}[],brandId:string,fetchEvidence:(id:string)=>Promise<any>){
 const cache=new Map<string,Promise<any>>(),resolved:any[]=new Array(candidates.length)
 const deadline=Date.now()+20000
 let cursor=0,incomplete=false
 const read=(id:string)=>{
  let promise=cache.get(id)
  if(!promise){promise=fetchEvidence(id);cache.set(id,promise)}
  return promise
 }
 async function worker(){
  while(cursor<candidates.length){
   const index=cursor++,{idea,current}=candidates[index]
   if(Date.now()>=deadline){incomplete=true;continue}
   let timer:ReturnType<typeof setTimeout>|undefined
   try{
    const {raw}=await Promise.race([
     resolveCreativeSourceEvidence(current,revisionSource(current,null,new Date().toISOString()),read),
     new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('creative_source_unavailable')),Math.max(1,deadline-Date.now()))}),
    ])
    const video=sourceMediaLocation(raw.originalVideoUrl)
    if(!video)continue
    const controlled=video.search||sourceMediaAllowedHosts().has(video.hostname)||/\.myhuaweicloud\.com$/i.test(video.hostname)
    const mediaPath=idea.savedCreativeId?`content-creatives/${encodeURIComponent(idea.savedCreativeId)}/source/media`:`ai/brainstorm/${encodeURIComponent(idea.sourceId)}/media`
    resolved[index]={...idea,videoStatus:'available',videoUrl:controlled?`/api/brands/${encodeURIComponent(brandId)}/${mediaPath}`:video.href,thumbnailUrl:typeof raw.thumbnailDataUrl==='string'&&raw.thumbnailDataUrl.length<=65558&&/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.thumbnailDataUrl)?raw.thumbnailDataUrl:`/api/brands/${encodeURIComponent(brandId)}/${mediaPath}?kind=thumbnail`,originalScript:creativeSourceScript(raw),editingScript:creativeSourceScript(raw)}
   }catch(error){
    const code=(error as any)?.code||(error as Error).message
    if(!['creative_source_not_found','creative_source_changed','library_evidence_too_large'].includes(code))incomplete=true
   }finally{clearTimeout(timer)}
  }
 }
 await Promise.all(Array.from({length:Math.min(6,candidates.length)},()=>worker()))
 return {items:resolved.filter(Boolean),videoResolutionIncomplete:incomplete}
}
