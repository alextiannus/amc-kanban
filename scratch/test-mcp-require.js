console.log('Requiring next/dist/server/mcp/get-mcp-middleware...');
try {
  require('next/dist/server/mcp/get-mcp-middleware');
  console.log('Success require next/dist/server/mcp/get-mcp-middleware');
} catch (err) {
  console.log('Error require next/dist/server/mcp/get-mcp-middleware:', err.message);
}
