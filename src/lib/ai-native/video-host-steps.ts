import {literalVideoEdit,requireVideoSkill,requestedVideoCraft,validateVideoArtifact,videoContractFor,VIDEO_RESOURCE,VIDEO_SKILL,type VideoRewriteIntent} from './video-rewrite'

/** Mechanical proposals only. Core still authorizes, journals and executes each
 * call and verifies completion. Skill choice and creative repair remain model work.
 * Input is the revalidated Core context, never a merchant-supplied call history. */
export function videoHostStep(request:any,intent:VideoRewriteIntent):any|null{
 if(request.billingContext?.capability!=='agent.work')return null
 let data:any
 try{data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user')?.content)}catch{return null}
 if(!Array.isArray(data?.calls)||!Array.isArray(data.events))return null
 const calls=data.calls,ok=calls.filter((c:any)=>c.status==='succeeded')
 const tool=(name:string,input:any)=>request.tools.some((t:any)=>t.name===name)?{type:'call',name,input}:null
 const context=ok.find((c:any)=>c.capability==='amc.context')
 if(!context)return calls.some((c:any)=>c.capability==='amc.context')?null:tool('amc.context',{})
 if(context.result?.intent?.requestKey!==intent.requestKey)return null
 // The first paid decision sees metadata only and selects the main Skill.
 if(!ok.some((c:any)=>c.capability==='assistant.skills.read'&&c.input?.id===VIDEO_SKILL&&!c.input.resource))return null
 const read=(resource:string)=>({id:VIDEO_SKILL,resource})
 for(const resource of [VIDEO_RESOURCE,...requestedVideoCraft(intent.goal)]){
  const matches=calls.filter((c:any)=>c.capability==='assistant.skills.read'&&c.input?.id===VIDEO_SKILL&&c.input.resource===resource)
  if(!matches.some((c:any)=>c.status==='succeeded'))return matches.length?null:tool('assistant.skills.read',read(resource))
 }
 try{requireVideoSkill(calls,intent.goal)}catch{return null}
 if(!ok.some((c:any)=>c.capability==='amc.video_facts'))return calls.some((c:any)=>c.capability==='amc.video_facts')?null:tool('amc.video_facts',{section:'brand',productIds:[]})
 const write=ok.findLast((c:any)=>c.capability==='my_write_workspace'&&c.result?.reference?.path===intent.artifactPath)
 if(!write){
  if(!literalVideoEdit(intent)||calls.some((c:any)=>c.capability==='my_write_workspace'))return null
  const {instructions,...artifact}=videoContractFor(intent) as any,content=JSON.stringify(artifact)
  try{validateVideoArtifact(content,intent)}catch{return null}
  return tool('my_write_workspace',{path:intent.artifactPath,expectedRevision:0,mediaType:'application/json',content})
 }
 const ref=write.result.reference
 if(!Number.isInteger(ref.revision)||!/^[a-f0-9]{64}$/.test(ref.digest))return null
 const reviews=calls.filter((c:any)=>c.capability==='amc.video_review'&&c.input?.revision===ref.revision&&c.input.digest===ref.digest)
 if(!reviews.length)return tool('amc.video_review',{revision:ref.revision,digest:ref.digest})
 const review=reviews.findLast((c:any)=>c.status==='succeeded')?.result
 if(!review||review.artifactRevision!==ref.revision||review.artifactDigest!==ref.digest||!['passed','needs_revision'].includes(review.status))return null
 const latest=data.events.at(-1)
 if(latest?.kind!=='call_settled'||!reviews.some((c:any)=>c.id===latest.data?.callId&&c.status==='succeeded'))return null
 return {type:'finish',result:{summary:review.status==='passed'?'Reviewed video script':'Video needs revision',artifacts:[ref]}}
}
