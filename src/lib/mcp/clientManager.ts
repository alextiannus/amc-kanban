import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { prisma } from '@/lib/prisma'

interface ConnectedServer {
  name: string
  client: Client
  transport: any
}

interface CachedTools {
  tools: any[]
  timestamp: number
}

const BLOCKED_PRODUCTION_MCP_HOSTS = new Set([
  'devmcp.12eat.ai',
])

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
}

function isBlockedProductionMcpUrl(rawUrl: string): boolean {
  if (!isProductionRuntime()) return false
  if (process.env.ALLOW_DEV_MCP_IN_PRODUCTION === 'true') return false

  try {
    const url = new URL(rawUrl)
    return BLOCKED_PRODUCTION_MCP_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return true
  }
}

export class McpClientManager {
  private static connections: Map<string, ConnectedServer[]> = new Map()
  private static toolsCache: Map<string, CachedTools> = new Map()
  private static CACHE_TTL = 10 * 60 * 1000 // 10 minutes cache TTL

  // Circuit Breaker State
  private static circuitBreakers: Map<string, { consecutiveFailures: number; cooldownUntil: number }> = new Map()
  private static MAX_FAILURES = 3
  private static COOLDOWN_MS = 60 * 1000 // 60 seconds

  private static getCircuitBreakerKey(brandId: string, serverName: string): string {
    return `${brandId}:${serverName}`
  }

  private static isCircuitTripped(brandId: string, serverName: string): boolean {
    const key = this.getCircuitBreakerKey(brandId, serverName)
    const state = this.circuitBreakers.get(key)
    if (!state) return false
    if (Date.now() < state.cooldownUntil) {
      return true
    }
    return false
  }

  private static recordSuccess(brandId: string, serverName: string) {
    const key = this.getCircuitBreakerKey(brandId, serverName)
    this.circuitBreakers.delete(key)
  }

  private static recordFailure(brandId: string, serverName: string) {
    const key = this.getCircuitBreakerKey(brandId, serverName)
    const state = this.circuitBreakers.get(key) || { consecutiveFailures: 0, cooldownUntil: 0 }
    state.consecutiveFailures += 1
    if (state.consecutiveFailures >= this.MAX_FAILURES) {
      state.cooldownUntil = Date.now() + this.COOLDOWN_MS
      console.warn(`[MCP Circuit Breaker] Tripped! Cool-down active for ${key} until ${new Date(state.cooldownUntil).toISOString()}`)
    } else {
      console.warn(`[MCP Circuit Breaker] Failure recorded for ${key} (failures: ${state.consecutiveFailures}/${this.MAX_FAILURES})`)
    }
    this.circuitBreakers.set(key, state)
  }

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
    const configs = await prisma.mcpServerConfig.findMany({
      where: { brandId, isActive: true }
    })
    const allowedConfigs = configs.filter((config: any) => {
      const blocked = isBlockedProductionMcpUrl(config.url)
      if (blocked) {
        console.warn(`[MCP Client Manager] Skipping production-blocked MCP server: ${config.name} (${config.url})`)
      }
      return !blocked
    })

    // Filter out servers where the circuit breaker is currently tripped
    const untrippedConfigs = allowedConfigs.filter((c: any) => !this.isCircuitTripped(brandId, c.name))

    const cached = this.connections.get(brandId)
    // If cached connection count matches untripped active config count, return cached connections.
    // Otherwise, close any existing connections to prevent resource leaks and reconnect.
    if (cached && cached.length === untrippedConfigs.length) {
      return cached
    }

    if (cached) {
      console.log(`[MCP Client Manager] Active untripped config count changed (cached=${cached.length}, active=${untrippedConfigs.length}). Reconnecting...`)
      await this.closeConnections(brandId)
    }

    const connected: ConnectedServer[] = []

    for (const config of allowedConfigs) {
      // Skip connecting if the circuit breaker is tripped for this server
      if (this.isCircuitTripped(brandId, config.name)) {
        console.warn(`[MCP Client Manager] Circuit breaker active for ${config.name}. Skipping connection.`)
        continue
      }

      let transport: any = null
      try {
        const url = new URL(config.url)
        const rawHeaders = (config.headers as Record<string, string>) || {}
        const headers = {
          'Accept': 'application/json, text/event-stream',
          ...rawHeaders
        }
        
        if (config.headers && typeof config.headers === 'object') {
          // If authorization headers are present, use StreamableHTTPClientTransport for direct post auth
          transport = new StreamableHTTPClientTransport(url, {
            requestInit: { 
              headers,
              // @ts-ignore
              cache: 'no-store'
            },
            fetch: fetch as any
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

        // Implement a 5-second connection timeout to prevent hanging API requests
        const connectPromise = client.connect(transport)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout (5s)')), 5000)
        )
        await Promise.race([connectPromise, timeoutPromise])

        connected.push({ name: config.name, client, transport })
        console.log(`[MCP Client Manager] Connected to MCP server: ${config.name}`)
        
        // Succeeded, reset circuit breaker
        this.recordSuccess(brandId, config.name)
      } catch (err) {
        console.error(`[MCP Client Manager] Failed to connect to MCP server: ${config.name}`, err)
        // Record failure in circuit breaker
        this.recordFailure(brandId, config.name)

        // Clean up transport to prevent resource leaks
        if (transport) {
          try {
            await transport.close()
          } catch (closeErr) {
            // ignore
          }
        }
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
        // Implement a 4-second timeout for listing tools to prevent hangs
        const listToolsPromise = conn.client.listTools()
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('listTools timeout (4s)')), 4000)
        )
        const toolsRes = await Promise.race([listToolsPromise, timeoutPromise]) as any

        const namespace = conn.name.replace(/\s+/g, '-').toLowerCase()
        
        const mapped = toolsRes.tools.map((tool: any) => {
          const rawParams = tool.inputSchema || { type: 'object', properties: {} }
          const sanitizedParams = this.sanitizeSchema(rawParams)
          
          // Inject Enum guidelines for critical parameters to prevent LLM formatting issues
          if (sanitizedParams.properties) {
            if (sanitizedParams.properties.drivingType) {
              sanitizedParams.properties.drivingType.enum = ["Motorbike", "Car"]
              sanitizedParams.properties.drivingType.description = "Vehicle type for delivery. Must be 'Motorbike' or 'Car'."
            }
            if (sanitizedParams.properties.deliveryType) {
              sanitizedParams.properties.deliveryType.enum = ["FLASH"]
              sanitizedParams.properties.deliveryType.description = "Delivery type. Defaults to 'FLASH'."
            }
            
            // Remove requesterId from required array so model doesn't ask user for it
            if (Array.isArray(sanitizedParams.required)) {
              sanitizedParams.required = sanitizedParams.required.filter((r: string) => r !== 'requesterId')
            }
          }
          
          return {
            name: `${namespace}__${tool.name}`,
            description: tool.description,
            parameters: sanitizedParams
          }
        })
        
        aggregated.push(...mapped)
      } catch (err) {
        console.error(`[MCP Client Manager] Failed to fetch tools from ${conn.name}`, err)
        // If listing tools fails, the connection is likely dead. Clear cached connections
        // so that the next request starts with clean connections.
        await this.closeConnections(brandId)
      }
    }

    const configs = await prisma.mcpServerConfig.findMany({
      where: { brandId, isActive: true },
      select: { url: true },
    })
    const configsCount = configs.filter((config: any) => !isBlockedProductionMcpUrl(config.url)).length

    if (connections.length === configsCount) {
      this.toolsCache.set(brandId, {
        tools: aggregated,
        timestamp: Date.now()
      })
    } else {
      // Do not cache partial/failed tool lists; force a fresh check next time
      this.toolsCache.delete(brandId)
    }

    return aggregated
  }

  /**
   * Route a namespaces tool call to the correct remote MCP server
   */
  public static async executeTool(
    brandId: string,
    namespacedName: string,
    args: any,
    isRetry = false
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
      if (!isRetry) {
        console.log(`[MCP Client Manager] Connection not found for namespace: ${namespace}. Clearing cache and retrying once...`)
        await this.closeConnections(brandId)
        return this.executeTool(brandId, namespacedName, args, true)
      }
      throw new Error(`No active MCP connection found for namespace: ${namespace}`)
    }

    // Auto-fill requesterId and coordinates if calling submit_flash_order
    if (originalName === 'submit_flash_order') {
      if (!args.requesterId) {
        args.requesterId = Math.floor(Date.now() / 1000)
      } else if (typeof args.requesterId === 'string') {
        args.requesterId = Number(args.requesterId) || Math.floor(Date.now() / 1000)
      }

      // Auto-resolve pickup coordinates if missing or empty
      if (!args.pickupLat || !args.pickupLng || args.pickupLat === '0' || args.pickupLat === 0) {
        console.log(`[MCP Auto-resolve] Resolving pickupLat/Lng for: ${args.pickupAddress}`)
        try {
          const res = await this.executeTool(brandId, `${namespace}__autocomplete_address`, {
            input: args.pickupAddress || 'Singapore',
            country: 'SG'
          })
          if (res && res.content && res.content[0]) {
            const data = JSON.parse(res.content[0].text)
            if (data.success && data.data && data.data[0]) {
              args.pickupLat = Number(data.data[0].latitude)
              args.pickupLng = Number(data.data[0].longitude)
              console.log(`[MCP Auto-resolve] Resolved pickup coordinates: ${args.pickupLat}, ${args.pickupLng}`)
            }
          }
        } catch (e) {
          console.error('Failed to auto-resolve pickup coordinates:', e)
        }
      }

      // Auto-resolve delivery coordinates if missing or empty
      if (!args.deliveryLat || !args.deliveryLng || args.deliveryLat === '0' || args.deliveryLat === 0) {
        console.log(`[MCP Auto-resolve] Resolving deliveryLat/Lng for: ${args.deliveryAddress}`)
        try {
          const res = await this.executeTool(brandId, `${namespace}__autocomplete_address`, {
            input: args.deliveryAddress || 'Singapore',
            country: 'SG'
          })
          if (res && res.content && res.content[0]) {
            const data = JSON.parse(res.content[0].text)
            if (data.success && data.data && data.data[0]) {
              args.deliveryLat = Number(data.data[0].latitude)
              args.deliveryLng = Number(data.data[0].longitude)
              console.log(`[MCP Auto-resolve] Resolved delivery coordinates: ${args.deliveryLat}, ${args.deliveryLng}`)
            }
          }
        } catch (e) {
          console.error('Failed to auto-resolve delivery coordinates:', e)
        }
      }
    }

    // Auto-fill locale if calling create_flash_order_payment
    if (originalName === 'create_flash_order_payment') {
      if (!args.locale) {
        args.locale = 'zh-CN'
      }
    }

    try {
      // Implement a 15-second timeout for tool execution to prevent hanging API requests
      const callPromise = conn.client.callTool({
        name: originalName,
        arguments: args
      })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timeout (15s) for ${namespacedName}`)), 15000)
      )
      const response = await Promise.race([callPromise, timeoutPromise])
      return response
    } catch (err: any) {
      console.error(`[MCP Client Manager] Tool execution error on ${namespacedName}:`, err)
      // Clear connections to force a reconnect on the next attempt
      await this.closeConnections(brandId)

      if (!isRetry) {
        console.log(`[MCP Client Manager] Retrying tool execution for ${namespacedName} after connection reset...`)
        // Wait 500ms before retrying to let the network settle
        await new Promise(resolve => setTimeout(resolve, 500))
        return this.executeTool(brandId, namespacedName, args, true)
      }
      throw err
    }
  }
}
