const path = require('path');
const fs = require('fs');

console.log('Starting require checks...');

const modulesToRequire = [
  "next/dist/compiled/webpack/webpack",
  "./middleware-webpack",
  "./hot-middleware",
  "inspector",
  "path",
  "../../build/entries",
  "../../build/route-discovery",
  "../../build/get-static-info-including-layouts",
  "../../build/output",
  "../../build/output/log",
  "../../build/webpack-config",
  "../../lib/constants",
  "../../lib/recursive-delete",
  "../../shared/lib/constants",
  "../lib/find-page-file",
  "./on-demand-entry-handler",
  "../../shared/lib/page-path/denormalize-page-path",
  "../../shared/lib/page-path/normalize-path-sep",
  "../get-route-from-entrypoint",
  "../../build/utils",
  "../../shared/lib/utils",
  "../../trace",
  "../../lib/is-error",
  "next/dist/compiled/ws",
  "fs",
  "../../lib/is-api-route",
  "../../build/webpack/loaders/next-route-loader",
  "../../lib/is-internal-component",
  "../route-kind",
  "./hot-reloader-types",
  "../../lib/page-types",
  "./messages",
  "../../next-devtools/server/get-next-error-feedback-middleware",
  "../../next-devtools/server/font/get-dev-overlay-font-middleware",
  "../../next-devtools/server/dev-indicator-middleware",
  "../../shared/lib/get-webpack-bundler",
  "../../next-devtools/server/restart-dev-server-middleware",
  "../../build/webpack/cache-invalidation",
  "./browser-logs/receive-logs",
  "../../next-devtools/server/devtools-config-middleware",
  "../../next-devtools/server/attach-nodejs-debugger-middleware",
  "../../shared/lib/invariant-error",
  "./debug-channel",
  "./hot-reloader-shared-utils",
  "../mcp/get-mcp-middleware",
  "../mcp/tools/utils/format-errors",
  "../mcp/mcp-telemetry-tracker",
  "./browser-logs/file-logger",
  "./serialized-errors"
];

const basePath = path.resolve(__dirname, '../node_modules/next/dist/server/dev');

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

console.log('All requires completed successfully!');
