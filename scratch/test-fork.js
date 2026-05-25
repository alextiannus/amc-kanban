const { fork } = require('child_process');
const path = require('path');

console.log('Parent: Forking child process...');
const child = fork(path.resolve(__dirname, 'trace-turbopack-require.js'));

child.on('message', (msg) => {
  console.log('Parent received message:', msg);
});

child.on('exit', (code) => {
  console.log(`Parent: Child exited with code ${code}`);
});

setTimeout(() => {
  console.log('Parent: 10 seconds passed, exiting.');
  process.exit(0);
}, 10000);
