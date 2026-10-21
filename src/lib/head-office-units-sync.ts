import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

export interface HeadOfficeUnitDefinition {
  code: string;
  name: string;
  type: string;
  region: string;
}

export function getHeadOfficeUnits(): HeadOfficeUnitDefinition[] {
  const jsonPath = path.join(process.cwd(), 'src', 'lib', 'head-office-units.json');
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {}
  }
  return [];
}

let defaultPasswordHash: string | null = null;
function getPasswordHash(): string {
  if (!defaultPasswordHash) {
    defaultPasswordHash = bcrypt.hashSync('Unit@123456', 10);
  }
  return defaultPasswordHash;
}

/**
 * Kiểm tra và tự động đồng bộ 48 đơn vị/Ban/Trung tâm TSC kèm tài khoản admin
 * Đảm bảo CSDL luôn đủ 203 đơn vị kể cả sau khi sync từ Cloud
 */
export function ensureHeadOfficeUnitsSynced(db: DatabaseSync): boolean {
  try {
    const unitsList = getHeadOfficeUnits();
    if (!unitsList || unitsList.length === 0) return false;

    const existingUnits = db.prepare('SELECT id, unit_code FROM units').all() as any[];
    const existingCodes = new Map<string, number>();
    existingUnits.forEach(u => existingCodes.set(u.unit_code, u.id));

    const existingUsers = db.prepare('SELECT id, username FROM users').all() as any[];
    const existingUsernames = new Set(existingUsers.map(u => u.username));

    const insertUnitStmt = db.prepare(`
      INSERT INTO units (unit_code, unit_name, status, user_account, unit_type, region)
      VALUES (?, ?, 'ACTIVE', ?, ?, ?)
    `);

    const insertUserStmt = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, unit_id, status, token_version, must_change_password)
      VALUES (?, ?, ?, 'UNIT_ADMIN', ?, 'ACTIVE', 1, 0)
    `);

    let anyAdded = false;
    const pwdHash = getPasswordHash();

    for (const item of unitsList) {
      const username = `${item.code}_Admin`;
      let unitId = existingCodes.get(item.code);

      if (!unitId) {
        const res = insertUnitStmt.run(item.code, item.name, username, item.type, item.region);
        unitId = Number(res.lastInsertRowid);
        existingCodes.set(item.code, unitId);
        anyAdded = true;
      }

      if (!existingUsernames.has(username)) {
        insertUserStmt.run(username, pwdHash, item.name, unitId);
        existingUsernames.add(username);
        anyAdded = true;
      }
    }

    if (anyAdded) {
      console.log('[Head Office Sync] ✅ Đã đồng bộ bổ sung các đơn vị/tài khoản Ban Trụ sở chính còn thiếu vào CSDL.');
    }
    return anyAdded;
  } catch (err: any) {
    console.warn('[Head Office Sync] Cảnh báo kiểm tra đơn vị TSC:', err.message);
    return false;
  }
}
