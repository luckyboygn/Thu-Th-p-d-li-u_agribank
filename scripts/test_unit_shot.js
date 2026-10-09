const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function test() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="text"]', '1300_Admin');
  await page.type('input[type="password"]', 'Unit@123456');
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle0' })
  ]);

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'screenshots/07_Don_Vi_Moi_Theo_Mockup.png' });
  console.log('✅ Chụp thành công giao diện mới của Đơn vị!');
  await browser.close();
}
test().catch(console.error);
