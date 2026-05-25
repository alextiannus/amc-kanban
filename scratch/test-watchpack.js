const Watchpack = require('next/dist/compiled/watchpack');
const path = require('path');

const dir = path.resolve(__dirname, '..');
const appDir = path.join(dir, 'src/app');

console.log('Project directory:', dir);
console.log('App directory:', appDir);

const files = [
  path.join(dir, '.env'),
  path.join(dir, 'tsconfig.json')
];
const directories = [appDir];

const wp = new Watchpack({
  aggregateTimeout: 5,
  ignored: (pathname) => {
    const isIgnored = !files.some((file) => file.startsWith(pathname)) && 
                      !directories.some((d) => pathname.startsWith(d) || d.startsWith(pathname));
    // console.log(`Checking ignored for ${pathname}: ${isIgnored}`);
    return isIgnored;
  }
});

wp.on('aggregated', () => {
  console.log('Watchpack aggregated event fired successfully!');
  process.exit(0);
});

console.log('Starting watch...');
wp.watch({
  directories: [dir],
  startTime: 0
});

setTimeout(() => {
  console.log('Timeout: Aggregated event did not fire within 8 seconds.');
  process.exit(1);
}, 8000);
