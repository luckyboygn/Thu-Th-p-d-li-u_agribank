import * as xlsx from 'xlsx';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx');
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets['3. PL full'];
const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('Total rows:', data.length);

// 1. Quét dòng header (row 4)
const headers = data[3].map((c: any) => String(c).trim().replace(/\r?\n/g, ' '));
console.log('Headers (Row 4):', headers);

// 2. Thống kê các dòng chuyên đề
interface ParsedTopic {
  rowIndex: number;
  stt: string;
  positionRaw: string;
  topicName: string;
  deliveryMethod: string;
  duration: string;
  learningPath: string;
  competency: string;
  prerequisite: string;
  certificateRequirement: string;
}

const topics: ParsedTopic[] = [];
const positionSet = new Set<string>();
const topicNameSet = new Set<string>();
const positionToTopicsMap = new Map<string, Set<string>>();
const topicToPositionsMap = new Map<string, Set<string>>();

for (let r = 4; r < data.length; r++) {
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

  if (/^\d+$/.test(c1) && c3) {
    topics.push({
      rowIndex: r + 1,
      stt: c1,
      positionRaw: c2,
      topicName: c3,
      deliveryMethod: c4,
      duration: c5,
      learningPath: c6,
      competency: c7,
      prerequisite: c8,
      certificateRequirement: c9
    });

    if (c2) {
      // Vị trí có thể chứa nhiều mã phân tách bởi dấu phẩy hoặc xuống dòng
      const splittedPositions = c2.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
      splittedPositions.forEach(pos => {
        positionSet.add(pos);
        if (!positionToTopicsMap.has(pos)) positionToTopicsMap.set(pos, new Set());
        positionToTopicsMap.get(pos)!.add(c3);

        if (!topicToPositionsMap.has(c3)) topicToPositionsMap.set(c3, new Set());
        topicToPositionsMap.get(c3)!.add(pos);
      });
    }

    topicNameSet.add(c3);
  }
}

console.log(`\n=== TỔNG HỢP PHÂN TÍCH ===`);
console.log(`- Tổng số dòng chuyên đề (STT số): ${topics.length}`);
console.log(`- Số lượng tên chuyên đề DUY NHẤT: ${topicNameSet.size}`);
console.log(`- Số lượng vị trí/chức danh DUY NHẤT: ${positionSet.size}`);

// Kiểm tra quan hệ N-N
let topicsWithMultiplePositions = 0;
let maxPositionsForOneTopic = 0;
let sampleMultiTopic = '';

for (const [tName, posList] of topicToPositionsMap.entries()) {
  if (posList.size > 1) {
    topicsWithMultiplePositions++;
    if (posList.size > maxPositionsForOneTopic) {
      maxPositionsForOneTopic = posList.size;
      sampleMultiTopic = tName;
    }
  }
}

console.log(`- Số chuyên đề xuất hiện ở > 1 vị trí: ${topicsWithMultiplePositions} / ${topicNameSet.size}`);
console.log(`  -> KẾT LUẬN QUAN HỆ: QUAN HỆ NHIỀU - NHIỀU (Many-to-Many / N-N) GIỮA VỊ TRÍ VÀ CHUYÊN ĐỀ.`);
console.log(`  -> Ví dụ chuyên đề xuất hiện ở nhiều vị trí nhất: "${sampleMultiTopic}" (thuộc ${maxPositionsForOneTopic} vị trí)`);

// Thống kê phân bố số chuyên đề trên từng vị trí
const posArray = Array.from(positionSet).sort();
console.log(`\nDanh sách các vị trí chức danh nhận diện được (${posArray.length} vị trí):`);
console.log(posArray.slice(0, 30).join(', ') + '... (và ' + (posArray.length - 30) + ' vị trí khác)');

// Thống kê các cột giá trị
const methods = new Set<string>();
const durations = new Set<string>();
topics.forEach(t => {
  if (t.deliveryMethod) methods.add(t.deliveryMethod.replace(/\r?\n/g, ' '));
  if (t.duration) durations.add(t.duration.replace(/\r?\n/g, ' '));
});

console.log(`\nCác hình thức đào tạo (${methods.size}):`, Array.from(methods));
console.log(`Số lượng giá trị thời lượng khác nhau:`, durations.size);
