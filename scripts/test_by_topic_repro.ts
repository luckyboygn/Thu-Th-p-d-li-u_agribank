import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/training-reports/route';
import { signToken } from '../src/lib/auth';
import { getDatabase } from '../src/lib/db';

async function testByTopicApi() {
  const db = getDatabase();
  const admin = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as any;
  const token = signToken({
    id: admin.id,
    username: admin.username,
    fullName: admin.full_name,
    role: admin.role,
    unitId: admin.unit_id,
    tokenVersion: admin.token_version || 1
  });

  const req = new NextRequest('http://localhost:3000/api/training-reports?type=BY_TOPIC&topicId=46', {
    headers: {
      cookie: `auth_token=${token}`
    }
  });

  const res = await GET(req);
  console.log('Status code:', res.status);
  const json = await res.json();
  console.log('Response JSON:', json);
}

testByTopicApi();
