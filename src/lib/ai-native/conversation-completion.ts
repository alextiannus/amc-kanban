/** A written reply should go through the existing verifier before any more editing.
 * This narrows only the next model request, not Runtime permissions or completion checks.
 * Feedback or a new user input restores the normal tools so a rejected reply can be fixed.
 */
export function prepareConversationCompletion<T extends {messages:any[];tools:any[];delegationSchema?:unknown}>(request:T,trustedIntent?:{kind:string;topic?:string;artifactPath:string}):T{
  let data:any
  try{data=JSON.parse(request.messages.findLast(m=>m.role==='user')?.content)}catch{return request}
  if(!Array.isArray(data?.calls)||!Array.isArray(data?.events))return request
  const context=data.calls.find((c:any)=>c.capability==='amc.context'&&c.status==='succeeded')?.result
  const intent=trustedIntent||context?.intent
  if(intent?.kind!=='conversation'||intent.topic!=='brand_planning')return request
  const lastEvent=data.events.at(-1)
  if(lastEvent?.kind!=='call_settled')return request
  const write=data.calls.find((c:any)=>c.id===lastEvent.data?.callId&&c.capability==='my_write_workspace'&&c.status==='succeeded')
  const ref=write?.result?.reference
  if(!ref||ref.path!==intent.artifactPath||!Number.isInteger(ref.revision)||typeof ref.digest!=='string'||!/^[a-f0-9]{64}$/.test(ref.digest))return request
  return {...request,tools:[],delegationSchema:null,messages:[...request.messages,{role:'system',content:'The reply artifact was successfully written. Submit it now using iaic_finish for the existing application verifier; do not rewrite or reread a completed reply speculatively. If verification rejects it, normal tools will be available to correct the specific feedback. Use this exact artifact receipt: '+JSON.stringify(ref)}]}
}

/** Mechanical steps only; Core still authorizes calls and verifies finish. */
export function conversationHostStep(request:any,intent:{kind:string;topic?:string;artifactPath:string;requestKey?:string}):any|null{
 if(request.billingContext?.capability!=='agent.work'||intent.kind!=='conversation'||intent.topic!=='brand_planning')return null
 let data:any
 try{data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user')?.content)}catch{return null}
 if(!Array.isArray(data?.calls)||!Array.isArray(data.events))return null
 if(!data.calls.length&&!data.events.some((e:any)=>['verification','feedback','input'].includes(e.kind))&&request.tools.some((t:any)=>t.name==='amc.context'))return {type:'call',name:'amc.context',input:{}}
 const last=data.events.at(-1)
 if(last?.kind!=='call_settled')return null
 // The planning entry has one mandatory Skill, fixed by the host contract.
 // Reading it remains an audited Core call; failed reads return to the model.
 const context=data.calls.find((c:any)=>c.id===last.data?.callId&&c.capability==='amc.context'&&c.status==='succeeded')
 if(context?.result?.requiredSkill==='amc-marketing-expert/SKILL.md'&&!data.calls.some((c:any)=>c.capability==='assistant.skills.read')&&request.tools.some((t:any)=>t.name==='assistant.skills.read'))return {type:'call',name:'assistant.skills.read',input:{id:'amc-marketing-expert/SKILL.md'}}
 const write=data.calls.find((c:any)=>c.id===last.data?.callId&&c.capability==='my_write_workspace'&&c.status==='succeeded')
 const ref=write?.result?.reference
 if(ref?.path!==intent.artifactPath||!Number.isInteger(ref.revision)||ref.revision<1||typeof ref.digest!=='string'||!/^[a-f0-9]{64}$/.test(ref.digest))return null
 return {type:'finish',result:{summary:'Planning reply ready for verification',artifacts:[{path:ref.path,revision:ref.revision,digest:ref.digest}]}}
}
