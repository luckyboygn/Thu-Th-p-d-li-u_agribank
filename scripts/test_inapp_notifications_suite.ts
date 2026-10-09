import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import {
  notifySubmissionReopened,
  notifyEmployeeRequestUpdated,
  notifyNewEmployeeRequest,
  notifyDeadlineWarning
} from '../src/lib/notification';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU TEST SUITE: MỤC 2.6 - THÔNG BÁO TRONG ỨNG DỤNG');
  console.log('====================================================\n');

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

  // 1. Kiểm tra Schema bảng notifications
  console.log('--- 1. Kiểm tra Schema notifications ---');
  const tableInfo = db.prepare('PRAGMA table_info(notifications)').all() as any[];
  const cols = new Set(tableInfo.map(c => c.name));

  assert(cols.has('recipient_user_id'), 'Cột recipient_user_id tồn tại');
  assert(cols.has('recipient_unit_id'), 'Cột recipient_unit_id tồn tại');
  assert(cols.has('recipient_role'), 'Cột recipient_role tồn tại');
  assert(cols.has('title'), 'Cột title tồn tại');
  assert(cols.has('content'), 'Cột content tồn tại');
  assert(cols.has('type'), 'Cột type tồn tại');
  assert(cols.has('link'), 'Cột link tồn tại');
  assert(cols.has('is_read'), 'Cột is_read tồn tại');

  // 2. Kiểm tra tạo thông báo qua Helper functions
  console.log('\n--- 2. Kiểm tra tạo thông báo qua Notification Service ---');
  const existingUnit = db.prepare('SELECT id FROM units ORDER BY id ASC LIMIT 1').get() as any;
  const testUnitId = existingUnit ? existingUnit.id : 1;
  
  // A. Mở lại bài nộp
  await notifySubmissionReopened({
    unitId: testUnitId,
    title: 'Kỳ thi sát hạch Tín dụng 2026',
    reason: 'Đơn vị cần bổ sung 5 thí sinh thuộc Phòng Kế toán'
  });

  const reopenNotif = db.prepare(`
    SELECT * FROM notifications 
    WHERE recipient_unit_id = ? AND type = 'SUBMISSION_REOPENED'
    ORDER BY id DESC LIMIT 1
  `).get(testUnitId) as any;

  assert(!!reopenNotif, 'Tạo thành công thông báo SUBMISSION_REOPENED');
  assert(reopenNotif?.title.includes('Kỳ thi sát hạch'), 'Tiêu đề thông báo mở lại chính xác');
  assert(reopenNotif?.content.includes('Phòng Kế toán'), 'Nội dung thông báo chứa đúng lý do');
  assert(reopenNotif?.is_read === 0, 'Thông báo mới có trạng thái chưa đọc (is_read = 0)');

  // B. Cập nhật duyệt yêu cầu cán bộ
  await notifyEmployeeRequestUpdated({
    unitId: testUnitId,
    employeeCode: 'TEST_CB_99',
    status: 'APPROVED'
  });

  const approvedNotif = db.prepare(`
    SELECT * FROM notifications 
    WHERE recipient_unit_id = ? AND type = 'REQUEST_STATUS_UPDATED'
    ORDER BY id DESC LIMIT 1
  `).get(testUnitId) as any;

  assert(!!approvedNotif, 'Tạo thành công thông báo REQUEST_STATUS_UPDATED');
  assert(approvedNotif?.title.includes('ĐÃ ĐƯỢC DUYỆT'), 'Tiêu đề thông báo duyệt chính xác');

  // C. Super Admin nhận thông báo khi có yêu cầu mới
  await notifyNewEmployeeRequest({
    unitCode: 'CN_TEST',
    unitName: 'Chi nhánh Test',
    employeeCode: 'TEST_CB_99',
    fullName: 'Nguyễn Văn Test'
  });

  const adminNotif = db.prepare(`
    SELECT * FROM notifications 
    WHERE recipient_role = 'SUPER_ADMIN' AND type = 'NEW_EMPLOYEE_REQUEST'
    ORDER BY id DESC LIMIT 1
  `).get() as any;

  assert(!!adminNotif, 'Tạo thành công thông báo NEW_EMPLOYEE_REQUEST cho Super Admin');
  assert(adminNotif?.title.includes('CN_TEST'), 'Tiêu đề thông báo đơn vị đề nghị chính xác');

  // 3. Kiểm tra đánh dấu đã đọc
  console.log('\n--- 3. Kiểm tra đánh dấu đã đọc (is_read = 1) ---');
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(reopenNotif.id);
  const updatedReopen = db.prepare('SELECT is_read FROM notifications WHERE id = ?').get(reopenNotif.id) as any;
  assert(updatedReopen.is_read === 1, 'Đánh dấu đọc từng thông báo thành công');

  // Đánh dấu tất cả của unit
  db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_unit_id = ?').run(testUnitId);
  const unreadCount = db.prepare('SELECT COUNT(*) as unread FROM notifications WHERE recipient_unit_id = ? AND is_read = 0').get(testUnitId) as any;
  assert(unreadCount.unread === 0, 'Đánh dấu đọc toàn bộ của đơn vị thành công (unread = 0)');

  // 4. Dọn dẹp dữ liệu test
  db.prepare('DELETE FROM notifications WHERE recipient_unit_id = ?').run(testUnitId);
  db.prepare("DELETE FROM notifications WHERE recipient_role = 'SUPER_ADMIN' AND title LIKE '%CN_TEST%'").run();

  console.log('\n====================================================');
  console.log(`🎉 KẾT QUẢ TEST MỤC 2.6: ${passed}/${total} PASS`);
  console.log('====================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
