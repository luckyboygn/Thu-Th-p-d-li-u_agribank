import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('Employees schema:', db.prepare('PRAGMA table_info(employees)').all());
console.log('Sample employees:', db.prepare('SELECT * FROM employees LIMIT 5').all());
