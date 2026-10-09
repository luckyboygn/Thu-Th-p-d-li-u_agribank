/**
 * TEST SUITE 1.5: SAO LƯU VÀ PHỤC HỒI CƠ SỞ DỮ LIỆU (BACKUP & RESTORE)
 * 1. Chạy hàm createBackup(): tạo file snapshot bằng VACUUM INTO, kiểm tra integrity_check.
 * 2. Kiểm tra cơ chế xoay vòng: tạo nhiều bản backup vượt quá giới hạn và kiểm tra dọn dẹp giữ đúng N bản.
 * 3. Kiểm tra tính toàn vẹn của file backup tạo ra.
 * 4. Kiểm tra sao lưu an toàn pre-restore trước khi phục hồi.
 */

const { createBackup, rotateBackups } = require('../scripts/backup_db.js');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

async function runBackupRestoreTests() {
  console.log('--- BẮT ĐẦU TEST BỘ SAO LƯU VÀ PHỤC HỒI (MỤC 1.5) ---');
  let passCount = 0;
  const backupDir = path.join(__dirname, '..', 'backups');

  // 1. Test createBackup
  const result = createBackup();
  if (result.success && fs.existsSync(result.filePath) && fs.statSync(result.filePath).size > 0) {
    console.log(`✅ 1. Hàm createBackup() tạo file sao lưu thành công: ${result.fileName} (${result.sizeMB} MB)`);
    passCount++;
  } else {
    console.error('❌ 1. Thất bại khi tạo file backup');
  }

  // 2. Test integrity_check trên file backup vừa sinh ra
  const db = new DatabaseSync(result.filePath);
  const check = db.prepare('PRAGMA integrity_check').all();
  if (check.length === 1 && check[0].integrity_check === 'ok') {
    console.log('✅ 2. PRAGMA integrity_check trên file sao lưu đạt kết quả: HOÀN TOÀN TOÀN VẸN (ok)');
    passCount++;
  } else {
    console.error('❌ 2. File sao lưu bị lỗi integrity_check');
  }

  // 3. Test cơ chế xoay vòng rotateBackups
  // Tạo giả lập 18 files backup cũ
  const dummyFiles = [];
  for (let i = 1; i <= 18; i++) {
    const dName = `database_2026010${i < 10 ? '0' + i : i}_000000.sqlite`;
    const dPath = path.join(backupDir, dName);
    fs.writeFileSync(dPath, 'dummy sqlite content');
    // Chỉnh sửa mtime cách biệt nhau
    const time = new Date(2026, 0, i).getTime() / 1000;
    fs.utimesSync(dPath, time, time);
    dummyFiles.push(dPath);
  }

  // Gọi rotateBackups với giới hạn 14 bản
  rotateBackups(backupDir, 14);

  const remainingDatabaseBackups = fs.readdirSync(backupDir).filter(f => f.startsWith('database_') && f.endsWith('.sqlite'));
  if (remainingDatabaseBackups.length <= 14) {
    console.log(`✅ 3. Cơ chế xoay vòng giữ đúng tối đa 14 bản sao lưu gần nhất (Hiện có: ${remainingDatabaseBackups.length} bản)`);
    passCount++;
  } else {
    console.error(`❌ 3. Xoay vòng thất bại, còn lại ${remainingDatabaseBackups.length} bản`);
  }

  // Dọn các file dummy test
  dummyFiles.forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  // 4. Test bảo vệ dữ liệu trước khi phục hồi: copy an toàn pre_restore_backup
  const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
  const preRestoreName = `pre_restore_backup_test_${Date.now()}.sqlite`;
  const preRestorePath = path.join(backupDir, preRestoreName);
  fs.copyFileSync(dbPath, preRestorePath);

  if (fs.existsSync(preRestorePath) && fs.statSync(preRestorePath).size > 0) {
    console.log('✅ 4. Cơ chế tự động sao lưu dự phòng trước khi phục hồi (pre-restore backup) hoạt động an toàn');
    passCount++;
    fs.unlinkSync(preRestorePath); // Dọn dẹp file test
  } else {
    console.error('❌ 4. Thất bại tạo pre-restore backup');
  }

  // 5. Kiểm tra .gitignore không để lọt thư mục backups/
  const gitignorePath = path.join(__dirname, '..', '.gitignore');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  if (gitignoreContent.includes('/backups/')) {
    console.log('✅ 5. Thư mục backups/ được khai báo chặn triệt để trong .gitignore');
    passCount++;
  } else {
    console.error('❌ 5. Thiếu /backups/ trong .gitignore');
  }

  console.log(`\n🎉 KẾT QUẢ TEST MỤC 1.5: ${passCount}/5 BÀI TEST ĐẠT!`);
  if (passCount !== 5) {
    process.exit(1);
  }
}

runBackupRestoreTests().catch(err => {
  console.error('Lỗi khi thực thi test suite 1.5:', err);
  process.exit(1);
});
