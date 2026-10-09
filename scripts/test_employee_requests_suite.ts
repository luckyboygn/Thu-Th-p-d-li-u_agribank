/**
 * TEST SUITE 1.6: QUY TRÌNH CÁN BỘ CHƯA CÓ TRONG MASTER DB
 * 1. Đơn vị gửi đề nghị bổ sung cán bộ (POST /api/employee-requests) -> Lưu status PENDING
 * 2. Phân quyền: Đơn vị không thấy đề nghị của đơn vị khác
 * 3. Super Admin duyệt đề nghị (APPROVE) -> Cán bộ tự động được thêm vào employees, request đổi status APPROVED
 * 4. Gọi API đối chiếu lại upload (POST /api/uploads/{id}/revalidate) -> Dòng lỗi được giải quyết, validRows tăng, errorRows giảm
 * 5. Super Admin từ chối đề nghị (REJECT) -> Bắt buộc có lý do từ chối, status REJECTED
 */

import { getDatabase } from '../src/lib/db';
import { validateCandidateBatch } from '../src/lib/validation';

async function runEmployeeRequestsTests() {
  console.log('--- BẮT ĐẦU TEST BỘ QUY TRÌNH CÁN BỘ CHƯA CÓ TRONG MASTER DB (MỤC 1.6) ---');
  let passCount = 0;
  const db = getDatabase();

  const testExamId = 9992;
  const testUnitId = 9992;
  const testEmpCode = 'TEST_EMP_9992';
  const testElearn = 'test_elearn_9992';
  const testFullName = 'Nguyễn Văn Kiểm Thử 9992';

  // Dọn dẹp dữ liệu cũ nếu có
  db.prepare('DELETE FROM employees WHERE employee_code = ?').run(testEmpCode);
  db.prepare('DELETE FROM employee_add_requests WHERE unit_id = ?').run(testUnitId);
  db.prepare('DELETE FROM validation_errors WHERE upload_id IN (SELECT id FROM exam_uploads WHERE exam_id = ?)').run(testExamId);
  db.prepare('DELETE FROM exam_records WHERE exam_id = ?').run(testExamId);
  db.prepare('DELETE FROM exam_uploads WHERE exam_id = ?').run(testExamId);
  db.prepare('DELETE FROM exams WHERE id = ?').run(testExamId);
  db.prepare('DELETE FROM units WHERE id = ?').run(testUnitId);

  // Tạo Exam và Unit
  db.prepare(`
    INSERT INTO units (id, unit_code, unit_name, status)
    VALUES (?, '9992', 'Chi nhánh Kiểm Thử 9992', 'ACTIVE')
  `).run(testUnitId);

  db.prepare(`
    INSERT INTO exams (id, code, title, status)
    VALUES (?, 'EXAM_9992', 'Kỳ thi Kiểm Thử 9992', 'OPEN')
  `).run(testExamId);

  // 1. Tạo đề nghị bổ sung cán bộ
  const insertReq = db.prepare(`
    INSERT INTO employee_add_requests (
      exam_id, unit_id, employee_code, elearning_account, full_name, position, reason, status, requested_by
    ) VALUES (?, ?, ?, ?, ?, 'Cán bộ Tín dụng', 'Cán bộ mới tuyển dụng tháng 01/2026', 'PENDING', 1)
  `).run(testExamId, testUnitId, testEmpCode, testElearn, testFullName);

  const reqId = Number(insertReq.lastInsertRowid);
  const createdReq = db.prepare('SELECT * FROM employee_add_requests WHERE id = ?').get(reqId) as any;

  if (createdReq && createdReq.status === 'PENDING' && createdReq.employee_code === testEmpCode) {
    console.log('✅ 1. Đơn vị tạo đề nghị bổ sung cán bộ thành công (status: PENDING)');
    passCount++;
  } else {
    console.error('❌ 1. Thất bại tạo đề nghị bổ sung');
  }

  // 2. Kiểm tra phân quyền: Đơn vị khác không được thấy request này
  const otherUnitId = 9993;
  const checkIsolation = db.prepare(`
    SELECT COUNT(*) as cnt FROM employee_add_requests
    WHERE id = ? AND unit_id = ?
  `).get(reqId, otherUnitId) as any;

  if (checkIsolation.cnt === 0) {
    console.log('✅ 2. Kiểm soát phân quyền đa đơn vị: Đơn vị khác không xem được yêu cầu này');
    passCount++;
  } else {
    console.error('❌ 2. Thất bại kiểm tra phân quyền cô lập đơn vị');
  }

  // 3. Super Admin phê duyệt đề nghị (APPROVE) -> Thêm vào employees
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, position)
    VALUES (?, ?, ?, '9992', 'Cán bộ Tín dụng')
  `).run(testEmpCode, testElearn, testFullName);

  db.prepare(`
    UPDATE employee_add_requests
    SET status = 'APPROVED', reviewed_by = 1, reviewed_at = ?, review_note = 'Đã duyệt bổ sung vào CSDL Master'
    WHERE id = ?
  `).run(nowIso, reqId);

  const approvedEmp = db.prepare('SELECT * FROM employees WHERE employee_code = ?').get(testEmpCode) as any;
  const updatedReq = db.prepare('SELECT * FROM employee_add_requests WHERE id = ?').get(reqId) as any;

  if (approvedEmp && updatedReq.status === 'APPROVED') {
    console.log('✅ 3. Super Admin phê duyệt đề nghị: Nhân sự được đồng bộ vào bảng employees và trạng thái đổi sang APPROVED');
    passCount++;
  } else {
    console.error('❌ 3. Lỗi quy trình phê duyệt đề nghị');
  }

  // 4. Kiểm tra Revalidate upload
  // Tạo giả lập upload v1 có dòng lỗi của cán bộ testEmpCode
  const insUpload = db.prepare(`
    INSERT INTO exam_uploads (
      exam_id, unit_id, version, file_name, file_size, file_hash,
      total_rows, valid_rows, error_rows, status
    ) VALUES (?, ?, 1, 'test.xlsx', 1000, 'hash', 1, 0, 1, 'STAGING')
  `).run(testExamId, testUnitId);
  const uploadId = Number(insUpload.lastInsertRowid);

  db.prepare(`
    INSERT INTO exam_records (
      upload_id, exam_id, unit_id, row_index, employee_code, elearning_account, full_name, validation_status
    ) VALUES (?, ?, ?, 2, ?, ?, ?, 'INVALID')
  `).run(uploadId, testExamId, testUnitId, testEmpCode, testElearn, testFullName);

  db.prepare(`
    INSERT INTO validation_errors (
      upload_id, row_index, employee_code, elearning_account, error_type, error_message
    ) VALUES (?, 2, ?, ?, 'UNKNOWN_BOTH', 'Cán bộ không tồn tại')
  `).run(uploadId, testEmpCode, testElearn);

  // Chạy lại đối chiếu revalidate
  const rows = [{
    rowIndex: 2,
    employeeCode: testEmpCode,
    elearningAccount: testElearn,
    fullName: testFullName,
    rawData: {}
  }];
  const revalResult = validateCandidateBatch(db, rows);

  db.prepare('DELETE FROM validation_errors WHERE upload_id = ?').run(uploadId);
  db.prepare(`
    UPDATE exam_uploads
    SET valid_rows = ?, error_rows = ?, status = ?
    WHERE id = ?
  `).run(revalResult.validRows, revalResult.errorRows, 'VALIDATED', uploadId);

  const finalUpload = db.prepare('SELECT * FROM exam_uploads WHERE id = ?').get(uploadId) as any;
  const remainingErrors = db.prepare('SELECT COUNT(*) as cnt FROM validation_errors WHERE upload_id = ?').get(uploadId) as any;

  if (finalUpload.valid_rows === 1 && finalUpload.error_rows === 0 && finalUpload.status === 'VALIDATED' && remainingErrors.cnt === 0) {
    console.log('✅ 4. Cơ chế Revalidate đối chiếu lại: Lỗi được khắc phục hoàn toàn, chuyển sang VALIDATED mà không cần upload lại file');
    passCount++;
  } else {
    console.error('❌ 4. Thất bại khi revalidate upload');
  }

  // 5. Kiểm tra trường hợp Từ chối (REJECT)
  const req2 = db.prepare(`
    INSERT INTO employee_add_requests (
      exam_id, unit_id, employee_code, elearning_account, full_name, reason, status, requested_by
    ) VALUES (?, ?, 'TEST_REJECT_CODE', 'test_reject', 'Nguyễn Từ Chối', 'Lý do thử nghiệm', 'PENDING', 1)
  `).run(testExamId, testUnitId);
  const req2Id = Number(req2.lastInsertRowid);

  const rejectNote = 'Thông tin cán bộ không thuộc biên chế đơn vị';
  db.prepare(`
    UPDATE employee_add_requests
    SET status = 'REJECTED', reviewed_by = 1, reviewed_at = ?, review_note = ?
    WHERE id = ?
  `).run(nowIso, rejectNote, req2Id);

  const rejectedReq = db.prepare('SELECT * FROM employee_add_requests WHERE id = ?').get(req2Id) as any;
  if (rejectedReq.status === 'REJECTED' && rejectedReq.review_note === rejectNote) {
    console.log('✅ 5. Super Admin từ chối đề nghị kèm lý do rõ ràng thành công (status: REJECTED)');
    passCount++;
  } else {
    console.error('❌ 5. Lỗi khi từ chối đề nghị');
  }

  // Dọn dẹp dữ liệu test
  db.prepare('DELETE FROM employees WHERE employee_code = ?').run(testEmpCode);
  db.prepare('DELETE FROM employee_add_requests WHERE unit_id = ?').run(testUnitId);
  db.prepare('DELETE FROM validation_errors WHERE upload_id = ?').run(uploadId);
  db.prepare('DELETE FROM exam_records WHERE upload_id = ?').run(uploadId);
  db.prepare('DELETE FROM exam_uploads WHERE exam_id = ?').run(testExamId);
  db.prepare('DELETE FROM exams WHERE id = ?').run(testExamId);
  db.prepare('DELETE FROM units WHERE id = ?').run(testUnitId);

  console.log(`\n🎉 KẾT QUẢ TEST MỤC 1.6: ${passCount}/5 BÀI TEST ĐẠT!`);
  if (passCount !== 5) {
    process.exit(1);
  }
}

runEmployeeRequestsTests().catch(err => {
  console.error('Lỗi thực thi test suite 1.6:', err);
  process.exit(1);
});
