import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import * as xlsx from 'xlsx';
import { logAudit } from '../src/lib/audit';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU TEST SUITE: MỤC 2.5 - AUDIT LOG ĐẦY ĐỦ');
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

  // 1. Kiểm tra Schema audit_logs
  console.log('--- 1. Kiểm tra Schema audit_logs (entity_type, entity_id) ---');
  const tableInfo = db.prepare('PRAGMA table_info(audit_logs)').all() as any[];
  const cols = new Set(tableInfo.map(c => c.name));

  assert(cols.has('entity_type'), 'Cột audit_logs.entity_type đã tồn tại');
  assert(cols.has('entity_id'), 'Cột audit_logs.entity_id đã tồn tại');

  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='audit_logs'").all() as any[];
  const indexNames = new Set(indexes.map(i => i.name));
  assert(indexNames.has('idx_audit_logs_entity'), 'Index idx_audit_logs_entity đã tồn tại');
  assert(indexNames.has('idx_audit_logs_action'), 'Index idx_audit_logs_action đã tồn tại');

  // 2. Kiểm tra ghi log với entity_type & entity_id
  console.log('\n--- 2. Kiểm tra ghi log kiểm toán với Entity ---');
  const testAction = 'TEST_AUDIT_ACTION_25';
  const testEntityType = 'TEST_ENTITY';
  const testEntityId = 'ID_99999';

  logAudit({
    userId: 1,
    username: 'test_admin',
    unitId: 1,
    action: testAction,
    entityType: testEntityType,
    entityId: testEntityId,
    details: { reason: 'Kiểm thử mục 2.5', status: 'OK' },
    ipAddress: '127.0.0.1'
  });

  const insertedLog = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE action = ? AND entity_type = ? AND entity_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(testAction, testEntityType, testEntityId) as any;

  assert(!!insertedLog, 'Log đã được ghi thành công vào CSDL');
  assert(insertedLog?.username === 'test_admin', 'Đúng username');
  assert(insertedLog?.entity_type === testEntityType, 'Đúng entity_type');
  assert(insertedLog?.entity_id === testEntityId, 'Đúng entity_id');
  assert(insertedLog?.details.includes('Kiểm thử mục 2.5'), 'Đúng thông tin details JSON');

  // 3. Kiểm tra lọc đa tiêu chí
  console.log('\n--- 3. Kiểm tra truy vấn lọc đa tiêu chí ---');
  const filterByAction = db.prepare('SELECT COUNT(*) as c FROM audit_logs WHERE action = ?').get(testAction) as any;
  assert(filterByAction.c >= 1, 'Lọc thành công theo action');

  const filterByEntity = db.prepare('SELECT COUNT(*) as c FROM audit_logs WHERE entity_type = ?').get(testEntityType) as any;
  assert(filterByEntity.c >= 1, 'Lọc thành công theo entity_type');

  const filterByDate = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE date(created_at) = date('now')").get() as any;
  assert(filterByDate.c >= 1, 'Lọc thành công theo ngày');

  // 4. Kiểm tra cấu trúc xuất Excel
  console.log('\n--- 4. Kiểm tra sinh dữ liệu xuất Excel ---');
  const logsToExport = db.prepare(`
    SELECT l.*, u.unit_code, u.unit_name
    FROM audit_logs l
    LEFT JOIN units u ON l.unit_id = u.id
    WHERE l.action = ?
  `).all(testAction) as any[];

  const exportRows = logsToExport.map((log, idx) => ({
    'STT': idx + 1,
    'Thời gian ghi nhận': log.created_at,
    'Người thực hiện': log.username,
    'Hành động': log.action,
    'Loại đối tượng': log.entity_type,
    'Mã đối tượng': log.entity_id,
    'Chi tiết nhật ký': log.details
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(exportRows);
  xlsx.utils.book_append_sheet(wb, ws, 'Nhat_Ky_Kiem_Toan');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  assert(buf.length > 0, 'Sinh buffer Excel thành công');
  const readWb = xlsx.read(buf, { type: 'buffer' });
  assert(readWb.SheetNames.includes('Nhat_Ky_Kiem_Toan'), 'Workbook chứa đúng sheet Nhat_Ky_Kiem_Toan');

  // Dọn dẹp bản ghi test
  db.prepare('DELETE FROM audit_logs WHERE action = ?').run(testAction);

  console.log('\n====================================================');
  console.log(`🎉 KẾT QUẢ TEST MỤC 2.5: ${passed}/${total} PASS`);
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
