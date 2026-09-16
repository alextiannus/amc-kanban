import { createHash } from 'node:crypto'

export type Connection = { id: string; provider: string; displayName: string; modelName: string; baseUrl: string | null; apiKey: string; timeoutMs?: number | null }
export type Message = { role: string; content?: any; tool_calls?: any[]; tool_call_id?: string }
export type TextRequest = { messages: Message[]; maxTokens?: number; temperature?: number; tools?: any[]; toolChoice?: any; signal?: AbortSignal; task?: string; source?: string; timeoutMs?:number }
export type Completion = { text: string | null; message: Message; provider: string; modelName: string; responseModel: string | null; latencyMs: number }

export function protocolOf(provider: string) {
  if (['openai', 'deepseek', 'custom_shim', 'kopix', 'minimax'].includes(provider)) return 'openai'
  if (['google', 'anthropic'].includes(provider)) return provider
  throw new Error('Unsupported text protocol; choose an existing text protocol')
}
export function fingerprint(c: Connection) {
  return createHash('sha256').update(JSON.stringify([c.id,c.provider,c.modelName,c.baseUrl,c.apiKey,c.timeoutMs])).digest('hex')
}
export function assertTextRequest(input: TextRequest) {
  if (!Array.isArray(input.messages) || !input.messages.length) throw new Error('messages are required')
  for (const m of input.messages) {
    if (!['system','user','assistant','tool'].includes(m.role)) throw new Error('Invalid message role')
    if (m.content != null && typeof m.content !== 'string') throw new Error('Global text gateway accepts text only')
  }
}
export async function complete(c: Connection, input: TextRequest): Promise<Completion> {
  assertTextRequest(input)
  const protocol = protocolOf(c.provider)
  const started = Date.now()
  const headers: Record<string,string> = { 'Content-Type': 'application/json' }
  const maxTokens = Math.max(1, Math.min(64000, Math.floor(input.maxTokens || 2048)))
  let url: string
  let body: any
  if (protocol === 'openai') {
    const base = c.baseUrl || ({ kopix:'https://www.kopix.ai/v1', deepseek:'https://api.deepseek.com/v1', minimax:'https://api.minimaxi.chat/v1' } as Record<string,string>)[c.provider] || 'https://api.openai.com/v1'
    url = `${base.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')}/chat/completions`
    headers.Authorization = `Bearer ${c.apiKey}`
    body = { model:c.modelName, messages:input.messages, max_tokens:maxTokens, stream:false,
      ...(input.temperature !== undefined ? { temperature:input.temperature } : {}),
      ...(input.tools?.length ? { tools:input.tools, tool_choice:input.toolChoice || 'auto', parallel_tool_calls:false } : {}) }
  } else if (protocol === 'anthropic') {
    url = `${(c.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`
    headers['x-api-key'] = c.apiKey; headers['anthropic-version'] = '2023-06-01'
    body = { model:c.modelName, max_tokens:maxTokens,
      system:input.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),
      messages:input.messages.filter(m=>m.role!=='system').map(m=>m.role==='tool'
        ? {role:'user',content:[{type:'tool_result',tool_use_id:m.tool_call_id,content:m.content}]}
        : {role:m.role,content:[...(m.content?[{type:'text',text:m.content}]:[]),...(m.tool_calls||[]).map(t=>({type:'tool_use',id:t.id,name:t.function.name,input:JSON.parse(t.function.arguments)}))]}),
      ...(input.tools?.length ? { tools:input.tools.map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters})), tool_choice: typeof input.toolChoice==='object'?{type:'tool',name:input.toolChoice.function.name,disable_parallel_tool_use:true}:{type:input.toolChoice==='required'?'any':input.toolChoice==='none'?'none':'auto',disable_parallel_tool_use:true} } : {}) }
  } else {
    url = `${(c.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')}/models/${encodeURIComponent(c.modelName)}:generateContent`
    headers['x-goog-api-key'] = c.apiKey
    const names = new Map(input.messages.flatMap(m=>(m.tool_calls||[]).map(t=>[t.id,t.function.name] as const)))
    body = { systemInstruction:{parts:[{text:input.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')||'Follow the user instructions.'}]},
      contents:input.messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:m.role==='tool'?[{functionResponse:{name:names.get(m.tool_call_id||''),response:{result:m.content}}}]:[...(m.content?[{text:m.content}]:[]),...(m.tool_calls||[]).map(t=>({functionCall:{name:t.function.name,args:JSON.parse(t.function.arguments)},...(t.thoughtSignature?{thoughtSignature:t.thoughtSignature}:{})}))]})),
      generationConfig:{maxOutputTokens:maxTokens,...(input.temperature!==undefined?{temperature:input.temperature}:{})},
      ...(input.tools?.length?{tools:[{functionDeclarations:input.tools.map(t=>t.function)}],...(typeof input.toolChoice==='object'?{toolConfig:{functionCallingConfig:{mode:'ANY',allowedFunctionNames:[input.toolChoice.function.name]}}}:{})}:{}) }
  }
  const timeout = AbortSignal.timeout(Math.max(1,Math.min(110000, c.timeoutMs || 110000,input.timeoutMs||110000)))
  const response = await fetch(url, {method:'POST', headers, body:JSON.stringify(body), signal:input.signal?AbortSignal.any([input.signal,timeout]):timeout, cache:'no-store'})
  if (!response.ok) throw new Error(`Text provider HTTP ${response.status}`)
  const data = await response.json()
  if (protocol==='openai' && data.choices?.[0]?.finish_reason==='length') throw new Error('Text provider output token limit reached')
  let message: Message
  if (protocol === 'openai') message = data.choices?.[0]?.message
  else if (protocol === 'anthropic') message = {role:'assistant',content:(data.content||[]).filter((v:any)=>v.type==='text').map((v:any)=>v.text).join(''),tool_calls:(data.content||[]).filter((v:any)=>v.type==='tool_use').map((v:any)=>({id:v.id,type:'function',function:{name:v.name,arguments:JSON.stringify(v.input)}}))}
  else { const parts=data.candidates?.[0]?.content?.parts||[]; message={role:'assistant',content:parts.filter((v:any)=>v.text&&!v.thought).map((v:any)=>v.text).join(''),tool_calls:parts.filter((v:any)=>v.functionCall).map((v:any,i:number)=>({id:`call_${i}`,thoughtSignature:v.thoughtSignature,type:'function',function:{name:v.functionCall.name,arguments:JSON.stringify(v.functionCall.args)}}))} }
  if (!message || (!message.content && !message.tool_calls?.length)) throw new Error('Text provider returned an empty response')
  return {text:typeof message.content==='string'?message.content:null,message,provider:c.provider,modelName:c.modelName,responseModel:data.model||data.modelVersion||null,latencyMs:Date.now()-started}
}
