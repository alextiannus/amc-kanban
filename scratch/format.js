const fs = require('fs');
const path = require('path');

function walkAndFormat(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    const stat = fs.statSync(dir);
    if (stat.isDirectory()) {
      fs.readdirSync(dir).forEach(file => {
        walkAndFormat(path.join(dir, file));
      });
    } else if (path.basename(dir) === 'package.json') {
      try {
        const content = fs.readFileSync(dir, 'utf8');
        const json = JSON.parse(content);
        fs.writeFileSync(dir, JSON.stringify(json, null, 2) + '\n');
        console.log('Formatted:', dir);
      } catch (e) {
        console.error('Failed to format:', dir, e.message);
      }
    }
  } catch (e) {}
}

console.log('Starting targeted recursive formatting...');

const targets = [
  'node_modules/next/dist/compiled',
  'node_modules/@prisma',
  'node_modules/prisma',
  'node_modules/debug',
  'node_modules/@swc/helpers'
];

targets.forEach(t => {
  console.log('Scanning target:', t);
  walkAndFormat(t);
});

console.log('Done recursive formatting!');
