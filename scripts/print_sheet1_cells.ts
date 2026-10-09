import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
const sheet = wb.Sheets['Sheet1'];
console.log('Sheet keys:');
for (let r = 1; r <= 157; r++) {
  const rowVals: any = {};
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
    const cell = sheet[`${col}${r}`];
    if (cell && cell.v !== undefined) {
      rowVals[col] = cell.v;
    }
  });
  if (Object.keys(rowVals).length > 0) {
    console.log(`Row ${r}:`, JSON.stringify(rowVals));
  }
}
