import * as xlsx from 'xlsx';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx');
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets['3. PL full'];
const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

let inPl3 = false;
const pl3Rows: any[] = [];

for (let r = 0; r < data.length; r++) {
  const c1 = String(data[r][0] || '').trim();
  if (c1.includes('PHỤ LỤC III.')) {
    inPl3 = true;
  } else if (c1.includes('PHỤ LỤC IV.')) {
    inPl3 = false;
  }

  if (inPl3) {
    pl3Rows.push({ rowIdx: r + 1, data: data[r] });
  }
}

console.log(`Số dòng trong Phụ lục III (Chi nhánh): ${pl3Rows.length}`);
const pl3Headers = pl3Rows.filter(r => String(r.data[0]).toUpperCase().includes('PHỤ LỤC') || String(r.data[0]).toUpperCase().includes('KHUNG'));
console.log('Các tiêu đề phân mục trong Phụ lục III:');
pl3Headers.forEach(h => console.log(`  Row ${h.rowIdx}: ${h.data[0]}`));

const pl3Positions = new Set<string>();
pl3Rows.forEach(r => {
  const c1 = String(r.data[0] || '').trim();
  const c2 = String(r.data[1] || '').trim();
  if (/^\d+$/.test(c1) && c2) {
    pl3Positions.add(c2);
  }
});

console.log('\nCác Vị trí chức danh trong Phụ lục III (Chi nhánh):');
console.log(Array.from(pl3Positions).join(', '));
