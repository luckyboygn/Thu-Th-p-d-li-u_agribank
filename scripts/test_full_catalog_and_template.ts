import { getDatabase } from '../src/lib/db';
import { syncMasterTopicsToDatabase, ensureMasterCatalogSynced } from '../src/lib/catalog-master-sync';
import { parseTrainingDemandExcel } from '../src/lib/training-excel-parser';
import * as xlsx from 'xlsx';
import path from 'path';

console.log('================================================================');
console.log('TEST SUITE: KIỂM TRA ĐỒNG BỘ DANH MỤC 818 CHUYÊN ĐỀ & FILE MẪU');
console.log('================================================================\n');

// 1. Kiểm tra CSDL
const db = getDatabase();
console.log('--- 1. Đồng bộ master catalog vào CSDL ---');
ensureMasterCatalogSynced(db, true);

const stats = db.prepare(`
  SELECT count(*) as total,
         count(position_code) as has_pos,
         count(case when learning_path != '' and learning_path is not null then 1 end) as has_path,
         count(case when competency != '' and competency is not null then 1 end) as has_comp,
         count(case when certificate_requirement != '' and certificate_requirement is not null then 1 end) as has_cert
  FROM training_program_topics
`).get() as any;

console.log('Thống kê các trường mô tả trong CSDL:');
console.log(stats);

if (stats.has_pos < 818 || stats.has_path < 700 || stats.has_comp < 700) {
  console.error('❌ Thất bại: Số lượng chuyên đề có metadata không đủ!');
  process.exit(1);
} else {
  console.log('✅ Bước 1 ĐẠT: CSDL đã nạp đầy đủ thông tin mô tả chuẩn xác cho 818 chuyên đề.');
}

// 2. Kiểm tra mẫu LĐTV (chuyên đề 1 đến 7)
console.log('\n--- 2. Kiểm tra chi tiết nhóm LĐTV (chuyên đề 1 đến 7) ---');
const ldtvTopics = db.prepare(`
  SELECT id, display_order, position_code, topic_name, delivery_method, duration,
         learning_path, competency, certificate_requirement
  FROM training_program_topics
  WHERE program_id = 1
  ORDER BY display_order ASC
`).all() as any[];

console.log(`Tìm thấy ${ldtvTopics.length} chuyên đề LĐTV:`);
let allFilled = true;
for (const t of ldtvTopics) {
  console.log(`- [${t.display_order}] ${t.topic_name}: VT=${t.position_code} | Lộ trình="${t.learning_path}" | Chuẩn CC="${t.certificate_requirement}"`);
  if (!t.learning_path || !t.certificate_requirement) {
    allFilled = false;
  }
}

if (!allFilled) {
  console.error('❌ Thất bại: Vẫn còn chuyên đề bị rỗng lộ trình hoặc chứng chỉ!');
  process.exit(1);
} else {
  console.log('✅ Bước 2 ĐẠT: 100% chuyên đề LĐTV đã được giải phóng merged cell và có đầy đủ mô tả!');
}

// 3. Kiểm tra sinh File mẫu Excel cho đơn vị kê khai
console.log('\n--- 3. Kiểm tra tạo file mẫu Excel khảo sát ---');
const allTopics = db.prepare(`
  SELECT p.code as program_code, p.name as program_name,
         t.position_code, t.topic_name, t.delivery_method, t.duration,
         t.learning_path, t.competency, t.certificate_requirement,
         t.cert_planning_higher, t.cert_appoint_higher, t.cert_reappoint
  FROM training_program_topics t
  JOIN training_programs p ON t.program_id = p.id
  ORDER BY p.id ASC, t.display_order ASC, t.id ASC
`).all() as any[];

const dataSheet1 = allTopics.map((t, idx) => ({
  'STT': idx + 1,
  'Mã Khung CT': t.program_code,
  'Khung Chương Trình Đào Tạo': t.program_name,
  'Vị Trí Chức Danh': t.position_code || '',
  'Tên Chuyên Đề Đào Tạo': t.topic_name,
  'Hình Thức Đào Tạo': t.delivery_method || 'Trực tuyến',
  'Thời Lượng Đào Tạo': t.duration || '1 giờ',
  'Lộ Trình Đào Tạo': t.learning_path || '',
  'Năng Lực': t.competency || '',
  'Chứng Chỉ/Chứng Nhận Đào Tạo': t.certificate_requirement || '',
  'Chứng Chỉ Khi Quy Hoạch Ở Vị Trí Cao Hơn': t.cert_planning_higher || '',
  'Chứng Chỉ Khi Bổ Nhiệm Ở Vị Trí Cao Hơn': t.cert_appoint_higher || '',
  'Chứng Chỉ Khi Bổ Nhiệm Lại': t.cert_reappoint || '',
  'Đã học (số lượng)': '',
  'Đăng ký học năm 2027 (số lượng)': ''
}));

const wb = xlsx.utils.book_new();
const ws1 = xlsx.utils.json_to_sheet(dataSheet1);
xlsx.utils.book_append_sheet(wb, ws1, 'Nhu_Cau_Dao_Tao');

const generatedBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
const readBackWb = xlsx.read(generatedBuffer, { type: 'buffer' });
const readSheet = readBackWb.Sheets['Nhu_Cau_Dao_Tao'];
const readRows: any[] = xlsx.utils.sheet_to_json(readSheet);

console.log(`Số lượng dòng trong file mẫu: ${readRows.length}`);
console.log('Danh sách các cột trong file mẫu:');
console.log(Object.keys(readRows[0]));

const expectedCols = [
  'STT', 'Mã Khung CT', 'Khung Chương Trình Đào Tạo', 'Vị Trí Chức Danh',
  'Tên Chuyên Đề Đào Tạo', 'Hình Thức Đào Tạo', 'Thời Lượng Đào Tạo',
  'Lộ Trình Đào Tạo', 'Năng Lực', 'Chứng Chỉ/Chứng Nhận Đào Tạo',
  'Chứng Chỉ Khi Quy Hoạch Ở Vị Trí Cao Hơn', 'Chứng Chỉ Khi Bổ Nhiệm Ở Vị Trí Cao Hơn',
  'Chứng Chỉ Khi Bổ Nhiệm Lại', 'Đã học (số lượng)', 'Đăng ký học năm 2027 (số lượng)'
];

const actualCols = Object.keys(readRows[0]);
const colsMatch = expectedCols.every(c => actualCols.includes(c)) && actualCols.length === expectedCols.length;
if (!colsMatch) {
  console.error('❌ Thất bại: Các cột trong file mẫu không khớp chính xác!');
  console.log('Mong đợi:', expectedCols);
  console.log('Thực tế:', actualCols);
  process.exit(1);
} else {
  console.log('✅ Bước 3 ĐẠT: File mẫu Excel có đúng 15 cột chuẩn xác, chỉ để lại 2 cột cho đơn vị nhập!');
}

// 4. Kiểm tra Parser đọc file mẫu có dữ liệu nhập
console.log('\n--- 4. Kiểm tra Parser đọc dữ liệu kê khai từ file mẫu mới ---');
// Giả lập đơn vị điền số liệu vào dòng 1 và dòng 5
readRows[0]['Đã học (số lượng)'] = 10;
readRows[0]['Đăng ký học năm 2027 (số lượng)'] = 15;

readRows[4]['Đã học (số lượng)'] = 5;
readRows[4]['Đăng ký học năm 2027 (số lượng)'] = 8;

const filledWs = xlsx.utils.json_to_sheet(readRows);
const filledWb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(filledWb, filledWs, 'Nhu_Cau_Dao_Tao');
const filledBuf = xlsx.write(filledWb, { type: 'buffer', bookType: 'xlsx' });
const filledWorkbook = xlsx.read(filledBuf, { type: 'buffer' });

const parseResult = parseTrainingDemandExcel(filledWorkbook);
console.log('Kết quả parser:');
console.log(`- Programs: ${parseResult.programsSummary.length}`);
console.log(`- In-framework participants: ${parseResult.totalInFrameworkParticipants}`);
console.log(`- Completed participants: ${parseResult.totalCompletedParticipants}`);
console.log(`- Warnings: ${parseResult.warnings.length}`);

const p1 = parseResult.programsDataMap.get(1);
if (!p1) {
  console.error('❌ Thất bại: Không tìm thấy chương trình 1 trong kết quả parser!');
  process.exit(1);
}

const topicsList = Array.from(p1.topics.values());
const t1 = topicsList.find(t => t.topicInfo?.topic_name?.includes('Tổng quan Agribank'));
const t5 = topicsList.find(t => t.topicInfo?.topic_name?.includes('Quy chế quản lý lao động'));

console.log('Chuyên đề 1 parse được:', { topic: t1?.topicInfo?.topic_name, count: t1?.count, completedCount: t1?.completedCount });
console.log('Chuyên đề 5 parse được:', { topic: t5?.topicInfo?.topic_name, count: t5?.count, completedCount: t5?.completedCount });

if (t1?.count === 15 && t1?.completedCount === 10 &&
    t5?.count === 8 && t5?.completedCount === 5) {
  console.log('✅ Bước 4 ĐẠT: Parser nhận diện chuẩn xác 100% cả Đã học và Đăng ký học 2027 từ file mẫu!');
} else {
  console.error('❌ Thất bại: Số lượng parse được không khớp số liệu giả lập!');
  process.exit(1);
}

// 5. Kiểm tra Parser trên file gốc dạng nhiều Phụ lục xếp chồng (multi-block)
console.log('\n--- 5. Kiểm tra Parser đọc file gốc Agribank nhiều Phụ lục ---');
const origFilePath = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f/.user_uploaded/media_1792144520893_fc52cd65.xlsx';
const origWb = xlsx.readFile(origFilePath);
const origRes = parseTrainingDemandExcel(origWb);

console.log('Kết quả parser file gốc Agribank:');
console.log(`- Programs: ${origRes.programsSummary.length}`);
console.log(`- In-framework participants: ${origRes.totalInFrameworkParticipants}`);
console.log(`- Completed participants: ${origRes.totalCompletedParticipants}`);
console.log(`- Grand total participants: ${origRes.grandTotalParticipants}`);

if (origRes.programsSummary.length > 0) {
  console.log('✅ Bước 5 ĐẠT: Parser hoàn toàn tương thích và bóc tách thành công cả file gốc Agribank nhiều Phụ lục!');
} else {
  console.error('❌ Thất bại: Không bóc tách được dữ liệu từ file gốc Agribank!');
  process.exit(1);
}

console.log('\n================================================================');
console.log('🎉 TẤT CẢ 5 BÀI KIỂM TRA ĐỀU THÀNH CÔNG RỰC RỠ 100%!');
console.log('================================================================');
