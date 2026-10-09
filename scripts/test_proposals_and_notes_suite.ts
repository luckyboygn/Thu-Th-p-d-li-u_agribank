import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import * as xlsx from 'xlsx';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 BẮT ĐẦU TEST SUITE: MỤC 2.8 - GHI CHÚ VÀ ĐỀ XUẤT NGOÀI KHUNG');
  console.log('========================================================================\n');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const db = new DatabaseSync(dbPath);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  // 1. Kiểm tra cấu trúc CSDL
  console.log('--- 1. Kiểm tra Cấu trúc CSDL (Schema Integrity) ---');
  const progColumns = db.prepare("PRAGMA table_info(training_demand_programs)").all() as any[];
  const hasProgNotes = progColumns.some(c => c.name === 'notes');
  assert(hasProgNotes, 'Bảng training_demand_programs có cột notes (TEXT)');

  const proposalTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='training_demand_proposals'").get();
  assert(!!proposalTable, 'Bảng training_demand_proposals tồn tại trong CSDL');

  const propColumns = db.prepare("PRAGMA table_info(training_demand_proposals)").all() as any[];
  const propColNames = propColumns.map(c => c.name);
  assert(
    propColNames.includes('id') &&
    propColNames.includes('submission_id') &&
    propColNames.includes('proposal_name') &&
    propColNames.includes('target_audience') &&
    propColNames.includes('participant_count') &&
    propColNames.includes('expected_duration') &&
    propColNames.includes('notes'),
    'Bảng training_demand_proposals có đầy đủ các cột bắt buộc'
  );

  // 2. Kiểm tra thao tác ghi chú chương trình đào tạo
  console.log('\n--- 2. Kiểm tra Ghi chú cho Khung chương trình đào tạo ---');
  let testSubmission = db.prepare("SELECT id, unit_id FROM training_demand_submissions ORDER BY id ASC LIMIT 1").get() as any;
  if (!testSubmission) {
    const firstUnit = db.prepare("SELECT id FROM units LIMIT 1").get() as any;
    const res = db.prepare("INSERT INTO training_demand_submissions (collection_id, unit_id, status) VALUES (1, ?, 'DRAFT')").run(firstUnit.id);
    testSubmission = { id: Number(res.lastInsertRowid), unit_id: firstUnit.id };
  }

  let testProgram = db.prepare("SELECT id FROM training_programs LIMIT 1").get() as any;
  assert(!!testProgram, 'Có ít nhất 1 chương trình đào tạo trong danh mục chuẩn');

  // Insert or update training_demand_programs with notes
  let dp = db.prepare("SELECT id FROM training_demand_programs WHERE submission_id = ? AND program_id = ?").get(testSubmission.id, testProgram.id) as any;
  const testNoteText = 'Đơn vị đề xuất đào tạo thực hành trực tiếp tại Chi nhánh trong Quý II';
  if (dp) {
    db.prepare("UPDATE training_demand_programs SET notes = ? WHERE id = ?").run(testNoteText, dp.id);
  } else {
    const dpRes = db.prepare("INSERT INTO training_demand_programs (submission_id, program_id, notes) VALUES (?, ?, ?)").run(testSubmission.id, testProgram.id, testNoteText);
    dp = { id: Number(dpRes.lastInsertRowid) };
  }

  const checkDp = db.prepare("SELECT notes FROM training_demand_programs WHERE id = ?").get(dp.id) as any;
  assert(checkDp && checkDp.notes === testNoteText, 'Lưu và đọc lại ghi chú chương trình đào tạo chính xác');

  // 3. Kiểm tra lưu danh sách Đề xuất ngoài khung (SAVE_PROPOSALS)
  console.log('\n--- 3. Kiểm tra Lưu và Truy vấn Đề xuất ngoài khung ---');
  // Dọn dẹp dữ liệu test cũ của submission
  db.prepare("DELETE FROM training_demand_proposals WHERE submission_id = ?").run(testSubmission.id);

  const testProposals = [
    {
      proposal_name: 'Nghiệp vụ Thẩm định Tín dụng Xanh và Dự án ESG',
      target_audience: 'Cán bộ Tín dụng và Thẩm định rủi ro',
      participant_count: 15,
      expected_duration: '3 ngày',
      notes: 'Đào tạo cấp chứng chỉ theo khung chuẩn quốc tế'
    },
    {
      proposal_name: 'Ứng dụng AI và Tự động hóa trong Vận hành Tác nghiệp',
      target_audience: 'Giao dịch viên và Kiểm soát viên',
      participant_count: 25,
      expected_duration: '2 ngày',
      notes: 'Nâng cao năng suất xử lý hồ sơ'
    }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO training_demand_proposals (
      submission_id, proposal_name, target_audience, participant_count, expected_duration, notes
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const p of testProposals) {
    insertStmt.run(testSubmission.id, p.proposal_name, p.target_audience, p.participant_count, p.expected_duration, p.notes);
  }

  const savedList = db.prepare("SELECT * FROM training_demand_proposals WHERE submission_id = ? ORDER BY id ASC").all(testSubmission.id) as any[];
  assert(savedList.length === 2, 'Lưu thành công 2 bản ghi đề xuất ngoài khung');
  assert(savedList[0].proposal_name === testProposals[0].proposal_name, 'Tên đề xuất chuyên đề 1 khớp chính xác');
  assert(savedList[0].participant_count === 15, 'Số người tham gia dự kiến khớp');
  assert(savedList[1].notes === testProposals[1].notes, 'Ghi chú đề xuất chuyên đề 2 khớp');

  // 4. Kiểm tra cập nhật toàn bộ danh sách (Transaction Atomic Replace)
  console.log('\n--- 4. Kiểm tra Cập nhật/Thay thế danh sách đề xuất (Transaction Atomic) ---');
  db.exec('BEGIN TRANSACTION;');
  db.prepare("DELETE FROM training_demand_proposals WHERE submission_id = ?").run(testSubmission.id);
  insertStmt.run(testSubmission.id, 'Chuyên đề Quản trị Dữ liệu Khách hàng Phân tán', 'Cán bộ CNTT & Dữ liệu', 10, '1 ngày', 'Đào tạo nội bộ');
  db.exec('COMMIT;');

  const replacedList = db.prepare("SELECT * FROM training_demand_proposals WHERE submission_id = ?").all(testSubmission.id) as any[];
  assert(replacedList.length === 1 && replacedList[0].participant_count === 10, 'Cập nhật lại danh sách đề xuất thay thế toàn diện thành công');

  // 5. Kiểm tra truy vấn Báo cáo Đề xuất cho Super Admin
  console.log('\n--- 5. Kiểm tra API/Query Báo cáo Đề xuất Toàn hệ thống ---');
  const adminReport = db.prepare(`
    SELECT p.id,
           p.submission_id,
           u.unit_code,
           u.unit_name,
           p.proposal_name,
           p.target_audience,
           p.participant_count,
           p.expected_duration,
           p.notes,
           p.created_at
    FROM training_demand_proposals p
    JOIN training_demand_submissions s ON p.submission_id = s.id
    JOIN units u ON s.unit_id = u.id
    ORDER BY u.unit_code ASC, p.id ASC
  `).all() as any[];

  assert(adminReport.length >= 1, 'Truy vấn danh sách đề xuất kèm thông tin Đơn vị thành công');
  const firstItem = adminReport.find(r => r.submission_id === testSubmission.id);
  assert(firstItem && !!firstItem.unit_code && !!firstItem.unit_name, 'Bản ghi chứa đầy đủ mã đơn vị và tên đơn vị');

  // 6. Kiểm tra xuất file Excel Đề xuất ngoài khung
  console.log('\n--- 6. Kiểm tra Cấu trúc Xuất Excel Đề xuất ngoài khung ---');
  const excelData = adminReport.map((p, idx) => ({
    'STT': idx + 1,
    'Mã Đơn Vị': p.unit_code,
    'Tên Đơn Vị': p.unit_name,
    'Tên Đề Xuất Chuyên Đề / Khóa Học': p.proposal_name,
    'Đối Tượng Tham Gia': p.target_audience || '',
    'Số Người Dự Kiến': Number(p.participant_count || 0),
    'Thời Lượng': p.expected_duration || '',
    'Ghi Chú / Đề Xuất Chi Tiết': p.notes || '',
    'Ngày Đề Xuất': p.created_at || ''
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(excelData);
  xlsx.utils.book_append_sheet(wb, ws, 'De_Xuat_Ngoai_Khung');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  assert(buf && buf.length > 0, 'Sinh file Excel Đề xuất ngoài khung thành công (Buffer > 0)');

  // Đọc lại file Excel để thẩm định dữ liệu
  const readWb = xlsx.read(buf, { type: 'buffer' });
  const sheetName = readWb.SheetNames[0];
  assert(sheetName === 'De_Xuat_Ngoai_Khung', 'Tên sheet trong Excel chuẩn xác');
  const readRows = xlsx.utils.sheet_to_json(readWb.Sheets[sheetName]) as any[];
  assert(readRows.length === adminReport.length, 'Số lượng dòng trong file Excel khớp với dữ liệu CSDL');

  // 7. Kiểm tra tính toàn vẹn CSDL
  console.log('\n--- 7. Kiểm tra Tính toàn vẹn CSDL (PRAGMA integrity_check) ---');
  const integrity = db.prepare('PRAGMA integrity_check').get() as any;
  assert(integrity.integrity_check === 'ok', 'CSDL đạt PRAGMA integrity_check = ok');

  console.log('\n========================================================================');
  console.log(`🎯 KẾT QUẢ TEST SUITE: ${passed}/${total} TESTS ĐẠT (${Math.round((passed / total) * 100)}%)`);
  console.log('========================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Lỗi thực thi test suite:', err);
  process.exit(1);
});
