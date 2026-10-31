/** Narrow the next proposal after a trusted terminal review. The normal application
 * verifier still checks permissions, current digest, exact review and Skill versions. */
export function prepareVideoCompletion<T extends {messages:any[];tools:any[];delegationSchema?:unknown}>(request:T):T{
 let data:any
 try{data=JSON.parse(request.messages.findLast(m=>m.role==='user')?.content)}catch{return request}
 if(!Array.isArray(data?.calls)||!Array.isArray(data?.events))return request
 const intent=data.calls.find((c:any)=>c.capability==='amc.context'&&c.status==='succeeded')?.result?.intent
 if(intent?.kind!=='video_rewrite'||data.events.at(-1)?.kind!=='call_settled')return request
 const last=data.calls.find((c:any)=>c.id===data.events.at(-1).data?.callId)
 if(last?.capability!=='amc.video_review'||last.status!=='succeeded'||!['passed','needs_revision'].includes(last.result?.status))return request
 const write=data.calls.findLast((c:any)=>c.capability==='my_write_workspace'&&c.status==='succeeded')
 const ref=write?.result?.reference
 if(ref?.path!==intent.artifactPath||ref?.revision!==last.result.artifactRevision||ref?.digest!==last.result.artifactDigest||!/^[a-f0-9]{64}$/.test(ref?.digest))return request
 return {...request,tools:[],delegationSchema:null,messages:[...request.messages,{role:'system',content:'The current video assessment is terminal. Submit iaic_finish with this exact JSON result to the application verifier. Do not reconstruct the receipt or rewrite the draft. needs_revision means assessment completed, NOT a quality pass: '+JSON.stringify({result:{summary:last.result.status==='passed'?'Reviewed video script':'Video needs revision',artifacts:[ref]}})}]}
}
