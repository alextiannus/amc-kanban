const path = require('path');

console.log('Starting get-mcp-middleware sub-require checks...');

const modulesToRequire = [
  "./get-or-create-mcp-server",
  "../api-utils/node/parse-body",
  "next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp"
];

const basePath = path.resolve(__dirname, '../node_modules/next/dist/server/mcp');

for (const mod of modulesToRequire) {
  console.log(`Requiring: ${mod}...`);
  try {
    let resolvedPath = mod;
    if (mod.startsWith('.') || mod.startsWith('..')) {
      resolvedPath = path.resolve(basePath, mod);
    }
    require(resolvedPath);
    console.log(`Success: ${mod}`);
  } catch (err) {
    console.log(`Error requiring ${mod}:`, err.message);
  }
}

console.log('All sub-requires completed successfully!');
