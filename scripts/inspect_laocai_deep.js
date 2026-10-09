const xlsx = require('xlsx');
const path = require('path');

const wb = xlsx.readFile(path.join(__dirname, '..', 'sample_data', 'unit_submission_laocai.xlsx'));
const ws = wb.Sheets['Sheet1'];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('Total rows in Sheet1:', rows.length);
console.log('Header (Row 12):', JSON.stringify(rows[11]));

let dataRowsCount = 0;
let sectionRowsCount = 0;
let emptyRowsCount = 0;
let otherRows = [];

for (let i = 12; i < rows.length; i++) {
  const r = rows[i];
  const col0 = String(r[0] || '').trim();
  const maDonVi = String(r[1] || '').trim();
  const maCB = String(r[4] || '').trim();
  const hoTen = String(r[5] || '').trim();
  const eLearn = String(r[9] || '').trim();

  if (maCB && eLearn) {
    dataRowsCount++;
  } else if (!col0 && !maDonVi && !maCB && !hoTen) {
    emptyRowsCount++;
  } else {
    otherRows.push({ rowIdx: i + 1, content: r.filter(Boolean) });
  }
}

console.log('Data rows count (having maCB and eLearn):', dataRowsCount);
console.log('Empty rows:', emptyRowsCount);
console.log('Non-data/section/footer rows count:', otherRows.length);
console.log('Sample non-data rows:');
console.log(otherRows.slice(0, 10));
console.log('Last 5 rows in sheet:');
for (let i = Math.max(0, rows.length - 5); i < rows.length; i++) {
  console.log(`Row ${i + 1}:`, rows[i].filter(Boolean));
}
