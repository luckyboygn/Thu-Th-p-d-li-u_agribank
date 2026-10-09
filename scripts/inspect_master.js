const xlsx = require('xlsx');
const path = require('path');

const wb = xlsx.readFile(path.join(__dirname, '..', 'sample_data', 'master_users.xlsx'));
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws);

console.log('Master users sample count in this file:', rows.length);
console.log('Sample row:', rows[0]);
console.log('Sample 5 rows:', rows.slice(0, 5));
