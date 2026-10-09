import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

const units = db.prepare('SELECT id, unit_code, unit_name, user_account FROM units ORDER BY id ASC').all() as any[];
console.log('Total units in DB:', units.length);
console.log('First 10 units:', JSON.stringify(units.slice(0, 10), null, 2));
console.log('Last 10 units:', JSON.stringify(units.slice(-10), null, 2));

const users = db.prepare('SELECT id, username, role, unit_id, is_active FROM users ORDER BY id ASC').all() as any[];
console.log('Total users in DB:', users.length);
console.log('Admin users:', users.filter(u => u.role !== 'UNIT_ADMIN'));
console.log('Sample unit users:', JSON.stringify(users.filter(u => u.role === 'UNIT_ADMIN').slice(0, 5), null, 2));
