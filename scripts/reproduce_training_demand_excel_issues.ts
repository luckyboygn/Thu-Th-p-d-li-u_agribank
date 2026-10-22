import * as xlsx from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseTrainingDemandExcel } from '../src/lib/training-excel-parser';
import { getDatabase } from '../src/lib/db';

async function main() {
  console.log('=== BẮT ĐẦU TÁI HIỆN VÀ XÁC MINH CÁC LỖI IMPORT EXCEL KHẢO SÁT ĐÀO TẠO ===\n');

  const db = getDatabase();
  const allOfficialPrograms = db.prepare('SELECT id, code, name, group_name FROM training_programs').all() as any[];
  const allOfficialTopics = db.prepare(`
    SELECT t.id, t.program_id, t.topic_name, t.position_code, t.delivery_method, t.duration,
           p.code as program_code, p.name as program_name
    FROM training_program_topics t
    JOIN training_programs p ON t.program_id = p.id
  `).all() as any[];

  console.log(`Đã nạp ${allOfficialPrograms.length} chương trình và ${allOfficialTopics.length} chuyên đề chuẩn.`);

  // 1. Kiểm tra 1: Nhận diện chuyên đề (Mẫu số 04)
  // Lấy 1 chuyên đề mẫu không chứa dấu sao (*)
  const sampleTopic = allOfficialTopics.find(t => t.topic_name.length > 10 && !t.topic_name.includes('*') && t.program_code && !t.program_code.startsWith('PL_NK')) || allOfficialTopics[0];
  console.log(`\nChuyên đề mẫu dùng để thử nghiệm: ID=${sampleTopic.id}, Code=${sampleTopic.program_code}, Tên="${sampleTopic.topic_name}"`);

  // 2. Tạo workbook thử nghiệm chứa các ca đặc thù
  const wb = xlsx.utils.book_new();

  // SHEET 1: Mẫu số 04 với các ca thử nghiệm
  // Ca 1.1: Tên gốc chính xác
  // Ca 1.2: Đổi dấu (thay đổi dấu tiếng Việt, ví dụ: 'Kỹ năng' -> 'Kỳ năng')
  // Ca 1.3: Thêm khoảng trắng (nhiều khoảng trắng liên tiếp và NBSP \u00A0)
  // Ca 1.4: Sửa 1 chữ trong tên chuyên đề (typo)
  // Ca 1.5: Dòng không nhận diện được (tên hoàn toàn không khớp chuyên đề nào)
  // Ca 3: Ô số lượng bị merge 3 dòng
  // Ca 4: Làm sạch số ("-5", "2,5", "10-12", "1.200", "3 người", "0", "abc")
  
  // Ta đổi dấu tiếng Việt bằng cách thay nguyên âm có dấu thành nguyên âm có dấu khác
  const originalName = sampleTopic.topic_name;
  let alteredAccentName = originalName.replace(/[áàảãạ]/i, 'è').replace(/[éèẻẽẹ]/i, 'á');
  if (alteredAccentName === originalName) alteredAccentName = originalName + ' khác';
  const extraSpacesName = '   ' + originalName.split(' ').join('    ') + ' \u00A0 ';
  const typoOneCharName = originalName.slice(0, -1) + 'x';
  const unknownName = 'Chuyên đề hoàn toàn tự chế ABCXYZ 9999';

  const rowsM04 = [
    // Header
    ['STT', 'Mã Khung CT', 'Khung Chương Trình Đào Tạo', 'Vị Trí Chức Danh', 'Tên Chuyên Đề Đào Tạo', 'Hình Thức', 'Thời Lượng', 'Lộ Trình', 'Năng Lực', 'Chứng Chỉ', 'CC1', 'CC2', 'CC3', 'Đã học', 'Đăng ký học năm 2027'],
    // 1. Khớp chính xác
    [1, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, 10],
    // 2. Đổi dấu
    [2, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, alteredAccentName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, 15],
    // 3. Thêm khoảng trắng và NBSP
    [3, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, extraSpacesName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, 20],
    // 4. Sửa 1 chữ (typo)
    [4, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, typoOneCharName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, 25],
    // 5. Tên hoàn toàn không tồn tại
    [5, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, unknownName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, 30],
    // 6. Test chuỗi số lạ trên cùng chuyên đề gốc
    [6, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, '-5'],
    [7, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, '2,5'],
    [8, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, '10-12'],
    [9, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, '1.200'],
    [10, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, '3 người'],
    [11, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, '0'],
    [12, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, 'abc'],
    // 7. Ô số lượng bị merge: dòng 13, 14, 15 merge ô số lượng (cột N - index 14) với giá trị 10
    [13, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, 10],
    [14, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, ''],
    [15, sampleTopic.program_code, sampleTopic.program_name, sampleTopic.position_code, originalName, 'Trực tuyến', '1 giờ', '', '', '', '', '', '', 0, '']
  ];

  const wsM04 = xlsx.utils.aoa_to_sheet(rowsM04);
  // Merge ô số lượng từ dòng 13 đến dòng 15 (r: 13, c: 14 to r: 15, c: 14 - 0-indexed)
  wsM04['!merges'] = [
    { s: { r: 13, c: 14 }, e: { r: 15, c: 14 } }
  ];

  xlsx.utils.book_append_sheet(wb, wsM04, 'Mau_04_Khung_Chuc_Danh');

  // SHEET 2: Mẫu số 06 (Đề xuất ngoài khung) với các giá trị số lạ: 0, số âm, chữ
  const rowsM06 = [
    ['TT', 'Chương trình đào tạo/hội thảo/thi (kèm theo Nội dung đề xuất)', 'Đối tượng', 'Số lượng', 'Thời lượng', 'Hình thức đào tạo', 'Nguồn giảng viên', 'Ghi chú'],
    [1, 'Khóa đào tạo thử nghiệm với số lượng 0', 'Cán bộ A', 0, '1 ngày', 'Trực tiếp', 'Nội bộ', ''],
    [2, 'Khóa đào tạo thử nghiệm với số lượng âm', 'Cán bộ B', -5, '1 ngày', 'Trực tiếp', 'Nội bộ', ''],
    [3, 'Khóa đào tạo thử nghiệm với số lượng chữ', 'Cán bộ C', 'abc', '1 ngày', 'Trực tiếp', 'Nội bộ', '']
  ];
  const wsM06 = xlsx.utils.aoa_to_sheet(rowsM06);
  xlsx.utils.book_append_sheet(wb, wsM06, 'Mau_06_De_Xuat_TSC_VPDD');

  const fixturePath = path.join(__dirname, 'fixtures', 'test_training_demand_issues.xlsx');
  xlsx.writeFile(wb, fixturePath);
  console.log(`Đã ghi file fixture: ${fixturePath}`);

  // Chạy parser trên file fixture vừa tạo
  const testWb = xlsx.readFile(fixturePath);
  const result = parseTrainingDemandExcel(testWb, allOfficialPrograms, allOfficialTopics);

  console.log('\n--- KẾT QUẢ PARSE TỪNG PHẦN ---');

  console.log('\n1. KIỂM TRA SO KHỚP CHUYÊN ĐỀ & DÒNG KHÔNG NHẬN DIỆN ĐƯỢC:');
  console.log(`- Tên gốc: "${originalName}"`);
  console.log(`- Tên đổi dấu: "${alteredAccentName}"`);
  console.log(`- Tên thêm khoảng trắng & NBSP: "${extraSpacesName}"`);
  console.log(`- Tên sửa 1 chữ (typo): "${typoOneCharName}"`);
  console.log(`- Tên không tồn tại: "${unknownName}"`);

  console.log(`\nSố chuyên đề trong khung được parse: ${result.totalInFrameworkTopics}`);
  console.log(`Số đề xuất ngoài khung được parse (proposalsList): ${result.proposalsList.length}`);
  console.log('Danh sách proposalsList (đề xuất ngoài khung) gồm:');
  result.proposalsList.forEach((p, idx) => {
    console.log(`  [${idx + 1}] "${p.proposal_name}" -> Số lượng: ${p.participant_count}, Ghi chú: "${p.notes}"`);
  });

  console.log('\nCảnh báo sinh ra (warnings):');
  result.warnings.forEach(w => console.log('  *', w));

  console.log('\n2. KIỂM TRA LÀM SẠCH SỐ:');
  const testStrings = ['-5', '2,5', '10-12', '1.200', '3 người', '0', 'abc'];
  testStrings.forEach(str => {
    const parsed = parseInt(String(str).replace(/[^0-9]/g, ''));
    console.log(`  Chuỗi "${str}" -> replace(/[^0-9]/g, '') = "${String(str).replace(/[^0-9]/g, '')}" -> parseInt = ${parsed}`);
  });

  console.log('\n3. KIỂM TRA Ô MERGE SỐ LƯỢNG (10 merge qua 3 dòng 13, 14, 15):');
  // Xem chi tiết các dòng 13, 14, 15 trong sheet sau khi unmerge
  const addr13 = xlsx.utils.encode_cell({ r: 13, c: 14 });
  const addr14 = xlsx.utils.encode_cell({ r: 14, c: 14 });
  const addr15 = xlsx.utils.encode_cell({ r: 15, c: 14 });
  console.log(`  Ô ${addr13} (dòng 13): v =`, testWb.Sheets['Mau_04_Khung_Chuc_Danh'][addr13]?.v);
  console.log(`  Ô ${addr14} (dòng 14): v =`, testWb.Sheets['Mau_04_Khung_Chuc_Danh'][addr14]?.v);
  console.log(`  Ô ${addr15} (dòng 15): v =`, testWb.Sheets['Mau_04_Khung_Chuc_Danh'][addr15]?.v);
  console.log(`  => Dẫn tới dòng 13 có ${testWb.Sheets['Mau_04_Khung_Chuc_Danh'][addr13]?.v}, dòng 14 có ${testWb.Sheets['Mau_04_Khung_Chuc_Danh'][addr14]?.v}, dòng 15 có ${testWb.Sheets['Mau_04_Khung_Chuc_Danh'][addr15]?.v}`);

  console.log('\n4. KIỂM TRA MẪU 06 VỚI 0, SỐ ÂM, CHỮ:');
  const m06Props = result.proposalsList.filter(p => p.proposal_name.includes('Khóa đào tạo thử nghiệm'));
  m06Props.forEach(p => {
    console.log(`  "${p.proposal_name}" -> participant_count = ${p.participant_count}`);
  });

  console.log('\n5. KIỂM TRA GHI ĐÈ BẢN SUBMITTED:');
  // Kiểm tra code src/app/api/training-demand/import-excel/route.ts
  const sampleSubmission = db.prepare("SELECT id, collection_id, unit_id, status FROM training_demand_submissions WHERE status = 'SUBMITTED' LIMIT 1").get() as any;
  if (sampleSubmission) {
    console.log(`  Có bản ghi SUBMITTED mẫu: ID=${sampleSubmission.id}, UnitID=${sampleSubmission.unit_id}, CollectionID=${sampleSubmission.collection_id}, Status=${sampleSubmission.status}`);
    console.log(`  Code route.ts lines 333-358 xóa trực tiếp các bảng con của submission ID ${sampleSubmission.id} mà KHÔNG kiểm tra submission.status!`);
  } else {
    console.log('  Không có bản ghi SUBMITTED sẵn trong DB, nhưng code route.ts lines 333-358 cho thấy rõ không có if (submission.status === "SUBMITTED") check.');
  }

  console.log('\n=== HOÀN TẤT TÁI HIỆN VÀ XÁC MINH ===');
}

main().catch(err => {
  console.error('Lỗi khi chạy script tái hiện:', err);
  process.exit(1);
});
