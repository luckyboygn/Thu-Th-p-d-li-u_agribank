import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

export interface BackupResult {
  success: boolean;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  sizeMB: string;
  createdAt: string;
}

export interface BackupFileInfo {
  fileName: string;
  sizeBytes: number;
  sizeMB: string;
  createdAt: string;
}

const MAX_BACKUPS = 14;

export function getDbPath(): string {
  return path.join(process.cwd(), 'data', 'database.sqlite');
}

export function getBackupDir(): string {
  return path.join(process.cwd(), 'backups');
}

export function formatBackupTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}

/**
 * Tự động xoay vòng dọn dẹp các bản sao lưu cũ, giữ lại tối đa N bản mới nhất (mặc định 14 bản)
 */
export function rotateBackups(maxKeep = MAX_BACKUPS): void {
  const backupDir = getBackupDir();
  try {
    if (!fs.existsSync(backupDir)) return;

    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return { name: f, path: filePath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxKeep) {
      const filesToDelete = files.slice(maxKeep);
      for (const item of filesToDelete) {
        try {
          fs.unlinkSync(item.path);
          console.log(`[Xoay vòng] Đã xóa bản sao lưu cũ: ${item.name}`);
        } catch (e: any) {
          console.warn(`[Xoay vòng] Không thể xóa file ${item.name}:`, e.message);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Xoay vòng cảnh báo] Lỗi khi dọn dẹp bản backup cũ: ${err.message}`);
  }
}

/**
 * Lấy danh sách toàn bộ các bản sao lưu hiện có
 */
export function listDatabaseBackups(): BackupFileInfo[] {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    return [];
  }

  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
    .map(f => {
      const filePath = path.join(backupDir, f);
      const stats = fs.statSync(filePath);
      return {
        fileName: f,
        sizeBytes: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Tạo bản sao lưu CSDL chuẩn SQLite WAL bằng lệnh VACUUM INTO
 */
export function createDatabaseBackup(): BackupResult {
  const dbPath = getDbPath();
  const backupDir = getBackupDir();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Không tìm thấy file cơ sở dữ liệu tại ${dbPath}`);
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = formatBackupTimestamp();
  const backupFileName = `database_${timestamp}.sqlite`;
  const backupFilePath = path.join(backupDir, backupFileName);

  console.log(`[Backup Service] Bắt đầu sao lưu CSDL vào: ${backupFilePath}`);

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath);
    const escapedPath = backupFilePath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);
    console.log(`[Backup Service] Đã tạo file sao lưu thành công.`);
  } catch (err: any) {
    throw new Error(`Lỗi khi thực thi lệnh VACUUM INTO: ${err.message}`);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }

  // Kiểm tra tính toàn vẹn của file sao lưu bằng PRAGMA integrity_check
  let backupDb: DatabaseSync | null = null;
  try {
    backupDb = new DatabaseSync(backupFilePath, { readOnly: true });
    const integrityResult = backupDb.prepare('PRAGMA integrity_check').all() as any[];
    const isOk = integrityResult.length === 1 && integrityResult[0]?.integrity_check === 'ok';

    if (!isOk) {
      // Nếu file bị lỗi, dọn dẹp file hỏng
      try {
        fs.unlinkSync(backupFilePath);
      } catch {}
      throw new Error(`File sao lưu không vượt qua PRAGMA integrity_check! Kết quả: ${JSON.stringify(integrityResult)}`);
    }
    console.log(`[Backup Service] Kiểm tra toàn vẹn PRAGMA integrity_check: HOÀN HẢO (ok).`);
  } catch (err: any) {
    throw new Error(`Lỗi kiểm tra tính toàn vẹn bản sao lưu: ${err.message}`);
  } finally {
    if (backupDb) {
      try {
        backupDb.close();
      } catch {}
    }
  }

  // Xoay vòng bản backup cũ
  rotateBackups(MAX_BACKUPS);

  const stats = fs.statSync(backupFilePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const createdAt = new Date().toISOString();

  console.log(`[Backup Service Hoàn tất] Tên: ${backupFileName} | Dung lượng: ${sizeMB} MB | Thời gian: ${createdAt}`);

  return {
    success: true,
    fileName: backupFileName,
    filePath: backupFilePath,
    sizeBytes: stats.size,
    sizeMB,
    createdAt
  };
}
