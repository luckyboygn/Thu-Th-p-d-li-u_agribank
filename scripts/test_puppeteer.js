const puppeteer = require('puppeteer-core');
const os = require('os');
const path = require('path');

async function test() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tempDir = path.join(os.tmpdir(), 'puppeteer_edge_' + Date.now());

  console.log('Testing Edge launch...');
  try {
    const browser = await puppeteer.launch({
      executablePath: edgePath,
      headless: true,
      userDataDir: tempDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run'
      ]
    });
    console.log('Browser launched successfully!');
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/login');
    await page.screenshot({ path: 'login_test.png' });
    console.log('Screenshot taken!');
    await browser.close();
  } catch (e) {
    console.error('Launch error:', e);
  }
}

test();
