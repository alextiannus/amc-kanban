import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

async function main() {
  console.log('Testing MCP Streamable HTTP Client Connection...')
  const url = new URL('https://devmcp.12eat.ai/mcp')
  
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: 'Bearer 60677f288ebce1648b46b'
      }
    }
  })

  const client = new Client({
    name: 'test-mcp-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  })

  try {
    await client.connect(transport)
    console.log('Connected to MCP server successfully!')
    
    console.log('Calling autocomplete_address tool...')
    const t0 = Date.now()
    const result = await client.callTool({
      name: 'autocomplete_address',
      arguments: {
        input: '544585',
        country: 'SG'
      }
    })
    console.log(`Tool result (${Date.now() - t0}ms):`, JSON.stringify(result, null, 2))
    
    await transport.close()
  } catch (err) {
    console.error('Connection failed:', err)
  }
}

main()
