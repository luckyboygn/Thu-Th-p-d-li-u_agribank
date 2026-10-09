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

  console.log('🚀 Khởi chạy trình duyệt tự động chụp toàn bộ màn hình...');
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
    // 1. MÀN HÌNH ĐĂNG NHẬP
    console.log('--- 1. Màn hình Đăng nhập ---');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    await saveShot('01_Man_Hinh_Dang_Nhap.png');

    // 2. ĐĂNG NHẬP ADMIN VÀ MÀN HÌNH TỔNG QUAN ADMIN
    console.log('--- 2. Bảng điều khiển Quản trị viên (Super Admin) ---');
    await page.type('input[type="text"]', 'admin');
    await page.type('input[type="password"]', 'Admin@123456');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);
    await new Promise(r => setTimeout(r, 1500));
    await saveShot('02_Admin_Bang_Dieu_Khien_Tong_Quan.png');

    // 3. ADMIN MODAL: QUẢN LÝ KỲ THI
    console.log('--- 3. Modal Quản lý Kỳ thi & Cây phân cấp ---');
    const examButtons = await page.$$('button');
    for (const btn of examButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Quản lý Kỳ Thi')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    await saveShot('03_Admin_Quan_Ly_Ky_Thi.png');

    // Đóng Modal Quản lý kỳ thi
    const closeButtons = await page.$$('button');
    for (const btn of closeButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.trim() === 'Đóng') {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));

    // 4. ADMIN MODAL: DATABASE TRUNG TÂM
    console.log('--- 4. Modal Database Trung Tâm ---');
    const dbButtons = await page.$$('button');
    for (const btn of dbButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Database Trung Tâm')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    await saveShot('04_Admin_Database_Trung_Tam.png');

    // Đóng Modal Database
    const closeButtons2 = await page.$$('button');
    for (const btn of closeButtons2) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.trim() === 'Đóng') {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));

    // 5. ADMIN MODAL: AUDIT LOG
    console.log('--- 5. Modal Audit Log ---');
    const auditButtons = await page.$$('button');
    for (const btn of auditButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Audit Log')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    await saveShot('05_Admin_Nhat_Ky_Audit_Log.png');

    // Đóng Modal Audit
    const closeButtons3 = await page.$$('button');
    for (const btn of closeButtons3) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.trim() === 'Đóng') {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));

    // 6. ADMIN MODAL: ĐỔI MẬT KHẨU
    console.log('--- 6. Modal Đổi Mật Khẩu Admin ---');
    const changePassButtons = await page.$$('button');
    for (const btn of changePassButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Đổi mật khẩu')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 800));
    await saveShot('06_Admin_Doi_Mat_Khau.png');

    // Đóng Modal Đổi mật khẩu
    const cancelButtons = await page.$$('button');
    for (const btn of cancelButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.trim() === 'Hủy bỏ') {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));

    // 7. ĐĂNG NHẬP ĐƠN VỊ (3100_Admin - Chi nhánh Từ Liêm)
    console.log('--- 7. Đăng nhập Đơn vị (3100_Admin - Từ Liêm) ---');
    await page.goto('http://localhost:3000/api/auth/logout');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    await page.type('input[type="text"]', '3100_Admin');
    await page.type('input[type="password"]', 'Unit@123456');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);
    await new Promise(r => setTimeout(r, 1500));
    await saveShot('07_Don_Vi_Tu_Liem_Tong_Quan.png');

    // 8. ĐƠN VỊ MODAL: ĐỔI MẬT KHẨU
    console.log('--- 8. Modal Đổi Mật Khẩu Đơn Vị ---');
    const unitPassButtons = await page.$$('button');
    for (const btn of unitPassButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Đổi mật khẩu')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 800));
    await saveShot('08_Don_Vi_Doi_Mat_Khau.png');

    console.log('🎉 ĐÃ HOÀN TẤT CHỤP TẤT CẢ 8 MÀN HÌNH CHÍNH!');
  } catch (err) {
    console.error('❌ Lỗi khi chụp:', err);
  } finally {
    await browser.close();
  }
}

run();
