import * as xlsx from 'xlsx';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx');
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets['3. PL full'];
const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

let currentMajor = '';
let currentSub = '';
let totalTopics = 0;
const majorMap = new Map<string, { subPrograms: Map<string, number>; total: number }>();

for (let r = 0; r < data.length; r++) {
  const row = data[r];
  const c1 = String(row[0] || '').trim();
  const c2 = String(row[1] || '').trim();
  const c3 = String(row[2] || '').trim();

  // Kiểm tra dòng tiêu đề lớn (Major: PHỤ LỤC I., PHỤ LỤC II...)
  if (c1.toUpperCase().startsWith('PHỤ LỤC') && !c1.toUpperCase().includes('PHỤ LỤC I.') && !c1.toUpperCase().includes('PHỤ LỤC II.') && !c1.toUpperCase().includes('PHỤ LỤC III.') && !c1.toUpperCase().includes('PHỤ LỤC IV.')) {
    // Có thể là tiêu đề lớn
  }

  // Nhận diện dòng Major Program (PHỤ LỤC I. KHUNG CHƯƠNG TRÌNH...)
  if (/^PHỤ LỤC\s+[IVXLCDM]+\.\s+/i.test(c1)) {
    currentMajor = c1;
    if (!majorMap.has(currentMajor)) {
      majorMap.set(currentMajor, { subPrograms: new Map(), total: 0 });
    }
  } else if (/^PHỤ LỤC\s+[IVXLCDM]+\.\d+\.\s+/i.test(c1)) {
    // Sub Program (PHỤ LỤC I.1, I.2...)
    currentSub = c1;
    if (currentMajor && majorMap.has(currentMajor)) {
      if (!majorMap.get(currentMajor)!.subPrograms.has(currentSub)) {
        majorMap.get(currentMajor)!.subPrograms.set(currentSub, 0);
      }
    }
  }

  // Nếu là dòng chuyên đề
  if (/^\d+$/.test(c1) && c3) {
    totalTopics++;
    if (currentMajor && majorMap.has(currentMajor)) {
      majorMap.get(currentMajor)!.total++;
      if (currentSub && majorMap.get(currentMajor)!.subPrograms.has(currentSub)) {
        const cur = majorMap.get(currentMajor)!.subPrograms.get(currentSub)!;
        majorMap.get(currentMajor)!.subPrograms.set(currentSub, cur + 1);
      }
    }
  }
}

console.log(`\n=== TỔNG KẾT PHÂN CẤP CHƯƠNG TRÌNH TRONG FILE EXCEL ===`);
console.log(`Tổng số chuyên đề: ${totalTopics}`);

for (const [major, info] of majorMap.entries()) {
  console.log(`\n📂 [MAJOR PROGRAM]: ${major} (Tổng chuyên đề: ${info.total})`);
  for (const [sub, count] of info.subPrograms.entries()) {
    console.log(`    ├── [SUB PROGRAM]: ${sub} (${count} chuyên đề)`);
  }
}
