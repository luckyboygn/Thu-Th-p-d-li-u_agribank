import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
const sheet = wb.Sheets['Sheet1'];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

console.log('Total rows in Sheet1:', rows.length);
rows.forEach((r, idx) => {
  console.log(`${idx + 1}: ${JSON.stringify(r)}`);
});
