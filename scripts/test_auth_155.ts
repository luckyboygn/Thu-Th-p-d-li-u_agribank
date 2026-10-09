import { authenticateUser } from '../src/lib/auth';

console.log('Testing authentication...');

const testCases = [
  { username: 'admin', pass: 'Admin@123456' },
  { username: 'viewer', pass: 'Viewer@123456' },
  { username: '2500_Admin', pass: 'Unit@123456' },
  { username: '2500_Admin', pass: '123456' },
  { username: '1500_Admin', pass: 'Unit@123456' },
  { username: '9300_Admin', pass: 'Unit@123456' },
  { username: '2500', pass: 'Unit@123456' }, // short format supported in auth.ts
];

for (const tc of testCases) {
  const session = authenticateUser(tc.username, tc.pass);
  if (session) {
    console.log(`[PASS] Login ${tc.username}: Role=${session.role}, Unit=${session.unitCode} - ${session.unitName}`);
  } else {
    console.error(`[FAIL] Login ${tc.username} failed!`);
    process.exit(1);
  }
}

console.log('ALL AUTHENTICATION TESTS PASSED!');
