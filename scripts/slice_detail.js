const sharp = require('sharp');
const path = require('path');

async function sliceDetail() {
  const input = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f/.user_uploaded/media_1791257030533.png';
  const outDir = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f';

  // Let's slice rows 45 to 75 (top: 280 to 480)
  await sharp(input)
    .extract({ left: 0, top: 280, width: 154, height: 200 })
    .resize(154 * 4, 200 * 4, { kernel: 'lanczos3' })
    .toFile(path.join(outDir, 'slice_detail_45_75.png'));

  // Let's slice rows 100 to 130 (top: 650 to 850)
  await sharp(input)
    .extract({ left: 0, top: 650, width: 154, height: 200 })
    .resize(154 * 4, 200 * 4, { kernel: 'lanczos3' })
    .toFile(path.join(outDir, 'slice_detail_100_130.png'));
}

sliceDetail();
