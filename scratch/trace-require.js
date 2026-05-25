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
    // console.log(`${indent}Success require(${id})`);
    return result;
  } catch (err) {
    depth--;
    console.log(`${indent}Failed require(${id}): ${err.message}`);
    throw err;
  }
};

console.log('Hooked require, now requiring webpack-config...');
require('next/dist/build/webpack-config');
console.log('webpack-config required successfully!');
