import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { isWindowOpen } from '../src/lib/deadline';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('================================================================');
console.log('   BẮT ĐẦU CHẠY BỘ KIỂM THỬ TỰ ĐỘNG: HẠN CHÓT & GIA HẠN (1.1)');
console.log('================================================================');

// 1. Tạo đơn vị test A và B
db.prepare("DELETE FROM deadline_extensions WHERE target_type = 'EXAM' AND target_id = 9999").run();
db.prepare("DELETE FROM exams WHERE id = 9999").run();

// Lấy 2 units
const units = db.prepare("SELECT id, unit_code FROM units LIMIT 2").all() as any[];
const unitA = units[0];
const unitB = units[1];

// TEST 1: Kỳ thi CLOSED -> isWindowOpen trả về isOpen = false
db.prepare(`
  INSERT INTO exams (id, code, title, status)
  VALUES (9999, 'EXAM_TEST_9999', 'Kỳ thi Test 9999', 'CLOSED')
`).run();

let check = isWindowOpen('EXAM', 9999, unitA.id);
if (check.isOpen) {
  throw new Error('FAIL: Kỳ thi CLOSED nhưng isWindowOpen vẫn trả về isOpen = true!');
}
console.log('[PASS] TEST 1: Kỳ thi CLOSED -> Hệ thống từ chối mở nhận dữ liệu.');

// TEST 2: Kỳ thi có start_at trong tương lai -> Chưa tới hạn mở -> isOpen = false
const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
db.prepare(`
  UPDATE exams
  SET status = 'OPEN', start_at = ?
  WHERE id = 9999
`).run(futureDate);

check = isWindowOpen('EXAM', 9999, unitA.id);
if (check.isOpen) {
  throw new Error('FAIL: start_at ở tương lai nhưng isWindowOpen vẫn báo mở!');
}
console.log('[PASS] TEST 2: Kỳ thi có start_at trong tương lai -> Chặn tiếp nhận dữ liệu trước giờ.');

// TEST 3: Kỳ thi có start_at trong quá khứ và end_at trong quá khứ -> Quá hạn chót -> isOpen = false
const pastStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
const pastEnd = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
db.prepare(`
  UPDATE exams
  SET start_at = ?, end_at = ?
  WHERE id = 9999
`).run(pastStart, pastEnd);

check = isWindowOpen('EXAM', 9999, unitA.id);
if (check.isOpen) {
  throw new Error('FAIL: end_at đã qua nhưng isWindowOpen vẫn báo mở!');
}
console.log('[PASS] TEST 3: Kỳ thi đã quá hạn chót end_at -> Chặn tiếp nhận dữ liệu quá hạn.');

// TEST 4: Cấp gia hạn riêng cho Unit A đến ngày mai -> Unit A isOpen = true, Unit B vẫn isOpen = false
const extendedDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
db.prepare(`
  INSERT INTO deadline_extensions (unit_id, target_type, target_id, new_end_at, reason)
  VALUES (?, 'EXAM', 9999, ?, 'Gia hạn riêng phục vụ rà soát')
`).run(unitA.id, extendedDate);

const checkUnitA = isWindowOpen('EXAM', 9999, unitA.id);
const checkUnitB = isWindowOpen('EXAM', 9999, unitB.id);

if (!checkUnitA.isOpen || !checkUnitA.isExtended) {
  throw new Error('FAIL: Đơn vị A được cấp gia hạn nhưng isWindowOpen không nhận diện được!');
}
if (checkUnitB.isOpen) {
  throw new Error('FAIL: Đơn vị B không được gia hạn nhưng lại được mở!');
}
console.log('[PASS] TEST 4: Cấp gia hạn riêng cho Đơn vị A -> Đơn vị A được nộp tiếp, Đơn vị B bị khóa.');

// TEST 5: Đợt khảo sát collections không tồn tại -> isOpen = false
const checkColl = isWindowOpen('COLLECTION', 88888, unitA.id);
if (checkColl.isOpen) {
  throw new Error('FAIL: Collection không tồn tại nhưng báo mở!');
}
console.log('[PASS] TEST 5: Đợt khảo sát không tồn tại -> Từ chối hợp lệ.');

// Dọn dẹp
db.prepare("DELETE FROM deadline_extensions WHERE target_type = 'EXAM' AND target_id = 9999").run();
db.prepare("DELETE FROM exams WHERE id = 9999").run();

console.log('================================================================');
console.log('   KẾT QUẢ: 5/5 BÀI TEST HẠN CHÓT & GIA HẠN ĐÃ ĐẠT (100% PASS)');
console.log('================================================================');
