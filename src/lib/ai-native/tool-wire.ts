import type {Completion} from '../global-text/transport'

export function nativeWireTools(tools:any[]){
 return tools.map(tool=>tool.name==='iaic_finish'?{...tool,description:tool.description+' Supply literal JSON: {"result":{"summary":"Candidate ready","artifacts":[{"path":"COPY EXACT RECEIPT PATH","revision":1,"digest":"COPY EXACT RECEIPT DIGEST"}]}}. Copy actual workspace reference values. Use a short summary, not the candidate document. No JavaScript expressions, concatenation, markdown fences or ellipses.'}:tool)
}
export function nativeWireCall(call:any,result:Completion){
 const original=call.function.arguments
 try{
  // Some compatible providers already return a parsed object. Normalize its
  // representation, without changing values or repairing malformed strings.
  const args=typeof original==='string'?JSON.parse(original):original
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('object_required')
  return {...call,function:{...call.function,arguments:JSON.stringify(args)}}
 }catch(error){
  const position=Number(String((error as Error).message).match(/position (\d+)/)?.[1])
  const syntax={tool:/^[a-zA-Z0-9_-]{1,64}$/.test(call.function.name)?call.function.name:"unknown",argumentType:typeof original,chars:typeof original==='string'?original.length:null,position:Number.isFinite(position)?position:null,shape:typeof original==='string'&&Number.isFinite(position)?original.slice(Math.max(0,position-25),position+25).replace(/[^{}\[\]":,\\\n\r\t` ]/gu,'x'):null}
  console.warn('[amc-ai-invalid-tool-json]',JSON.stringify(syntax))
  throw Object.assign(new Error('Tool arguments must be one valid JSON object. Escape quotes and newlines inside strings. Do not use JavaScript expressions, concatenation or markdown. For iaic_finish send {"result":{"summary":"Candidate ready","artifacts":[{"path":"copy actual path","revision":1,"digest":"copy actual digest"}]}} with actual literal reference values; do not include the full document in summary.'),{code:'INVALID_MODEL_ACTION',invalidAction:true,usage:{inputTokens:result.usage?.input_tokens??null,outputTokens:result.usage?.output_tokens??null,cachedInputTokens:result.usage?.input_tokens_details?.cached_tokens??null,reasoningOutputTokens:result.usage?.output_tokens_details?.reasoning_tokens??null},usageEvidence:{rawUsage:result.rawUsage,providerReference:result.providerReference},providerCompleted:true})
 }
}
