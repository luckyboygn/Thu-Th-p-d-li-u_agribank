import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// 1. Doc file vai tro ca nhan
const desktopFiles = fs.readdirSync('C:\\Users\\NGOCNGUYEN\\Desktop');
const roleFile = desktopFiles.find(f => f.includes('Vai tr') || f.includes('vai tr'))!;
const roleWb = xlsx.readFile(path.join('C:\\Users\\NGOCNGUYEN\\Desktop', roleFile));
const roleData = xlsx.utils.sheet_to_json<any>(roleWb.Sheets[roleWb.SheetNames[0]]);

const roleMap = new Map<string, string>();
roleData.forEach(r => {
  const code = String(r['Tên'] || '').trim();
  const desc = String(r['Mô tả vai trò'] || '').trim();
  if (code && desc) {
    roleMap.set(code, desc);
  }
});

console.log(`Đã nạp ${roleMap.size} vị trí chức danh từ file "Vai trò cá nhân.xlsx"`);

// 2. Doc file Phu luc danh muc dao tao
const catWb = xlsx.readFile(path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx'));
const catData = xlsx.utils.sheet_to_json<any[]>(catWb.Sheets['3. PL full'], { header: 1, defval: '' });

const usedPositions = new Set<string>();
catData.forEach(row => {
  const c1 = String(row[0] || '').trim();
  const c2 = String(row[1] || '').trim();
  const c3 = String(row[2] || '').trim();
  if (/^\d+$/.test(c1) && c3 && c2) {
    usedPositions.add(c2);
  }
});

console.log(`Số vị trí thực tế xuất hiện trong Phụ lục đào tạo: ${usedPositions.size}`);

// Kiem tra ty le match
let matched = 0;
let unmatched: string[] = [];

usedPositions.forEach(p => {
  if (roleMap.has(p)) {
    matched++;
  } else {
    unmatched.push(p);
  }
});

console.log(`Khớp được: ${matched}/${usedPositions.size} vị trí`);
console.log('Các vị trí chưa có trong từ điển (hoặc viết tắt đặc thù):', unmatched);
