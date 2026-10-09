const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function slice() {
  const input = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f/.user_uploaded/media_1791257030533.png';
  const outDir = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f';
  
  // Total height is 1024. Let's make 6 slices:
  // Header is around top 15-20 pixels.
  // Each slice ~ 170 pixels tall.
  const sliceHeight = 170;
  for (let i = 0; i < 6; i++) {
    const top = i * sliceHeight;
    const height = Math.min(sliceHeight, 1024 - top);
    const outFile = path.join(outDir, `slice_${i + 1}.png`);
    await sharp(input)
      .extract({ left: 0, top, width: 154, height })
      .resize(154 * 4, height * 4, { kernel: 'lanczos3' })
      .toFile(outFile);
    console.log(`Created slice_${i + 1}.png (top: ${top}, height: ${height})`);
  }
}

slice();
