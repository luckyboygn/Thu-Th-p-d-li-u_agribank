import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import * as xlsx from 'xlsx';
import { calculateTrainingDemandParticipants, createSubmissionReceipt, getTrainingDemandProgramsSummary } from '../src/lib/receipt';

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('=====================================================');
console.log('   TEST SUITE: ADMIN NỘP HỘ FILE EXCEL KHẢO SÁT ĐÀO TẠO CHO ĐƠN VỊ');
console.log('=====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, extraInfo = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (extraInfo) console.error(`   -> Chi tiết: ${extraInfo}`);
  }
}

try {
  // TEST 1: Kiểm tra tạo Workbook Template Excel chuẩn
  const topics = db.prepare(`
    SELECT p.code as program_code, p.name as program_name,
           t.topic_name, t.delivery_method, t.duration
    FROM training_program_topics t
    JOIN training_programs p ON t.program_id = p.id
    ORDER BY p.id ASC, t.display_order ASC
    LIMIT 20
  `).all() as any[];

  const wbTemplate = xlsx.utils.book_new();
  const templateRows = topics.map((t, idx) => ({
    'STT': idx + 1,
    'Mã Khung CT': t.program_code,
    'Khung Chương Trình Đào Tạo': t.program_name,
    'Tên Chuyên Đề Đào Tạo': t.topic_name,
    'Hình Thức Đào Tạo': t.delivery_method || 'Trực tiếp / Trực tuyến',
    'Thời Lượng': t.duration || '1 ngày',
    'Số Lượng Người Đăng Ký': '',
    'Ghi Chú': ''
  }));
  const ws1 = xlsx.utils.json_to_sheet(templateRows);
  xlsx.utils.book_append_sheet(wbTemplate, ws1, 'Nhu_Cau_Dao_Tao');
  const ws2 = xlsx.utils.json_to_sheet([
    {
      'STT': 1,
      'Tên Chuyên Đề / Khóa Học Đề Xuất': 'Kỹ năng quản trị trải nghiệm khách hàng số',
      'Đối Tượng Tham Gia': 'Giao dịch viên',
      'Thời Lượng Dự Kiến': '2 ngày',
      'Số Lượng Người Đăng Ký': 15,
      'Ghi Chú / Kiến Nghị Chi Tiết': 'Đào tạo trực tiếp'
    }
  ]);
  xlsx.utils.book_append_sheet(wbTemplate, ws2, 'De_Xuat_Ngoai_Khung');

  assert(
    wbTemplate.SheetNames.includes('Nhu_Cau_Dao_Tao') && wbTemplate.SheetNames.includes('De_Xuat_Ngoai_Khung'),
    'TEST 1: File template có đầy đủ Sheet Nhu_Cau_Dao_Tao và De_Xuat_Ngoai_Khung'
  );

  // TEST 2: Giả lập file Excel do đơn vị điền và gửi qua Email
  // Chọn đơn vị thử nghiệm: [1080] Agribank Chi nhánh Ngân quỹ miền Bắc (hoặc đơn vị id=1)
  const testUnit = db.prepare("SELECT id, unit_code, unit_name FROM units WHERE unit_code = '1080'").get() as any ||
                   db.prepare("SELECT id, unit_code, unit_name FROM units LIMIT 1").get() as any;
  const activeCollection = db.prepare("SELECT id, code, title FROM collections WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get() as any ||
                           db.prepare("SELECT id, code, title FROM collections ORDER BY id DESC LIMIT 1").get() as any;

  assert(testUnit && activeCollection, 'TEST 2: Xác định được đơn vị đích và đợt khảo sát hoạt động');

  // Lấy 2 chuyên đề chính thức từ CSDL để giả lập chi nhánh đăng ký
  const officialSampleTopics = db.prepare(`
    SELECT t.id, t.program_id, t.topic_name, p.code as program_code, p.name as program_name
    FROM training_program_topics t
    JOIN training_programs p ON t.program_id = p.id
    LIMIT 2
  `).all() as any[];

  const mockFilledRows = [
    {
      'Mã Khung CT': officialSampleTopics[0].program_code,
      'Khung Chương Trình Đào Tạo': officialSampleTopics[0].program_name,
      'Tên Chuyên Đề Đào Tạo': officialSampleTopics[0].topic_name,
      'Số Lượng Người Đăng Ký': 25,
      'Ghi Chú': 'Ưu tiên quý 1/2027'
    },
    {
      'Mã Khung CT': officialSampleTopics[1].program_code,
      'Khung Chương Trình Đào Tạo': officialSampleTopics[1].program_name,
      'Tên Chuyên Đề Đào Tạo': officialSampleTopics[1].topic_name,
      'Số Lượng Người Đăng Ký': 15,
      'Ghi Chú': 'Đào tạo trực tuyến'
    },
    // Chuyên đề ngoài danh mục xuất hiện ngay trong sheet chính
    {
      'Mã Khung CT': 'NGOAI_KHUNG',
      'Khung Chương Trình Đào Tạo': 'Đề xuất riêng của chi nhánh',
      'Tên Chuyên Đề Đào Tạo': 'Chuyên đề đặc thù kho quỹ và vận chuyển tiền mặt an toàn',
      'Số Lượng Người Đăng Ký': 10,
      'Ghi Chú': 'Chi nhánh đề xuất thêm'
    }
  ];

  const mockProposalRows = [
    {
      'STT': 1,
      'Tên Chuyên Đề / Khóa Học Đề Xuất': 'Kỹ năng giao tiếp và ứng xử chuyên nghiệp',
      'Đối Tượng Tham Gia': 'Giao dịch viên',
      'Thời Lượng Dự Kiến': '1 ngày',
      'Số Lượng Người Đăng Ký': 12,
      'Ghi Chú / Kiến Nghị Chi Tiết': 'Đào tạo tại chỗ'
    }
  ];

  const wbUnit = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wbUnit, xlsx.utils.json_to_sheet(mockFilledRows), 'Nhu_Cau_Dao_Tao');
  xlsx.utils.book_append_sheet(wbUnit, xlsx.utils.json_to_sheet(mockProposalRows), 'De_Xuat_Ngoai_Khung');

  // TEST 3: Giả lập quá trình bóc tách dữ liệu từ file Excel
  const allOfficialTopics = db.prepare('SELECT id, program_id, topic_name FROM training_program_topics').all() as any[];
  const topicMap = new Map<string, any>();
  for (const t of allOfficialTopics) {
    topicMap.set(t.topic_name.toLowerCase().trim(), t);
  }

  let inFrameworkCount = 0;
  let inFrameworkParticipants = 0;
  const parsedProposals: any[] = [];

  const mainRows = xlsx.utils.sheet_to_json(wbUnit.Sheets['Nhu_Cau_Dao_Tao']) as any[];
  for (const r of mainRows) {
    const tName = r['Tên Chuyên Đề Đào Tạo'] || '';
    const count = Number(r['Số Lượng Người Đăng Ký'] || 0);
    const matched = topicMap.get(tName.toLowerCase().trim());
    if (matched) {
      inFrameworkCount++;
      inFrameworkParticipants += count;
    } else {
      parsedProposals.push({
        proposal_name: tName,
        participant_count: count
      });
    }
  }

  const propRows = xlsx.utils.sheet_to_json(wbUnit.Sheets['De_Xuat_Ngoai_Khung']) as any[];
  for (const r of propRows) {
    parsedProposals.push({
      proposal_name: r['Tên Chuyên Đề / Khóa Học Đề Xuất'],
      participant_count: Number(r['Số Lượng Người Đăng Ký'] || 0)
    });
  }

  assert(
    inFrameworkCount === 2 && inFrameworkParticipants === 40,
    `TEST 3: Nhận diện chính xác 2 chuyên đề trong khung (40 lượt học viên: 25 + 15)`
  );
  assert(
    parsedProposals.length === 2 && (parsedProposals[0].participant_count + parsedProposals[1].participant_count === 22),
    `TEST 4: Bóc tách chính xác 2 đề xuất ngoài khung (22 lượt: 10 + 12)`
  );

  const grandTotal = inFrameworkParticipants + parsedProposals.reduce((s, p) => s + p.participant_count, 0);
  assert(grandTotal === 62, `TEST 5: Tổng số lượt người đăng ký toàn bộ = 62 lượt (40 + 22)`);

  // TEST 6: Thực hiện lưu vào CSDL & cấp biên nhận nộp thay
  db.exec('BEGIN TRANSACTION;');
  
  // Tạo hoặc lấy submission
  let sub = db.prepare('SELECT id FROM training_demand_submissions WHERE collection_id = ? AND unit_id = ?').get(activeCollection.id, testUnit.id) as any;
  if (!sub) {
    const ins = db.prepare(`
      INSERT INTO training_demand_submissions (collection_id, unit_id, status, prepared_by, note)
      VALUES (?, ?, 'DRAFT', 1, 'Admin nộp hộ qua email test')
    `).run(activeCollection.id, testUnit.id);
    sub = { id: Number(ins.lastInsertRowid) };
  }

  // Ghi chương trình và chuyên đề
  const insProg = db.prepare('INSERT INTO training_demand_programs (submission_id, program_id) VALUES (?, ?)').run(sub.id, officialSampleTopics[0].program_id);
  const progId = Number(insProg.lastInsertRowid);

  db.prepare(`
    INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count, topic_name_snapshot)
    VALUES (?, ?, ?, ?)
  `).run(progId, officialSampleTopics[0].id, 25, officialSampleTopics[0].topic_name);

  db.prepare(`
    INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count, topic_name_snapshot)
    VALUES (?, ?, ?, ?)
  `).run(progId, officialSampleTopics[1].id, 15, officialSampleTopics[1].topic_name);

  // Ghi 2 đề xuất ngoài khung
  for (const p of parsedProposals) {
    db.prepare(`
      INSERT INTO training_demand_proposals (submission_id, proposal_name, participant_count, notes)
      VALUES (?, ?, ?, 'Test proxy upload')
    `).run(sub.id, p.proposal_name, p.participant_count);
  }

  // Tính lại tổng người học và cấp biên nhận
  const calcTotal = calculateTrainingDemandParticipants(db, sub.id);
  assert(calcTotal === 62, `TEST 6: calculateTrainingDemandParticipants tính chuẩn xác 62 lượt học viên từ CSDL`);

  const receiptCode = createSubmissionReceipt(db, {
    targetType: 'TRAINING_DEMAND',
    targetId: sub.id,
    unitId: testUnit.id,
    submittedBy: 1,
    approvedBy: 1,
    totalRecords: calcTotal,
    metadata: {
      adminProxyUpload: true,
      proxyUploadedBy: 'Super Admin',
      fileName: 'Khao_Sat_Nhu_Cau_Dao_Tao_1080_Email.xlsx'
    }
  });

  db.prepare(`
    UPDATE training_demand_submissions
    SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, submitted_by = 1, approved_by = 1, receipt_code = ?
    WHERE id = ?
  `).run(receiptCode, sub.id);

  db.exec('COMMIT;');

  assert(receiptCode.startsWith('AGR-'), `TEST 7: Sinh biên nhận nộp chính thức thành công: ${receiptCode}`);

  const savedReceipt = db.prepare('SELECT * FROM submission_receipts WHERE receipt_code = ?').get(receiptCode) as any;
  assert(
    savedReceipt && savedReceipt.total_records === 62,
    `TEST 8: Bản ghi submission_receipts lưu đúng 62 lượt học viên với dấu xác thực điện tử`
  );

  // Cleanup test data
  db.prepare('DELETE FROM training_demand_program_topics WHERE demand_program_id = ?').run(progId);
  db.prepare('DELETE FROM training_demand_programs WHERE id = ?').run(progId);
  db.prepare('DELETE FROM training_demand_proposals WHERE submission_id = ?').run(sub.id);
  db.prepare('DELETE FROM submission_receipts WHERE receipt_code = ?').run(receiptCode);
  console.log('\n🧹 Đã dọn dẹp dữ liệu test an toàn.');

} catch (err: any) {
  console.error('Lỗi khi chạy test suite:', err);
  totalTests++;
}

console.log('\n=====================================================');
console.log(`KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('=====================================================');

if (passedTests === totalTests && totalTests >= 8) {
  console.log('🎉 TẤT CẢ CÁC BÀI TEST ADMIN NỘP HỘ FILE EXCEL ĐÃ ĐẠT 100%!');
  process.exit(0);
} else {
  console.error('❌ CÓ BÀI TEST KHÔNG ĐẠT!');
  process.exit(1);
}
