import { callLLM } from './llmRouter.ts'
import { prisma } from './prisma'
import { selectedExecution, recordExecution } from './model-management/runtime'

/**
 * Call the best available LLM to generate text.
 * Routes through LLMConfig by taskTag — no hardcoded provider.
 */
export async function generateText(prompt: string, maxTokens: number = 800): Promise<string | null> {
  const result = await callLLM('copywriting', prompt, maxTokens)
  if (result.text) return result.text
  console.warn('[generateText] All LLM providers failed:', result.error)
  return null
}

/**
 * Call a Google Gemini model with multimodal input (text + image inlineData).
 *
 * Reads the API key from the first enabled LLMConfig row with provider='google'.
 * If no Google LLMConfig is configured, returns null (feature is silently unavailable).
 *
 * To enable: Admin → AI 模型配置 → 新建 → provider=google, modelName=gemini-2.0-flash, apiKey=<key>
 */
export async function generateMultimodalText(
  prompt: string,
  mimeType: string,
  base64Data: string,
  maxTokens: number = 500
): Promise<string | null> {
  const central=await selectedExecution('image_understanding',['image_input'])
  if(central){
    const limit=central.definition.maxTokensByTask?.image_understanding
    if(limit)maxTokens=Math.min(maxTokens,limit)
    const started=Date.now();let completed=false,responseModel:string|undefined
    try{
    let url:string,headers:Record<string,string>,body:any
    if(central.provider==='google'){
      url=`${central.baseUrl.replace(/\/+$/,'')}/models/${encodeURIComponent(central.modelName)}:generateContent`;headers={'Content-Type':'application/json','x-goog-api-key':central.apiKey}
      body={contents:[{parts:[{text:prompt},{inlineData:{mimeType,data:base64Data}}]}],generationConfig:{maxOutputTokens:maxTokens}}
    }else if(['openai','custom_shim','kopix','deepseek'].includes(central.provider)){
      url=`${central.baseUrl.replace(/\/+$/,'').replace(/\/chat\/completions$/,'')}/chat/completions`;headers={'Content-Type':'application/json',Authorization:`Bearer ${central.apiKey}`}
      body={model:central.modelName,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:${mimeType};base64,${base64Data}`}}]}],max_tokens:maxTokens,stream:false}
    }else throw new Error('Selected image understanding model has no Kanban adapter')
    const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(central.timeoutMs),cache:'no-store'})
    if(!response.ok)throw new Error(`Central image model HTTP ${response.status}`)
    const result=await response.json(),text=result.choices?.[0]?.message?.content||result.candidates?.[0]?.content?.parts?.find((p:any)=>p.text)?.text
    if(!text)throw new Error('Central image model returned empty content')
    completed=true;responseModel=result.model||result.modelVersion
    return text
    }finally{await recordExecution({source:'kanban',task:'image_understanding',version:central.policyVersion!,modelId:central.id,connectionId:central.connectionId,targetModel:central.modelName,responseModel,status:completed?'success':'failed',latencyMs:Date.now()-started})}
  }
  // Look up Google config from LLMConfig — no SystemConfig dependency
  const googleConfig = await prisma.lLMConfig.findFirst({
    where: { isEnabled: true, provider: 'google' },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  if (!googleConfig?.apiKey) {
    console.warn('[generateMultimodalText] No Google LLMConfig with API key found. Skipping multimodal request.')
    return null
  }

  const { apiKey, modelName } = googleConfig

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      }
    )

    if (!response.ok) {
      console.error(`[generateMultimodalText] API failed ${response.status}: ${response.statusText}`)
      return null
    }

    const json = await response.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? text.trim() : null
  } catch (error) {
    console.error('[generateMultimodalText] Request failed:', error)
    return null
  }
}
