/** A written reply should go through the existing verifier before any more editing.
 * This narrows only the next model request, not Runtime permissions or completion checks.
 * Feedback or a new user input restores the normal tools so a rejected reply can be fixed.
 */
export function prepareConversationCompletion<T extends {messages:any[];tools:any[];delegationSchema?:unknown}>(request:T):T{
  let data:any
  try{data=JSON.parse(request.messages.findLast(m=>m.role==='user')?.content)}catch{return request}
  if(!Array.isArray(data?.calls)||!Array.isArray(data?.events))return request
  const context=data.calls.find((c:any)=>c.capability==='amc.context'&&c.status==='succeeded')?.result
  if(context?.intent?.kind!=='conversation'||context.intent.topic!=='brand_planning')return request
  const lastEvent=data.events.at(-1)
  if(lastEvent?.kind!=='call_settled')return request
  const write=data.calls.find((c:any)=>c.id===lastEvent.data?.callId&&c.capability==='my_write_workspace'&&c.status==='succeeded')
  const ref=write?.result?.reference
  if(!ref||ref.path!==context.intent.artifactPath||!Number.isInteger(ref.revision)||typeof ref.digest!=='string'||!/^[a-f0-9]{64}$/.test(ref.digest))return request
  return {...request,tools:[],delegationSchema:null,messages:[...request.messages,{role:'system',content:'The reply artifact was successfully written. Submit it now using iaic_finish for the existing application verifier; do not rewrite or reread a completed reply speculatively. If verification rejects it, normal tools will be available to correct the specific feedback. Use this exact artifact receipt: '+JSON.stringify(ref)}]}
}
