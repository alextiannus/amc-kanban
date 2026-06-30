import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { prisma } from '@/lib/prisma'
// @ts-ignore
import { fetch as undiciFetch } from 'undici'

interface ConnectedServer {
  name: string
  client: Client
  transport: any
}

interface CachedTools {
  tools: any[]
  timestamp: number
}

export class McpClientManager {
  private static connections: Map<string, ConnectedServer[]> = new Map()
  private static toolsCache: Map<string, CachedTools> = new Map()
  private static CACHE_TTL = 10 * 60 * 1000 // 10 minutes cache TTL

  /**
   * Helper to clean up connections for a brand
   */
  public static async closeConnections(brandId: string) {
    const servers = this.connections.get(brandId) || []
    for (const server of servers) {
      try {
        await server.transport.close()
      } catch (e) {
        console.error(`Failed to close transport for ${server.name}`, e)
      }
    }
    this.connections.delete(brandId)
    this.toolsCache.delete(brandId)
  }

  /**
   * Initialize client connections to all active MCP servers for a brand
   */
  private static async getConnections(brandId: string): Promise<ConnectedServer[]> {
    if (this.connections.has(brandId)) {
      return this.connections.get(brandId)!
    }

    const configs = await prisma.mcpServerConfig.findMany({
      where: { brandId, isActive: true }
    })

    const connected: ConnectedServer[] = []

    for (const config of configs) {
      try {
        const url = new URL(config.url)
        const rawHeaders = (config.headers as Record<string, string>) || {}
        const headers = {
          'Accept': 'application/json, text/event-stream',
          ...rawHeaders
        }
        
        let transport: any
        if (config.headers && typeof config.headers === 'object') {
          // If authorization headers are present, use StreamableHTTPClientTransport for direct post auth
          transport = new StreamableHTTPClientTransport(url, {
            requestInit: { 
              headers,
              // @ts-ignore
              cache: 'no-store'
            },
            fetch: undiciFetch as any
          })
        } else {
          transport = new SSEClientTransport(url)
        }

        const client = new Client({
          name: 'amc-kanban-mcp-client',
          version: '1.0.0'
        }, {
          capabilities: {}
        })

        await client.connect(transport)
        connected.push({ name: config.name, client, transport })
        console.log(`[MCP Client Manager] Connected to MCP server: ${config.name}`)
      } catch (err) {
        console.error(`[MCP Client Manager] Failed to connect to MCP server: ${config.name}`, err)
      }
    }

    this.connections.set(brandId, connected)
    return connected
  }

  private static sanitizeSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema

    if (Array.isArray(schema)) {
      return schema.map(item => this.sanitizeSchema(item))
    }

    const clean: Record<string, any> = {}
    const forbiddenKeys = new Set([
      '$schema',
      'additionalProperties',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'minimum',
      'maximum',
      'minLength',
      'maxLength',
      'pattern',
      'format'
    ])

    for (const [key, value] of Object.entries(schema)) {
      if (forbiddenKeys.has(key)) {
        continue
      }

      if (key === 'type' && Array.isArray(value)) {
        const nonNullTypes = value.filter(t => t !== 'null')
        clean[key] = nonNullTypes[0] || 'string'
      } else {
        clean[key] = this.sanitizeSchema(value)
      }
    }

    return clean
  }

  /**
   * Aggregate all tools from active MCP servers, with prefix namespace isolation
   */
  public static async aggregateExternalTools(brandId: string): Promise<any[]> {
    // Check cache first
    const cached = this.toolsCache.get(brandId)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.tools
    }

    const connections = await this.getConnections(brandId)
    const aggregated: any[] = []

    for (const conn of connections) {
      try {
        const toolsRes = await conn.client.listTools()
        const namespace = conn.name.replace(/\s+/g, '-').toLowerCase()
        
        const mapped = toolsRes.tools.map((tool: any) => {
          const rawParams = tool.inputSchema || { type: 'object', properties: {} }
          const sanitizedParams = this.sanitizeSchema(rawParams)
          
          return {
            name: `${namespace}__${tool.name}`,
            description: tool.description,
            parameters: sanitizedParams
          }
        })
        
        aggregated.push(...mapped)
      } catch (err) {
        console.error(`[MCP Client Manager] Failed to fetch tools from ${conn.name}`, err)
      }
    }

    this.toolsCache.set(brandId, {
      tools: aggregated,
      timestamp: Date.now()
    })

    return aggregated
  }

  /**
   * Route a namespaces tool call to the correct remote MCP server
   */
  public static async executeTool(
    brandId: string,
    namespacedName: string,
    args: any
  ): Promise<any> {
    const connections = await this.getConnections(brandId)
    
    const delimiterIndex = namespacedName.indexOf('__')
    if (delimiterIndex === -1) {
      throw new Error(`Invalid namespaced tool name: ${namespacedName}`)
    }

    const namespace = namespacedName.substring(0, delimiterIndex)
    const originalName = namespacedName.substring(delimiterIndex + 2)

    const conn = connections.find(
      c => c.name.replace(/\s+/g, '-').toLowerCase() === namespace
    )

    if (!conn) {
      throw new Error(`No active MCP connection found for namespace: ${namespace}`)
    }

    try {
      const response = await conn.client.callTool({
        name: originalName,
        arguments: args
      })
      return response
    } catch (err: any) {
      console.error(`[MCP Client Manager] Tool execution error on ${namespacedName}:`, err)
      throw err
    }
  }
}
