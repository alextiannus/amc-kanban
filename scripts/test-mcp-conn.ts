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
    
    console.log('Listing tools...')
    const toolsRes = await client.listTools()
    console.log('Tools:', JSON.stringify(toolsRes, null, 2))
    
    await transport.close()
  } catch (err) {
    console.error('Connection failed:', err)
  }
}

main()
