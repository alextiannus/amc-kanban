import { createAmcMcpServer } from '../../../src/lib/partner/mcp/server.ts'
import { prisma } from '../../../src/lib/prisma.ts'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

async function testMcpTool() {
  console.log('=== Testing submit_knowledge_template MCP tool ===')

  // Find or create an AI Agent for testing
  let agent = await prisma.user.findFirst({
    where: { type: 'AI_AGENT' }
  })

  if (!agent) {
    console.log('No AI Agent found in database, creating a mock one...')
    agent = await prisma.user.create({
      data: {
        email: 'test_agent@immedi.ai',
        password: 'password123',
        type: 'AI_AGENT',
        nickname: 'Test Agent',
        apiKey: 'test-mcp-key-' + Date.now()
      }
    })
  }

  const server = createAmcMcpServer(agent.apiKey!)
  
  // Create transport in stateless JSON-response mode for easier assertion
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  
  await server.connect(transport)

  // First we need to send the initialization request to negotiate protocol version
  const initRequest = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${agent.apiKey}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    })
  })
  
  const initResponse = await transport.handleRequest(initRequest)
  console.log('Initialize response status:', initResponse.status)
  
  // Call the submit_knowledge_template tool
  const callRequest = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${agent.apiKey}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'submit_knowledge_template',
        arguments: {
          industry: 'fb',
          platform: 'instagram',
          template: '【MCP TEST TEMPLATE】Enjoy our best [Signature] at [BrandName]!',
          idea: '【MCP TEST IDEA】Show delicious closeups'
        }
      }
    })
  })

  const response = await transport.handleRequest(callRequest)
  const responseText = await response.text()
  console.log('MCP Tool response:', responseText)

  const result = JSON.parse(responseText)
  if (result.error) {
    throw new Error('MCP Tool returned error: ' + JSON.stringify(result.error))
  }

  const toolResult = result.result
  if (!toolResult || toolResult.isError) {
    throw new Error('MCP Tool execution failed: ' + JSON.stringify(toolResult))
  }

  console.log('[PASS] MCP Tool verification passed!')
}

testMcpTool().catch(err => {
  console.error('[FAIL] MCP Test failed:', err)
  process.exit(1)
})
