import { getDatabase } from '../src/lib/db';
import * as path from 'path';
import * as fs from 'fs';

const db = getDatabase();
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const ts = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = path.resolve('backups', 'database_p5_' + ts + '.sqlite');
if (!fs.existsSync('backups')) fs.mkdirSync('backups');
db.prepare('VACUUM INTO ?').run(backupPath);
console.log('DB Backup created at:', backupPath);
