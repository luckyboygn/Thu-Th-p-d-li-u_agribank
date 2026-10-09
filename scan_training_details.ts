import * as xlsx from 'xlsx';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx');
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets['3. PL full'];
const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('=== PHÂN TÍCH TIÊU ĐỀ SECTION, CHƯƠNG TRÌNH, VỊ TRÍ ===');

const sectionRows: Array<{ rowIdx: number; text: string }> = [];
const positions = new Set<string>();
const forms = new Set<string>();
const competencies = new Set<string>();

let topicCount = 0;

for (let r = 0; r < data.length; r++) {
  const row = data[r];
  const c1 = String(row[0] || '').trim();
  const c2 = String(row[1] || '').trim();
  const c3 = String(row[2] || '').trim();
  const c4 = String(row[3] || '').trim();
  const c5 = String(row[4] || '').trim();
  const c6 = String(row[5] || '').trim();
  const c7 = String(row[6] || '').trim();
  const c8 = String(row[7] || '').trim();
  const c9 = String(row[8] || '').trim();

  // Kiểm tra dòng tiêu đề Section / Phụ lục / Khung chương trình
  if (c1.toUpperCase().includes('PHỤ LỤC') || c1.toUpperCase().includes('KHUNG CHƯƠNG TRÌNH')) {
    sectionRows.push({ rowIdx: r + 1, text: c1 });
  }

  // Nếu c1 là số thứ tự (STT) và có c3 (Tên chuyên đề)
  const isStt = /^\d+$/.test(c1);
  if (isStt && c3) {
    topicCount++;
    if (c2) positions.add(c2);
    if (c4) forms.add(c4);
    if (c7) competencies.add(c7);
  }
}

console.log(`\nTổng số chuyên đề hợp lệ (dòng có STT số & Tên chuyên đề): ${topicCount}`);
console.log(`\nCác Section / Chương trình nhận diện được (${sectionRows.length} mục):`);
sectionRows.forEach(s => console.log(`  Row ${s.rowIdx}: ${s.text}`));

console.log(`\nCác Vị trí / chức danh viết tắt trong C2 (${positions.size} vị trí):`);
console.log(Array.from(positions).join(', '));

console.log(`\nCác Hình thức đào tạo trong C4:`);
console.log(Array.from(forms).join(', '));

console.log(`\nCác Loại Năng lực trong C7:`);
console.log(Array.from(competencies).join(', '));

// In thử 5 chuyên đề mẫu với đầy đủ 9 cột
console.log('\n--- 5 DÒNG CHUYÊN ĐỀ MẪU ---');
let sampleCount = 0;
for (let r = 0; r < data.length && sampleCount < 5; r++) {
  const row = data[r];
  const c1 = String(row[0] || '').trim();
  if (/^\d+$/.test(c1)) {
    sampleCount++;
    console.log({
      rowIdx: r + 1,
      stt: row[0],
      position: row[1],
      topicName: row[2],
      deliveryMethod: row[3],
      duration: row[4],
      learningPath: row[5],
      competency: row[6],
      prerequisite: row[7],
      certificateRequirement: row[8]
    });
  }
}
