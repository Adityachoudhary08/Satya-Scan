#!/usr/bin/env node
/**
 * scripts/generate-icons.cjs
 *
 * Generates Chrome Extension PNG icons at 4 required sizes.
 * Resizes the official brand logo (SatyaScan_logo_transparent.png) using Playwright.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SIZES = [16, 32, 48, 128];
const publicDir = path.resolve(__dirname, '..', 'public');
const outDir = path.join(publicDir, 'icons');
const sourcePath = path.join(publicDir, 'SatyaScan_logo_transparent.png');

(async () => {
  console.log('Generating extension icons from SatyaScan_logo_transparent.png using Playwright...\n');
  
  // Ensure output directory exists
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source logo not found at ${sourcePath}`);
    process.exit(1);
  }

  // Read original image as base64
  const imgBase64 = fs.readFileSync(sourcePath).toString('base64');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Load a simple page with a canvas
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <canvas id="canvas"></canvas>
      </body>
    </html>
  `);

  for (const size of SIZES) {
    const dataUrl = await page.evaluate(async ({ imgBase64, size }) => {
      const canvas = document.getElementById('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      ctx.clearRect(0, 0, size, size);
      
      const img = new Image();
      img.src = 'data:image/png;base64,' + imgBase64;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      // Draw image onto canvas (resizing it)
      ctx.drawImage(img, 0, 0, size, size);
      
      return canvas.toDataURL('image/png');
    }, { imgBase64, size });

    // Convert data URL to buffer and save
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const outPath = path.join(outDir, `icon${size}.png`);
    fs.writeFileSync(outPath, base64Data, 'base64');
    
    const stats = fs.statSync(outPath);
    console.log(`  ✓ icon${size}.png   (${size}×${size}px, ${stats.size} bytes)`);
  }

  await browser.close();
  console.log('\n✅ All icons written to public/icons/');
})().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
