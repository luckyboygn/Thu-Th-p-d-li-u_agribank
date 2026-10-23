import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/training-reports/route';
import { signToken } from '../src/lib/auth';
import { getDatabase } from '../src/lib/db';
import * as assert from 'assert';

async function runRegressionTests() {
  console.log('--- STARTING TOPIC REPORT REGRESSION TESTS ---');
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

  const headers = { cookie: `auth_token=${token}` };

  // Test 1: BY_TOPIC with valid topicId=46
  console.log('Test 1: GET /api/training-reports?type=BY_TOPIC&topicId=46');
  const req1 = new NextRequest('http://localhost:3000/api/training-reports?type=BY_TOPIC&topicId=46', { headers });
  const res1 = await GET(req1);
  assert.strictEqual(res1.status, 200, 'Expected status 200 for valid topic 46');
  const json1 = await res1.json();
  assert.ok(json1.topic, 'Topic object must exist');
  assert.strictEqual(json1.topic.id, 46);
  assert.strictEqual(json1.totalDemand, 24, 'Total demand should be 24');
  assert.strictEqual(json1.unitCount, 1, 'Unit count should be 1');
  assert.strictEqual(json1.unitDemands.length, 1, 'Unit demands length should be 1');
  assert.strictEqual(json1.unitDemands[0].unit_code, '1482');
  assert.strictEqual(json1.unitDemands[0].participant_count, 24);
  console.log('✅ Test 1 Passed: Topic 46 returned correct statistics & unit breakdown.');

  // Test 2: BY_TOPIC missing topicId
  console.log('Test 2: GET /api/training-reports?type=BY_TOPIC (missing topicId)');
  const req2 = new NextRequest('http://localhost:3000/api/training-reports?type=BY_TOPIC', { headers });
  const res2 = await GET(req2);
  assert.strictEqual(res2.status, 400, 'Expected status 400 when topicId is missing');
  const json2 = await res2.json();
  assert.ok(json2.error, 'Should return error message');
  console.log('✅ Test 2 Passed: Missing topicId returns HTTP 400.');

  // Test 3: BY_TOPIC with non-existent topicId
  console.log('Test 3: GET /api/training-reports?type=BY_TOPIC&topicId=999999');
  const req3 = new NextRequest('http://localhost:3000/api/training-reports?type=BY_TOPIC&topicId=999999', { headers });
  const res3 = await GET(req3);
  assert.strictEqual(res3.status, 404, 'Expected status 404 for non-existent topic');
  const json3 = await res3.json();
  assert.ok(json3.error, 'Should return error message');
  console.log('✅ Test 3 Passed: Non-existent topic returns HTTP 404.');

  // Test 4: EXPORT_EXCEL with exportFormat=BY_TOPIC&topicId=46
  console.log('Test 4: GET /api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_TOPIC&topicId=46');
  const req4 = new NextRequest('http://localhost:3000/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_TOPIC&topicId=46', { headers });
  const res4 = await GET(req4);
  assert.strictEqual(res4.status, 200, 'Expected status 200 for Excel export');
  const contentType = res4.headers.get('Content-Type');
  assert.ok(contentType?.includes('spreadsheetml.sheet'), 'Content-Type should be xlsx');
  const contentDisp = res4.headers.get('Content-Disposition');
  assert.ok(contentDisp?.includes('attachment; filename='), 'Content-Disposition should be attachment');
  const blob = await res4.arrayBuffer();
  assert.ok(blob.byteLength > 1000, 'Excel buffer must not be empty');
  console.log('✅ Test 4 Passed: Excel export generated valid xlsx binary of size', blob.byteLength, 'bytes.');

  // Test 5: Topic with 0 registrations (e.g. topicId=100)
  console.log('Test 5: GET /api/training-reports?type=BY_TOPIC&topicId=100 (0 registrations)');
  const req5 = new NextRequest('http://localhost:3000/api/training-reports?type=BY_TOPIC&topicId=100', { headers });
  const res5 = await GET(req5);
  assert.strictEqual(res5.status, 200, 'Expected status 200 for topic with 0 demand');
  const json5 = await res5.json();
  assert.strictEqual(json5.totalDemand, 0, 'Total demand should be 0');
  assert.strictEqual(json5.unitCount, 0, 'Unit count should be 0');
  assert.strictEqual(json5.unitDemands.length, 0, 'Unit demands length should be 0');

  // Test 5b: Excel export for topic with 0 registrations
  const req5b = new NextRequest('http://localhost:3000/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_TOPIC&topicId=100', { headers });
  const res5b = await GET(req5b);
  assert.strictEqual(res5b.status, 200, 'Expected status 200 for Excel export of topic with 0 demand');
  const blob5b = await res5b.arrayBuffer();
  assert.ok(blob5b.byteLength > 1000, 'Excel buffer must be created even for 0 demand');
  console.log('✅ Test 5 Passed: Topic with 0 registrations handled cleanly in API and Excel export.');

  console.log('--- ALL TOPIC REPORT REGRESSION TESTS PASSED SUCCESSFULLY! ---');
}

runRegressionTests().catch(err => {
  console.error('❌ Regression test failed:', err);
  process.exit(1);
});
