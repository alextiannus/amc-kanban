const path = require('path');

console.log('Starting webpack/config sub-require checks...');

const modulesToRequire = [
  "./blocks/base",
  "./blocks/css",
  "./blocks/images",
  "./utils"
];

const basePath = path.resolve(__dirname, '../node_modules/next/dist/build/webpack/config');

for (const mod of modulesToRequire) {
  console.log(`Requiring: ${mod}...`);
  try {
    const resolvedPath = path.resolve(basePath, mod);
    require(resolvedPath);
    console.log(`Success: ${mod}`);
  } catch (err) {
    console.log(`Error requiring ${mod}:`, err.stack || err.message);
  }
}

console.log('All sub-requires completed!');
