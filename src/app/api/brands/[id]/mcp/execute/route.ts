import { NextResponse } from 'next/server'
import { McpClientManager } from '@/lib/mcp/clientManager'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: brandId } = await params
    const { toolName, args } = await req.json()
    
    if (!toolName) {
      return NextResponse.json({ error: 'toolName is required' }, { status: 400 })
    }
    
    console.log(`[API MCP Execute] Executing ${toolName} for brand ${brandId}`)
    const result = await McpClientManager.executeTool(brandId, toolName, args || {})
    return NextResponse.json(result)
  } catch (error: any) {
    console.error(`[API MCP Execute] Error:`, error)
    return NextResponse.json({ error: error.message || 'Tool execution failed' }, { status: 500 })
  }
}
