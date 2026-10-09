import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('Exam uploads:');
console.log(db.prepare('SELECT id, unit_id, file_name, status FROM exam_uploads').all());

console.log('Training demand submissions:');
console.log(db.prepare('SELECT id, unit_id, status FROM training_demand_submissions').all());

console.log('Users (non-unit):');
console.log(db.prepare("SELECT id, username, role, full_name FROM users WHERE role != 'UNIT_ADMIN'").all());
