import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const iconsDir = join(projectRoot, 'public', 'icons');

// Read the SVG logo
const svgPath = join(projectRoot, 'public', 'amc-dashboard-logo.svg');
const svgContent = readFileSync(svgPath, 'utf8');

// Convert SVG Buffer
const svgBuffer = Buffer.from(svgContent);

async function generateIcons() {
  console.log('Generating PWA icons from amc-dashboard-logo.svg...');
  
  // Generate 192x192
  await sharp(svgBuffer, { density: 300 })
    .resize(192, 192)
    .png()
    .toFile(join(iconsDir, 'icon-192.png'));
  console.log('✅ Generated icon-192.png (192x192)');

  // Generate 512x512 (standard)
  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(join(iconsDir, 'icon-512.png'));
  console.log('✅ Generated icon-512.png (512x512)');

  // Generate 512x512 (maskable) - same image, iOS/Android will apply mask
  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(join(iconsDir, 'icon-512-maskable.png'));
  console.log('✅ Generated icon-512-maskable.png (512x512 maskable)');

  // Also generate Apple Touch Icon (180x180) for iOS Safari
  await sharp(svgBuffer, { density: 300 })
    .resize(180, 180)
    .png()
    .toFile(join(projectRoot, 'public', 'apple-touch-icon.png'));
  console.log('✅ Generated apple-touch-icon.png (180x180) for iOS Safari');

  console.log('\n🎉 All icons generated! Remember to:');
  console.log('   1. Deploy the updated app');
  console.log('   2. On iPhone: Remove the old PWA from home screen');
  console.log('   3. Open Safari, visit the site, and re-add to home screen');
}

generateIcons().catch(console.error);
