const path = require('path');
const nextDev = require('next/dist/cli/next-dev.js').nextDev;

console.log('Calling nextDev...');
nextDev({
  port: 3000,
  hostname: '0.0.0.0',
  turbo: true,
}, 'default', path.resolve(__dirname, '..'));

console.log('nextDev called!');
