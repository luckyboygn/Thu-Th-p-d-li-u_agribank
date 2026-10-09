import { DatabaseSync } from 'node:sqlite';
import * as xlsx from 'xlsx';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
const sheet1 = wb.Sheets['Sheet1'];
const sheet1Rows = xlsx.utils.sheet_to_json(sheet1, { header: 1 }) as any[][];

const sheet1Codes = new Set(sheet1Rows.map(r => String(r[0]).trim()));
console.log('Total Sheet1 codes:', sheet1Codes.size);

const dbUnits = db.prepare('SELECT id, unit_code, unit_name, user_account FROM units ORDER BY id ASC').all() as any[];
console.log('Total DB units:', dbUnits.length);

const matchedInDb = dbUnits.filter(u => sheet1Codes.has(u.unit_code));
console.log('Units in DB that match Sheet1 codes:', matchedInDb.length);

const missingInDb = Array.from(sheet1Codes).filter(code => !dbUnits.some(u => u.unit_code === code));
console.log('Codes in Sheet1 but NOT in DB:', missingInDb);

const extraInDb = dbUnits.filter(u => !sheet1Codes.has(u.unit_code));
console.log('Units in DB that are EXTRA (not in Sheet1):', extraInDb.length);
console.log('Sample extra units:', extraInDb.slice(0, 10).map(u => `${u.unit_code}: ${u.unit_name}`));
