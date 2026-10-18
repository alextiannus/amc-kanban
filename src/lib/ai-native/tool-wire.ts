import type {Completion} from '../global-text/transport'

const workspaceWriter=(tool:any)=>{const p=tool?.parameters?.properties;return !!(p?.path&&p?.content&&p?.expectedRevision)}
export function nativeWireTools(tools:any[],structuredWorkspace=false){
 return tools.map(tool=>{
  if(structuredWorkspace&&workspaceWriter(tool))return {...tool,description:tool.description+' For this planning draft, supply content as a complete JSON OBJECT matching artifactContract, not as a JSON-encoded string. The host serializes it losslessly before the normal workspace write and verification.',parameters:{...tool.parameters,properties:{...tool.parameters.properties,content:{type:'object',description:'Complete planning reply artifact as a JSON object; follow the trusted artifactContract.',additionalProperties:true},...(tool.parameters.properties.mediaType?{mediaType:{type:'string',const:'application/json'}}:{})}}}
  return tool.name==='iaic_finish'?{...tool,description:tool.description+' Supply literal JSON: {"result":{"summary":"Candidate ready","artifacts":[{"path":"COPY EXACT RECEIPT PATH","revision":1,"digest":"COPY EXACT RECEIPT DIGEST"}]}}. Copy actual workspace reference values. Use a short summary, not the candidate document. No JavaScript expressions, concatenation, markdown fences or ellipses.'}:tool
 })
}
export function nativeWireCall(call:any,result:Completion,tools:any[]=[],structuredWorkspace=false){
 const original=call?.function?.arguments
 try{
  if(typeof call?.function?.name!=='string'||!call.function.name)throw new Error('tool_call_required')
  // Some compatible providers already return a parsed object. Normalize its
  // representation, without changing values or repairing malformed strings.
  let args=typeof original==='string'?JSON.parse(original):original
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('object_required')
  // Identify the workspace writer from the trusted advertised schema, including aliases.
  const properties=tools.find(tool=>tool.name===call.function.name)?.parameters?.properties
  if(properties?.path&&properties?.content&&properties?.expectedRevision&&args.mediaType==='application/json'){
   if(structuredWorkspace&&args.content&&typeof args.content==='object'&&!Array.isArray(args.content))args={...args,content:JSON.stringify(args.content)}
   if(typeof args.content!=='string')throw new Error('json_document_string_required')
   JSON.parse(args.content)
  }
  return {...call,function:{...call.function,arguments:JSON.stringify(args)}}
 }catch(error){
  const position=Number(String((error as Error).message).match(/position (\d+)/)?.[1])
  const syntax={tool:/^[a-zA-Z0-9_-]{1,64}$/.test(call?.function?.name||'')?call.function.name:"unknown",argumentType:typeof original,chars:typeof original==='string'?original.length:null,position:Number.isFinite(position)?position:null,shape:typeof original==='string'&&Number.isFinite(position)?original.slice(Math.max(0,position-25),position+25).replace(/[^{}\[\]":,\\\n\r\t` ]/gu,'x'):null}
  console.warn('[amc-ai-invalid-tool-json]',JSON.stringify(syntax))
  throw Object.assign(new Error('Tool arguments must be one valid JSON object. For workspace writes with mediaType application/json, content must itself contain a complete valid JSON document serialized as a string. Escape all inner quotes and newlines; no trailing commas. Escape quotes and newlines inside strings. Do not use JavaScript expressions, concatenation or markdown. For iaic_finish send {"result":{"summary":"Candidate ready","artifacts":[{"path":"copy actual path","revision":1,"digest":"copy actual digest"}]}} with actual literal reference values; do not include the full document in summary.'),{code:'INVALID_MODEL_ACTION',invalidAction:true,usage:{inputTokens:result.usage?.input_tokens??null,outputTokens:result.usage?.output_tokens??null,cachedInputTokens:result.usage?.input_tokens_details?.cached_tokens??null,reasoningOutputTokens:result.usage?.output_tokens_details?.reasoning_tokens??null},usageEvidence:{rawUsage:result.rawUsage,providerReference:result.providerReference},providerCompleted:true})
 }
}

export function nativeWireCalls(calls:unknown,result:Completion,tools:any[]=[],structuredWorkspace=false){
 // Rejected provider structures must preserve already observed usage as well.
 if(!Array.isArray(calls)||!calls.length)return [nativeWireCall(null,result,tools,structuredWorkspace)]
 return calls.map(call=>nativeWireCall(call,result,tools,structuredWorkspace))
}
