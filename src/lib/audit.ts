import { getDatabase } from './db';
import { UserSession } from './auth';

export interface AuditLogEntry {
  userId?: number | null;
  username?: string | null;
  unitId?: number | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | bigint | null;
  details?: Record<string, any> | string;
  ipAddress?: string | null;
}

export function logAudit(entry: AuditLogEntry) {
  try {
    const db = getDatabase();
    const detailsStr = typeof entry.details === 'object' ? JSON.stringify(entry.details) : (entry.details || null);
    
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, unit_id, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.userId || null,
      entry.username || 'SYSTEM',
      entry.unitId || null,
      entry.action,
      entry.entityType || null,
      entry.entityId ? String(entry.entityId) : null,
      detailsStr,
      entry.ipAddress || null
    );
  } catch (error) {
    console.error('Lỗi khi ghi audit log:', error);
  }
}
