import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('Units schema:', db.prepare('PRAGMA table_info(units)').all());
console.log('Users schema:', db.prepare('PRAGMA table_info(users)').all());

const allUnits = db.prepare('SELECT id, unit_code, unit_name, user_account FROM units').all() as any[];
console.log('Total units count:', allUnits.length);

const unitsMap = new Map();
allUnits.forEach(u => unitsMap.set(u.unit_code, u));

console.log('Does 1500 exist?', unitsMap.get('1500'));
console.log('Does 2601 exist?', unitsMap.get('2601'));
console.log('Does 8000 exist?', unitsMap.get('8000'));
console.log('Does 1300 exist?', unitsMap.get('1300'));
console.log('Does 2201 exist?', unitsMap.get('2201'));
