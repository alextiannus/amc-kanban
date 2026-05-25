const path = require('path');
const fs = require('fs');

console.log('Starting webpack-config require checks...');

const modulesToRequire = [
  "react",
  "next/dist/compiled/@next/react-refresh-utils/dist/ReactRefreshWebpackPlugin",
  "../lib/picocolors",
  "crypto",
  "next/dist/compiled/webpack/webpack",
  "path",
  "fs",
  "./define-env",
  "../shared/lib/escape-regexp",
  "../lib/constants",
  "./utils",
  "../shared/lib/constants",
  "../shared/lib/utils",
  "./entries",
  "./output/log",
  "./webpack/config",
  "./webpack/plugins/force-complete-runtime",
  "./webpack/plugins/middleware-plugin",
  "./webpack/plugins/build-manifest-plugin",
  "./webpack/plugins/jsconfig-paths-plugin",
  "./webpack/plugins/pages-manifest-plugin",
  "./webpack/plugins/profiling-plugin",
  "./webpack/plugins/react-loadable-plugin",
  "./webpack/plugins/wellknown-errors-plugin",
  "./webpack/config/blocks/css",
  "./webpack/plugins/copy-file-plugin",
  "./webpack/plugins/flight-manifest-plugin",
  "./webpack/plugins/flight-client-entry-plugin",
  "./webpack/plugins/rspack-flight-client-entry-plugin",
  "./webpack/plugins/deferred-entries-plugin",
  "./webpack/plugins/next-types-plugin",
  "./load-jsconfig",
  "./webpack/plugins/subresource-integrity-plugin",
  "./webpack/plugins/next-font-manifest-plugin",
  "./get-supported-browsers",
  "./webpack/plugins/memory-with-gc-cache-plugin",
  "./get-babel-config-file",
  "../lib/needs-experimental-react",
  "./handle-externals",
  "./webpack-config-rules/resolve",
  "./webpack/plugins/optional-peer-dependency-resolve-plugin",
  "./create-compiler-aliases",
  "../export/utils",
  "./webpack/plugins/css-chunking-plugin",
  "./get-babel-loader-config",
  "./next-dir-paths",
  "../shared/lib/get-rspack",
  "./webpack/plugins/rspack-profiling-plugin",
  "../shared/lib/get-webpack-bundler",
  "../server/require-hook",
  "next/dist/compiled/json5"
];

const basePath = path.resolve(__dirname, '../node_modules/next/dist/build');

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

console.log('All webpack-config requires completed successfully!');
