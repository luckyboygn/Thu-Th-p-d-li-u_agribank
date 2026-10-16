import fs from 'fs';
import path from 'path';
import { signToken, UserSession } from '../src/lib/auth';
import { getDatabase } from '../src/lib/db';

async function main() {
  const db = getDatabase();
  const adminUser = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as any;
  const mockSession: UserSession = {
    id: adminUser.id,
    username: adminUser.username,
    fullName: adminUser.full_name,
    role: 'SUPER_ADMIN',
    unitId: null,
    tokenVersion: adminUser.token_version || 1
  };
  const token = signToken(mockSession);

  const file1 = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f/.user_uploaded/media_1792119131499_7e33df11.xlsx';
  const file2 = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f/.user_uploaded/media_1792119131500_80e13513.xlsx';

  async function testUpload(filePath: string, label: string) {
    console.log('\n=========================================');
    console.log('TESTING API WITH:', label);
    const fileBytes = fs.readFileSync(filePath);
    const blob = new Blob([fileBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const formData = new FormData();
    formData.append('file', blob, path.basename(filePath));
    formData.append('unitId', '1');
    formData.append('mode', 'preview');

    const res = await fetch('http://localhost:3000/api/training-demand/import-excel', {
      method: 'POST',
      headers: {
        'cookie': 'auth_token=' + token
      },
      body: formData
    });

    console.log('HTTP Status:', res.status);
    const json = await res.json();
    console.log('Response:', JSON.stringify(json, null, 2));
  }

  await testUpload(file1, 'FILE 1 (7e33df11)');
  await testUpload(file2, 'FILE 2 (80e13513)');
}

main().catch(err => {
  console.error('Lỗi khi chạy test:', err);
  process.exit(1);
});
