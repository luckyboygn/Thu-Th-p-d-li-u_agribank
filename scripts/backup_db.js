/**
 * SCRIPT SAO LƯU CƠ SỞ DỮ LIỆU CHUẨN AGRIBANK (MỤC 1.5)
 * - Sử dụng SQLite VACUUM INTO (an toàn tuyệt đối với WAL mode đang chạy song song)
 * - Đặt tên file: database_YYYYMMDD_HHmmss.sqlite trong thư mục backups/
 * - Kiểm tra tính toàn vẹn bằng PRAGMA integrity_check
 * - Tự động xoay vòng giữ lại tối đa N bản sao lưu gần nhất (mặc định 14 bản)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'database.sqlite');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 14;

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}

function rotateBackups(backupDir, maxKeep = MAX_BACKUPS) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return { name: f, path: filePath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // mới nhất lên đầu

    if (files.length > maxKeep) {
      const filesToDelete = files.slice(maxKeep);
      for (const item of filesToDelete) {
        fs.unlinkSync(item.path);
        console.log(`[Xoay vòng] Đã xóa bản sao lưu cũ: ${item.name}`);
      }
    }
  } catch (err) {
    console.warn(`[Xoay vòng cảnh báo] Lỗi khi dọn dẹp bản backup cũ: ${err.message}`);
  }
}

function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[Lỗi] Không tìm thấy file cơ sở dữ liệu tại ${DB_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = formatTimestamp();
  const backupFileName = `database_${timestamp}.sqlite`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  console.log(`[Backup] Bắt đầu sao lưu CSDL vào: ${backupFilePath}`);

  let db = null;
  try {
    db = new DatabaseSync(DB_PATH);
    const escapedPath = backupFilePath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);
    console.log(`[Backup] Đã tạo file sao lưu thành công.`);

    // Kiểm tra tính toàn vẹn của file sao lưu
    const backupDb = new DatabaseSync(backupFilePath);
    const integrityResult = backupDb.prepare('PRAGMA integrity_check').all();
    const isOk = integrityResult.length === 1 && integrityResult[0].integrity_check === 'ok';

    if (!isOk) {
      console.error(`[Lỗi nghiêm trọng] File sao lưu không vượt qua PRAGMA integrity_check!`, integrityResult);
      fs.unlinkSync(backupFilePath);
      process.exit(1);
    }
    console.log(`[Backup] Kiểm tra toàn vẹn PRAGMA integrity_check: HOÀN HẢO (ok).`);

    // Xoay vòng bản backup
    rotateBackups(BACKUP_DIR, MAX_BACKUPS);

    const stats = fs.statSync(backupFilePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[Backup hoàn tất] Tên: ${backupFileName} | Dung lượng: ${sizeMB} MB | Thời gian: ${new Date().toISOString()}`);

    return {
      success: true,
      fileName: backupFileName,
      filePath: backupFilePath,
      sizeBytes: stats.size,
      sizeMB,
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[Lỗi sao lưu] ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  createBackup();
}

module.exports = { createBackup, rotateBackups, formatTimestamp };
