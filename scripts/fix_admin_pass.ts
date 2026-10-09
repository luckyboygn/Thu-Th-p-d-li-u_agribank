import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

const db = new DatabaseSync('data/database.sqlite');
const adminHash = bcrypt.hashSync('Admin@123456', 10);
const viewerHash = bcrypt.hashSync('Viewer@123456', 10);

db.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(adminHash);
db.prepare("UPDATE users SET password_hash = ? WHERE username = 'viewer'").run(viewerHash);

console.log('Updated admin and viewer password hashes!');
