/**
 * src/lib/cloud-sync.ts
 * Module đồng bộ cơ sở dữ liệu SQLite lên Cloudflare R2 / AWS S3.
 * Tự động sao lưu an toàn (VACUUM INTO) và đẩy lên cloud định kỳ hoặc sau khi có thao tác ghi quan trọng.
 */

import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getDatabase } from './db';

let isSyncing = false;
let lastSyncTime = 0;
const MIN_SYNC_INTERVAL_MS = 15000; // Giới hạn tối thiểu 15 giây giữa 2 lần sync để tránh dồn dập

function getS3Client(): S3Client | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    endpoint: endpoint,
    region: process.env.S3_REGION || 'auto',
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
    forcePathStyle: true,
  });
}

/**
 * Tạo snapshot SQLite an toàn bằng VACUUM INTO và đẩy lên Cloud Storage
 */
export async function triggerCloudSync(): Promise<boolean> {
  const s3 = getS3Client();
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!s3 || !bucketName) {
    // Không cấu hình S3, bỏ qua
    return false;
  }

  const now = Date.now();
  if (isSyncing || now - lastSyncTime < MIN_SYNC_INTERVAL_MS) {
    // Đang có tiến trình đồng bộ hoặc vừa mới đồng bộ xong, bỏ qua
    return false;
  }

  isSyncing = true;
  const remoteKey = process.env.S3_DB_KEY || 'database.sqlite';

  try {
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const tempSnapshotPath = path.join(backupDir, `sync_snapshot_${now}.sqlite`);

    // 1. Tạo bản snapshot SQLite nhất quán an toàn (không lock database đang chạy)
    const db = getDatabase();
    db.exec(`VACUUM INTO '${tempSnapshotPath.replace(/\\/g, '/')}';`);

    // 2. Upload file snapshot lên Cloud Storage
    const fileStream = fs.createReadStream(tempSnapshotPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: remoteKey,
        Body: fileStream,
      })
    );

    lastSyncTime = Date.now();
    console.log(`[Cloud Sync] ✅ Đã đồng bộ thành công database mới nhất lên Cloud Storage (${remoteKey}) lúc ${new Date().toISOString()}`);

    // 3. Xóa file snapshot tạm
    try {
      fs.unlinkSync(tempSnapshotPath);
    } catch (e) {}

    return true;
  } catch (err: any) {
    console.error('[Cloud Sync - LỖI] Không thể đồng bộ lên Cloud Storage:', err.message);
    return false;
  } finally {
    isSyncing = false;
  }
}

// Bật bộ đếm thời gian tự động đồng bộ định kỳ mỗi 10 phút (nếu đang chạy trên server)
if (typeof setInterval !== 'undefined' && process.env.NODE_ENV === 'production') {
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  setInterval(() => {
    triggerCloudSync().catch(() => {});
  }, TEN_MINUTES_MS);
}
