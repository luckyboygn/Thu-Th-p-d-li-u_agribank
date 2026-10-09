const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

const units = db.prepare('SELECT id, unit_code, unit_name, user_account FROM units ORDER BY id ASC').all();
console.log('Total units in DB:', units.length);
console.log('First 10 units:', units.slice(0, 10));
console.log('Last 5 units:', units.slice(-5));
