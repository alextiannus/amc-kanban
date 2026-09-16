import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { currentBinding, connectionFor } from '@/lib/global-text/policy'
import { runtimeConfig } from '@/lib/model-management/registry'

/**
 * GET /api/client-config
 *
 * Returns client-side configuration for authenticated users.
 * Previously exposed Gemini API keys to the browser; now only returns
 * LLMConfig metadata for OpenAI-compatible providers if needed by any
 * client-side tool. AI keys are no longer sent to the browser.
 *
 * Note: callGeminiDirect() now routes through /api/llm/chat server-side,
 * so this endpoint is no longer required for AI calls.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Return best enabled LLMConfig for any client-side metadata needs
  // (e.g. showing which AI model is active in UI). Keys are NOT included.
  try {
    const policy=await currentBinding()
    if(typeof policy.modelRevision==='number'){
      const runtime=await runtimeConfig({version:policy.modelRevision})
      const model=runtime.models!.find(m=>m.id===runtime.selection!.defaults.text)!
      return NextResponse.json({llmConfig:{provider:model.connectionName,modelName:model.definition.modelName,displayName:model.definition.name},policyVersion:runtime.version,strict:true,centralModels:{version:runtime.version,defaults:runtime.selection!.defaults,models:runtime.models!.map(m=>({id:m.id,name:m.definition.name,modelName:m.definition.modelName,provider:m.connectionName,capabilities:m.definition.capabilities}))},managementPath:'/admin?tab=system'},{headers:{'Cache-Control':'no-store'}})
    }
    if(policy.enabled){
      const c=await connectionFor(policy)
      return NextResponse.json({llmConfig:{provider:c.provider,modelName:c.modelName,displayName:c.displayName},policyVersion:policy.version,strict:true},{headers:{'Cache-Control':'no-store'}})
    }
    const configs = await prisma.lLMConfig.findMany({
      where: { isEnabled: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 1,
      select: { provider: true, modelName: true, displayName: true },
    })

    if (configs.length > 0) {
      const c = configs[0]
      return NextResponse.json(
        { llmConfig: { provider: c.provider, modelName: c.modelName, displayName: c.displayName } },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
  } catch (err) {
    return NextResponse.json({error:'Central model configuration unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})
  }

  return NextResponse.json({ llmConfig: null }, { headers: { 'Cache-Control': 'no-store' } })
}
