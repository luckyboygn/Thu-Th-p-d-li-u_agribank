/**
 * SCRIPT PHỤC HỒI CƠ SỞ DỮ LIỆU CHUẨN AGRIBANK (MỤC 1.5)
 * - Chỉ chạy bằng dòng lệnh (CLI), có bước xác nhận bảo vệ dữ liệu.
 * - Cảnh báo dừng máy chủ trước khi phục hồi.
 * - Tự động sao lưu trạng thái hiện tại của database.sqlite trước khi ghi đè.
 * - Kiểm tra PRAGMA integrity_check sau khi phục hồi.
 */

const { DatabaseSync } = require('node:sqlite');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'database.sqlite');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function runRestore() {
  console.log('=================================================================');
  console.log('      CÔNG CỤ PHỤC HỒI CƠ SỞ DỮ LIỆU HỆ THỐNG AGRIBANK          ');
  console.log('=================================================================');
  console.log('⚠️  CẢNH BÁO QUAN TRỌNG:');
  console.log('1. Vui lòng TẠM DỪNG ứng dụng Web/Next.js trước khi phục hồi CSDL.');
  console.log('2. Dữ liệu hiện tại sẽ được tự động sao lưu dự phòng an toàn trước khi ghi đè.');
  console.log('-----------------------------------------------------------------');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`[Lỗi] Thư mục sao lưu ${BACKUP_DIR} không tồn tại.`);
    process.exit(1);
  }

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
    .sort().reverse();

  if (files.length === 0) {
    console.error('[Lỗi] Không tìm thấy bản sao lưu nào trong thư mục backups/.');
    process.exit(1);
  }

  // Cho phép truyền file qua đối số dòng lệnh: node scripts/restore_db.js <filename>
  let chosenFile = process.argv[2];

  if (!chosenFile) {
    console.log('\nDanh sách các bản sao lưu khả dụng:');
    files.forEach((f, idx) => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  [${idx + 1}] ${f} (${sizeMB} MB - ${stats.mtime.toLocaleString('vi-VN')})`);
    });

    const answer = await askQuestion('\nNhập số thứ tự bản sao lưu muốn phục hồi (hoặc "q" để hủy): ');
    if (answer.toLowerCase() === 'q') {
      console.log('Đã hủy thao tác phục hồi.');
      process.exit(0);
    }

    const selectedIndex = parseInt(answer) - 1;
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= files.length) {
      console.error('[Lỗi] Lựa chọn không hợp lệ.');
      process.exit(1);
    }
    chosenFile = files[selectedIndex];
  }

  const sourceBackupPath = path.join(BACKUP_DIR, chosenFile);
  if (!fs.existsSync(sourceBackupPath)) {
    console.error(`[Lỗi] Không tìm thấy file sao lưu: ${sourceBackupPath}`);
    process.exit(1);
  }

  console.log(`\nBạn đã chọn phục hồi từ: ${chosenFile}`);
  const confirm = await askQuestion('Bạn có CHẮC CHẮN muốn tiếp tục phục hồi? Thao tác này sẽ ghi đè CSDL hiện tại. (Nhập "YES" để xác nhận): ');
  if (confirm !== 'YES') {
    console.log('Xác nhận không khớp. Đã hủy phục hồi an toàn.');
    process.exit(0);
  }

  // 1. Sao lưu trạng thái hiện tại trước khi phục hồi
  if (fs.existsSync(DB_PATH)) {
    const preRestoreBackupName = `pre_restore_backup_${Date.now()}.sqlite`;
    const preRestorePath = path.join(BACKUP_DIR, preRestoreBackupName);
    console.log(`\n[Bảo vệ dữ liệu] Đang sao lưu CSDL hiện tại sang: ${preRestoreBackupName}...`);
    fs.copyFileSync(DB_PATH, preRestorePath);
    console.log(`[Bảo vệ dữ liệu] Đã sao lưu dự phòng thành công.`);
  }

  // 2. Xóa các file shm/wal nếu có
  const walPath = DB_PATH + '-wal';
  const shmPath = DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 3. Phục hồi tệp CSDL
  console.log(`[Phục hồi] Đang chép đè dữ liệu từ bản sao lưu...`);
  fs.copyFileSync(sourceBackupPath, DB_PATH);

  // 4. Kiểm tra tính toàn vẹn sau phục hồi
  console.log(`[Kiểm tra] Đang xác thực PRAGMA integrity_check...`);
  try {
    const db = new DatabaseSync(DB_PATH);
    const result = db.prepare('PRAGMA integrity_check').all();
    const isOk = result.length === 1 && result[0].integrity_check === 'ok';
    if (!isOk) {
      console.error('[Lỗi nghiêm trọng] CSDL sau phục hồi không hợp lệ!', result);
      process.exit(1);
    }
    console.log('✅ Phục hồi hoàn tất thành công 100%! CSDL đã sẵn sàng phục vụ.');
  } catch (err) {
    console.error(`[Lỗi kiểm tra toàn vẹn] ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runRestore().catch(err => {
    console.error('Lỗi khi thực thi script phục hồi:', err);
    process.exit(1);
  });
}

module.exports = { runRestore };
