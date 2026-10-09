import * as xlsx from 'xlsx';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx');
const wb = xlsx.readFile(filePath);

console.log('=== WORKBOOK SHEET NAMES ===');
console.log(wb.SheetNames);

for (const sheetName of wb.SheetNames) {
  console.log(`\n========================================`);
  console.log(`SHEET: ${sheetName}`);
  console.log(`========================================`);
  const ws = wb.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`Total rows in sheet: ${data.length}`);
  
  // In 15 dong dau tien de phan tich cau truc tieu de va du lieu
  console.log('--- FIRST 15 ROWS ---');
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    const preview = row.map((c, idx) => `[C${idx + 1}]: ${String(c).trim()}`).filter(c => !c.endsWith(': ')).join(' | ');
    if (preview) {
      console.log(`Row ${i + 1}: ${preview}`);
    }
  }
}
