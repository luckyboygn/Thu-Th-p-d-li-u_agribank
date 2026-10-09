import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
const ws = wb.Sheets['Dự kiến máy tính'];
const data = xlsx.utils.sheet_to_json(ws, { header: 1 }) as any[][];

console.log('Total rows:', data.length);
data.slice(0, 50).forEach((r, idx) => {
  if (r && r.length > 0) {
    console.log(`${idx}:`, JSON.stringify(r.slice(0, 4)));
  }
});
