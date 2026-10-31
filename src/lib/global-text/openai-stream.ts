/** Aggregate OpenAI-compatible tool deltas without exposing intermediate output.
 * Only a complete stream may be returned for the normal validation and ledger.
 */
export async function readOpenAIStream(response:Response,onTools?:(calls:readonly any[])=>void,onText?:(text:string)=>void){
 const reader=response.body?.getReader();if(!reader)throw Error('Text stream body missing')
 const decoder=new TextDecoder(),calls=new Map<number,any>()
 let buffer='',bytes=0,payload=0,id:string|undefined,model:string|undefined,content='',finish:string|null=null,usage:any,done=false
 const frame=(line:string)=>{
  const raw=line.split(/\r?\n/).filter(v=>v.startsWith('data:')).map(v=>v.slice(5).trimStart()).join('\n')
  if(!raw)return
  if(raw==='[DONE]'){done=true;return}
  const chunk=JSON.parse(raw)
  if(chunk.error)throw Error('Text provider stream error')
  if(typeof chunk.id==='string')id=chunk.id
  if(typeof chunk.model==='string')model=chunk.model
  if(chunk.usage)usage=chunk.usage
  for(const choice of chunk.choices||[]){
   if(choice.index!==0)throw Error('Text stream has unsupported choice')
   if(choice.finish_reason)finish=choice.finish_reason
   const delta=choice.delta||{}
   if(typeof delta.content==='string'){content+=delta.content;payload+=Buffer.byteLength(delta.content);try{onText?.(content)}catch{/* Preview observers cannot alter billing or completion. */}}
   for(const part of delta.tool_calls||[]){
    if(!Number.isInteger(part.index)||part.index<0||part.index>=64)throw Error('Text stream tool limit')
    const call=calls.get(part.index)||{id:'',type:'function',function:{name:'',arguments:''}}
    if(typeof part.id==='string'){if(call.id&&call.id!==part.id)throw Error('Text stream tool id changed');call.id=part.id}
    if(part.type&&part.type!=='function')throw Error('Text stream tool type invalid')
    if(typeof part.function?.name==='string')call.function.name+=part.function.name
    if(typeof part.function?.arguments==='string'){call.function.arguments+=part.function.arguments;payload+=Buffer.byteLength(part.function.arguments)}
    calls.set(part.index,call)
   }
   if(onTools&&calls.size)try{onTools([...calls.values()])}catch{/* Presentation observers cannot alter billing or completion. */}
   if(payload>2_000_000)throw Error('Text stream content too large')
  }
 }
 try{
  while(!done){
   const next=await reader.read();if(next.done)break
   bytes+=next.value.byteLength;if(bytes>16_000_000)throw Error('Text stream response too large')
   buffer+=decoder.decode(next.value,{stream:true})
   let match:RegExpExecArray|null
   while((match=/\r?\n\r?\n/.exec(buffer))){const part=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);frame(part);if(done)break}
  }
  buffer+=decoder.decode();if(buffer.trim()&&!done)frame(buffer)
  if(!done||!finish)throw Error('Text stream incomplete')
  return {id,model,usage,choices:[{index:0,finish_reason:finish,message:{role:'assistant',content:content||null,...(calls.size?{tool_calls:[...calls.entries()].sort(([a],[b])=>a-b).map(([,v])=>v)}:{})}}]}
 }catch(error){
  // Observed provider usage remains attached even when the envelope is invalid.
  if(usage)Object.assign(error as object,{usage:{inputTokens:usage.prompt_tokens??null,outputTokens:usage.completion_tokens??null,cachedInputTokens:usage.prompt_tokens_details?.cached_tokens??null,reasoningOutputTokens:usage.completion_tokens_details?.reasoning_tokens??null},usageEvidence:{providerReference:id,rawUsage:usage},providerCompleted:done})
  throw error
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
