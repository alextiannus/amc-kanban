export async function POST() {
  return Response.json(
    {
      error: 'endpoint_retired',
      message: 'Direct MCP execution is disabled. Use the authenticated /api/mcp endpoint.',
    },
    { status: 410 },
  )
}
