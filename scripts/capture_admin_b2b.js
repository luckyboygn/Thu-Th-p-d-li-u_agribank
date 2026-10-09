const puppeteer = require('puppeteer-core');
const os = require('os');
const path = require('path');
const fs = require('fs');

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outDir = path.join(__dirname, '..', 'screenshots');
  const artifactDir = 'C:\\Users\\NGOCNGUYEN\\.gemini\\antigravity\\brain\\7ac02a7b-1717-4f99-aa54-34e7ada4ae4f';
  const tempDir = path.join(os.tmpdir(), 'puppeteer_edge_' + Date.now());

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('🚀 Khởi chạy trình duyệt chụp các màn hình Admin B2B mới...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    userDataDir: tempDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const saveShot = async (filename, fullPage = false) => {
    const p1 = path.join(outDir, filename);
    const p2 = path.join(artifactDir, filename);
    await page.screenshot({ path: p1, fullPage });
    fs.copyFileSync(p1, p2);
    console.log(`📸 Đã lưu thành công: ${filename}`);
  };

  try {
    // Đăng nhập Admin
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 600));
    await page.type('input[type="text"]', 'admin');
    await page.type('input[type="password"]', 'Admin@123456');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);
    await new Promise(r => setTimeout(r, 1200));

    // 1. Màn hình B2B Admin Dashboard Tổng quan (Sidebar mở rộng)
    console.log('--- 1. B2B Admin Dashboard Tổng quan ---');
    await saveShot('02_Admin_Bang_Dieu_Khien_Tong_Quan.png');

    // 2. Mở Dropdown user ở góc phải Topbar
    console.log('--- 2. Topbar User Dropdown (Thông tin, Đổi mật khẩu, Đăng xuất) ---');
    const userBtn = await page.$('header button.flex.items-center.gap-2\\.5');
    if (userBtn) {
      await userBtn.click();
      await new Promise(r => setTimeout(r, 500));
      await saveShot('09_Admin_Topbar_User_Dropdown.png');
      // Click nút Đổi mật khẩu trong dropdown
      const dropdownBtns = await page.$$('header div.absolute button');
      for (const btn of dropdownBtns) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('Đổi mật khẩu')) {
          await btn.click();
          break;
        }
      }
      await new Promise(r => setTimeout(r, 500));
      await saveShot('06_Admin_Doi_Mat_Khau.png');
      // Đóng modal đổi mật khẩu
      const closePwBtn = await page.$('div.fixed button.text-slate-400');
      if (closePwBtn) await closePwBtn.click();
      await new Promise(r => setTimeout(r, 400));
    }

    // 3. Màn hình độc lập: Quản lý kỳ thi (/admin/exams)
    console.log('--- 3. Màn hình độc lập: Quản lý kỳ thi ---');
    await page.goto('http://localhost:3000/admin/exams', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    await saveShot('03_Admin_Quan_Ly_Ky_Thi.png');

    // 4. Màn hình độc lập: CSDL Trung tâm (/admin/master-db)
    console.log('--- 4. Màn hình độc lập: CSDL Trung tâm ---');
    await page.goto('http://localhost:3000/admin/master-db', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    await saveShot('04_Admin_Database_Trung_Tam.png');

    // 5. Màn hình độc lập: Nhật ký Audit Log (/admin/audit-log)
    console.log('--- 5. Màn hình độc lập: Nhật ký Audit Log ---');
    await page.goto('http://localhost:3000/admin/audit-log', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    await saveShot('05_Admin_Nhat_Ky_Audit_Log.png');

    // 6. Test Sidebar thu gọn (Collapse sidebar) trên màn hình Tổng quan
    console.log('--- 6. Thu gọn Sidebar (Collapsed Sidebar UX) ---');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    const menuToggleBtn = await page.$('header button[title="Thu gọn menu"]');
    if (menuToggleBtn) {
      await menuToggleBtn.click();
      await new Promise(r => setTimeout(r, 600));
      await saveShot('10_Admin_Dashboard_Sidebar_Collapsed.png');
    }

    console.log('✅ Hoàn tất xuất toàn bộ ảnh giao diện Admin B2B mới!');
  } catch (err) {
    console.error('❌ Lỗi:', err);
  } finally {
    await browser.close();
  }
}

run();
