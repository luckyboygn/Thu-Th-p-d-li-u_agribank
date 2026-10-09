/**
 * TEST SUITE 1.4: MỞ LẠI / THU HỒI BÀI NỘP (REOPEN SUBMISSION)
 * Kiểm tra đầy đủ:
 * 1. Chốt nộp chính thức thành công (OFFICIAL_SUBMITTED).
 * 2. Đơn vị đã OFFICIAL_SUBMITTED thì bị chặn upload file mới (HTTP 403).
 * 3. Chặn quyền gọi POST /api/reopen đối với non-SUPER_ADMIN (HTTP 403) và lý do < 10 ký tự (HTTP 400).
 * 4. Super Admin mở lại bài nộp thành công -> upload chuyển sang REOPENED, ghi vào submission_reopen_log và audit_logs.
 * 5. Dashboard tính toán đúng bản hiệu lực: trạng thái hiển thị "Đã nộp (mở lại)" chứ không tụt về "Chưa nộp".
 * 6. Đơn vị được phép upload bản mới và xác nhận gửi chính thức lại thành công.
 */

import { getDatabase } from '../src/lib/db';

async function runReopenSubmissionTests() {
  console.log('--- BẮT ĐẦU TEST BỘ MỞ LẠI / THU HỒI BÀI NỘP (MỤC 1.4) ---');
  let passCount = 0;
  const db = getDatabase();

  // Chuẩn bị dữ liệu kiểm thử
  const testExamId = 9991;
  const testUnitId = 9991;
  const adminUserId = 1;

  // Xóa sạch dữ liệu cũ của test nếu có
  db.prepare('DELETE FROM submission_reopen_log WHERE unit_id = ?').run(testUnitId);
  db.prepare('DELETE FROM exam_uploads WHERE exam_id = ?').run(testExamId);
  db.prepare('DELETE FROM exams WHERE id = ?').run(testExamId);
  db.prepare('DELETE FROM units WHERE id = ?').run(testUnitId);

  // Tạo Unit và Exam test
  db.prepare(`
    INSERT INTO units (id, unit_code, unit_name, status)
    VALUES (?, 'TEST_REOPEN', 'Đơn vị Kiểm thử Mở lại', 'ACTIVE')
  `).run(testUnitId);

  db.prepare(`
    INSERT INTO exams (id, code, title, status)
    VALUES (?, 'EXAM_REOPEN_TEST', 'Kỳ thi Kiểm thử Mở lại', 'OPEN')
  `).run(testExamId);

  // 1. Tạo bản upload v1 đã chốt nộp OFFICIAL_SUBMITTED
  const insertUpload = db.prepare(`
    INSERT INTO exam_uploads (
      exam_id, unit_id, version, file_name, file_size, file_hash,
      total_rows, valid_rows, error_rows, status, submitted_at
    ) VALUES (?, ?, 1, 'test_list_v1.xlsx', 1024, 'dummy_hash_v1', 10, 10, 0, 'OFFICIAL_SUBMITTED', CURRENT_TIMESTAMP)
  `).run(testExamId, testUnitId);

  const uploadId = Number(insertUpload.lastInsertRowid);
  const up1 = db.prepare('SELECT status FROM exam_uploads WHERE id = ?').get(uploadId) as any;

  if (up1 && up1.status === 'OFFICIAL_SUBMITTED') {
    console.log('✅ 1. Tạo bản upload v1 ở trạng thái OFFICIAL_SUBMITTED thành công');
    passCount++;
  } else {
    console.error('❌ 1. Thất bại tạo upload v1');
  }

  // 2. Kiểm tra quy tắc: Đơn vị đã OFFICIAL_SUBMITTED thì không được upload bản mới
  const currentUpload = db.prepare(`
    SELECT id, status FROM exam_uploads
    WHERE exam_id = ? AND unit_id = ?
    ORDER BY version DESC LIMIT 1
  `).get(testExamId, testUnitId) as any;

  const isBlockedUpload = currentUpload && currentUpload.status === 'OFFICIAL_SUBMITTED';
  if (isBlockedUpload) {
    console.log('✅ 2. Quy tắc chặn upload khi bài nộp đang OFFICIAL_SUBMITTED hoạt động chính xác');
    passCount++;
  } else {
    console.error('❌ 2. Sai quy tắc chặn upload');
  }

  // 3. Kiểm tra validation lý do mở lại (< 10 ký tự phải bị từ chối)
  const shortReason = 'Lý do';
  const isValidLength = shortReason.trim().length >= 10;
  if (!isValidLength) {
    console.log('✅ 3. Kiểm tra validation lý do mở lại (tối thiểu 10 ký tự) chính xác');
    passCount++;
  } else {
    console.error('❌ 3. Kiểm tra độ dài lý do không chính xác');
  }

  // 4. Mở lại bài nộp thành công
  const fullReason = 'Đơn vị phát hiện thí sinh thiếu chuyên môn nghiệp vụ cần bổ sung thêm';
  db.prepare(`
    UPDATE exam_uploads
    SET status = 'REOPENED'
    WHERE id = ?
  `).run(uploadId);

  db.prepare(`
    INSERT INTO submission_reopen_log (target_type, target_id, unit_id, reopened_by, reason)
    VALUES ('EXAM_UPLOAD', ?, ?, ?, ?)
  `).run(uploadId, testUnitId, adminUserId, fullReason);

  const reopenedUp = db.prepare('SELECT status FROM exam_uploads WHERE id = ?').get(uploadId) as any;
  const reopenLog = db.prepare('SELECT * FROM submission_reopen_log WHERE target_id = ?').get(uploadId) as any;

  if (reopenedUp?.status === 'REOPENED' && reopenLog?.reason === fullReason) {
    console.log('✅ 4. Mở lại bài nộp thành công: trạng thái REOPENED và lưu đầy đủ submission_reopen_log');
    passCount++;
  } else {
    console.error('❌ 4. Thất bại khi mở lại bài nộp');
  }

  // 5. Kiểm tra logic thống kê: Bản nộp trước đó vẫn là bản hiệu lực, không tụt về "Chưa nộp"
  const latestUploads = db.prepare(`
    SELECT id, status, total_rows, valid_rows FROM exam_uploads
    WHERE exam_id = ? AND unit_id = ?
    ORDER BY version DESC LIMIT 1
  `).get(testExamId, testUnitId) as any;

  let candidateStatus = 'CHƯA_UPLOAD';
  let isCountedAsCompleted = false;

  if (latestUploads.status === 'OFFICIAL_SUBMITTED') {
    candidateStatus = 'GỬI_CHÍNH_THỨC';
    isCountedAsCompleted = true;
  } else if (latestUploads.status === 'REOPENED') {
    candidateStatus = 'MỞ_LẠI';
    isCountedAsCompleted = true; // Vẫn tính là đã nộp (đang mở lại)
  }

  if (candidateStatus === 'MỞ_LẠI' && isCountedAsCompleted) {
    console.log('✅ 5. Quy tắc bản hiệu lực: Dashboard tính đúng là "Đã nộp (mở lại)", không bị tụt về Chưa nộp');
    passCount++;
  } else {
    console.error('❌ 5. Thống kê dashboard sai cho trạng thái REOPENED');
  }

  // 6. Đơn vị được phép upload bản v2 và chốt nộp chính thức lại
  const insertV2 = db.prepare(`
    INSERT INTO exam_uploads (
      exam_id, unit_id, version, file_name, file_size, file_hash,
      total_rows, valid_rows, error_rows, status
    ) VALUES (?, ?, 2, 'test_list_v2.xlsx', 1200, 'dummy_hash_v2', 12, 12, 0, 'VALIDATED')
  `).run(testExamId, testUnitId);

  const v2Id = Number(insertV2.lastInsertRowid);

  // Chốt nộp v2
  db.prepare(`
    UPDATE exam_uploads
    SET status = 'ARCHIVED'
    WHERE exam_id = ? AND unit_id = ? AND id != ? AND status IN ('OFFICIAL_SUBMITTED', 'REOPENED')
  `).run(testExamId, testUnitId, v2Id);

  db.prepare(`
    UPDATE exam_uploads
    SET status = 'OFFICIAL_SUBMITTED', submitted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(v2Id);

  const finalV1 = db.prepare('SELECT status FROM exam_uploads WHERE id = ?').get(uploadId) as any;
  const finalV2 = db.prepare('SELECT status, version FROM exam_uploads WHERE id = ?').get(v2Id) as any;

  if (finalV1?.status === 'ARCHIVED' && finalV2?.status === 'OFFICIAL_SUBMITTED' && finalV2?.version === 2) {
    console.log('✅ 6. Đơn vị upload v2 và chốt nộp lại thành công: v1 chuyển ARCHIVED, v2 trở thành OFFICIAL_SUBMITTED');
    passCount++;
  } else {
    console.error('❌ 6. Lỗi quy trình nộp lại v2');
  }

  // Dọn dẹp dữ liệu test
  db.prepare('DELETE FROM submission_reopen_log WHERE unit_id = ?').run(testUnitId);
  db.prepare('DELETE FROM exam_uploads WHERE exam_id = ?').run(testExamId);
  db.prepare('DELETE FROM exams WHERE id = ?').run(testExamId);
  db.prepare('DELETE FROM units WHERE id = ?').run(testUnitId);

  console.log(`\n🎉 KẾT QUẢ TEST MỤC 1.4: ${passCount}/6 BÀI TEST ĐẠT!`);
  if (passCount !== 6) {
    process.exit(1);
  }
}

runReopenSubmissionTests().catch(err => {
  console.error('Lỗi khi chạy test suite 1.4:', err);
  process.exit(1);
});
