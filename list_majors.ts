import * as xlsx from 'xlsx';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx');
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets['3. PL full'];
const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

const majors = new Set<string>();
for (let r = 0; r < data.length; r++) {
  const c1 = String(data[r][0] || '').trim();
  if (/^PHỤ LỤC\s+[IVXLCDM]+\.\s+/i.test(c1)) {
    majors.add(c1);
  }
}

console.log('ALL MAJOR PROGRAMS FOUND:');
majors.forEach(m => console.log(' -> ' + m));
