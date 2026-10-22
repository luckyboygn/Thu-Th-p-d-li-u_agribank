import { NextRequest } from 'next/server';
import assert from 'assert';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { GET, POST } from '../src/app/api/backup/route';
import { signToken } from '../src/lib/auth';
import { getDatabase } from '../src/lib/db';

console.log('='.repeat(80));
console.log('BẮT ĐẦU TEST HỒI QUY: TÍNH NĂNG SAO LƯU CSDL VÀ API /api/backup');
console.log('='.repeat(80));

async function runRegressionTests() {
  const db = getDatabase();
  const adminUser = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' LIMIT 1").get() as any;
  assert(adminUser, 'Phải có user SUPER_ADMIN trong CSDL');

  const adminToken = signToken({
    id: adminUser.id,
    username: adminUser.username,
    fullName: adminUser.full_name,
    role: adminUser.role,
    unitId: adminUser.unit_id,
    tokenVersion: adminUser.token_version || 1
  });

  const unitAdmin = db.prepare("SELECT * FROM users WHERE role = 'UNIT_ADMIN' AND status = 'ACTIVE' LIMIT 1").get() as any;
  assert(unitAdmin, 'Phải có user UNIT_ADMIN trong CSDL');

  const unitAdminToken = signToken({
    id: unitAdmin.id,
    username: unitAdmin.username,
    fullName: unitAdmin.full_name,
    role: unitAdmin.role,
    unitId: unitAdmin.unit_id,
    tokenVersion: unitAdmin.token_version || 1
  });

  // TEST 1: Chưa đăng nhập -> 401
  console.log('\n[TEST 1] Gọi API khi chưa đăng nhập (kỳ vọng 401):');
  const unauthReq = new NextRequest('http://localhost:3000/api/backup', { method: 'POST' });
  const unauthRes = await POST(unauthReq);
  assert.strictEqual(unauthRes.status, 401, 'Chưa đăng nhập phải trả về 401');
  console.log('  ✅ Đúng mã 401 khi chưa đăng nhập.');

  // TEST 2: Không phải SUPER_ADMIN -> 403
  console.log('\n[TEST 2] Gọi API với quyền UNIT_ADMIN (kỳ vọng 403):');
  const forbiddenReq = new NextRequest('http://localhost:3000/api/backup', {
    method: 'POST',
    headers: { authorization: `Bearer ${unitAdminToken}` }
  });
  const forbiddenRes = await POST(forbiddenReq);
  assert.strictEqual(forbiddenRes.status, 403, 'UNIT_ADMIN phải bị chặn 403');
  console.log('  ✅ Đúng mã 403 khi không đủ quyền.');

  // TEST 3: GET /api/backup lấy danh sách bản sao lưu
  console.log('\n[TEST 3] GET /api/backup lấy danh sách bản sao lưu:');
  const getReq = new NextRequest('http://localhost:3000/api/backup', {
    method: 'GET',
    headers: { authorization: `Bearer ${adminToken}` }
  });
  const getRes = await GET(getReq);
  assert.strictEqual(getRes.status, 200, 'GET /api/backup phải trả về 200');
  const getData = await getRes.json();
  assert(Array.isArray(getData.backups), 'backups phải là mảng');
  assert(typeof getData.total === 'number', 'total phải là số');
  console.log(`  ✅ Lấy danh sách thành công: ${getData.total} bản sao lưu.`);

  // TEST 4: POST /api/backup tạo bản sao lưu thành công
  console.log('\n[TEST 4] POST /api/backup tạo bản sao lưu mới tức thì:');
  const postReq = new NextRequest('http://localhost:3000/api/backup', {
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}` }
  });
  const postRes = await POST(postReq);
  assert.strictEqual(postRes.status, 200, 'POST /api/backup phải trả về 200');

  const postText = await postRes.text();
  assert(postText && postText.length > 0, 'Response body không được rỗng');

  let postData: any;
  try {
    postData = JSON.parse(postText);
  } catch (e: any) {
    assert.fail(`Response body không phải JSON hợp lệ: ${e.message}`);
  }

  assert.strictEqual(postData.success, true, 'success phải là true');
  assert(postData.backup, 'Phải có object backup trong kết quả');
  assert(postData.backup.fileName, 'Phải có fileName');
  assert(postData.backup.filePath, 'Phải có filePath');
  assert(fs.existsSync(postData.backup.filePath), 'File sao lưu phải tồn tại trên ổ đĩa');

  // Kiểm tra toàn vẹn file vừa tạo
  const checkDb = new DatabaseSync(postData.backup.filePath, { readOnly: true });
  const checkRes = checkDb.prepare('PRAGMA integrity_check').all() as any[];
  checkDb.close();
  assert.strictEqual(checkRes[0]?.integrity_check, 'ok', 'PRAGMA integrity_check của file backup phải là ok');

  console.log(`  ✅ Tạo thành công file: ${postData.backup.fileName} (${postData.backup.sizeMB} MB).`);
  console.log(`  ✅ File tồn tại trên đĩa và đạt PRAGMA integrity_check = ok.`);

  console.log('\n' + '='.repeat(80));
  console.log('TẤT CẢ 4/4 CA KIỂM THỬ HỒI QUY ĐỀU ĐẠT CHUẨN 100% (PASS)!');
  console.log('='.repeat(80));
}

runRegressionTests().catch(err => {
  console.error('Test thất bại:', err);
  process.exit(1);
});
