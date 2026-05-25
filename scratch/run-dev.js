const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'dev.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

logStream.write(`\n--- Starting Dev Server at ${new Date().toISOString()} ---\n`);

const child = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', '3000'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, FORCE_COLOR: '1' }
});

child.stdout.pipe(logStream);
child.stderr.pipe(logStream);

child.on('close', (code) => {
  logStream.write(`\n--- Process exited with code ${code} ---\n`);
});

console.log('Dev server spawned, logging to scratch/dev.log');
