const Module = require('module');
const originalRequire = Module.prototype.require;

let depth = 0;
Module.prototype.require = function (id) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}Calling require(${id})`);
  depth++;
  try {
    const result = originalRequire.apply(this, arguments);
    depth--;
    return result;
  } catch (err) {
    depth--;
    console.log(`${indent}Failed require(${id}): ${err.message}`);
    throw err;
  }
};

console.log('Requiring next/dist/server/node-environment first...');
require('next/dist/server/node-environment');

console.log('Hooked require, now requiring hot-reloader-turbopack...');
require('next/dist/server/dev/hot-reloader-turbopack');
console.log('hot-reloader-turbopack required successfully!');
