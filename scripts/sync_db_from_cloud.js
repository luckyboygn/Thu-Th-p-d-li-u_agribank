/**
 * scripts/sync_db_from_cloud.js
 * Tự động đồng bộ database.sqlite từ Cloudflare R2 / AWS S3 về máy chủ khi khởi động.
 * Chạy trước "next start" để đảm bảo container Render luôn có dữ liệu mới nhất.
 */

const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

async function syncDbFromCloud() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucketName = process.env.S3_BUCKET_NAME;

  // Nếu không cấu hình Cloud Storage, bỏ qua và dùng SQLite cục bộ
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    console.log('[Cloud Sync] Chưa cấu hình S3_ENDPOINT / ACCESS_KEY. Ứng dụng sẽ sử dụng file database.sqlite cục bộ.');
    return;
  }

  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const localDbPath = path.join(dataDir, 'database.sqlite');
  const remoteKey = process.env.S3_DB_KEY || 'database.sqlite';

  console.log(`[Cloud Sync] Đang kết nối tới Cloud Storage (${endpoint}, Bucket: ${bucketName})...`);

  const s3 = new S3Client({
    endpoint: endpoint,
    region: process.env.S3_REGION || 'auto',
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
    forcePathStyle: true,
  });

  try {
    // 1. Kiểm tra file trên Cloud
    let fileExistsOnCloud = false;
    try {
      await s3.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: remoteKey,
      }));
      fileExistsOnCloud = true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        fileExistsOnCloud = false;
      } else {
        throw err;
      }
    }

    if (fileExistsOnCloud) {
      console.log(`[Cloud Sync] Tìm thấy bản ghi '${remoteKey}' trên Cloud. Đang tải về...`);
      const response = await s3.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: remoteKey,
      }));

      const tempPath = path.join(dataDir, 'database.sqlite.tmp');
      const writeStream = fs.createWriteStream(tempPath);
      
      await new Promise((resolve, reject) => {
        response.Body.pipe(writeStream);
        response.Body.on('error', reject);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Thay thế file cũ bằng file mới tải về an toàn
      if (fs.existsSync(localDbPath)) {
        try { fs.unlinkSync(localDbPath); } catch (e) {}
      }
      fs.renameSync(tempPath, localDbPath);
      console.log(`[Cloud Sync] ✅ Đã khôi phục thành công '${remoteKey}' từ Cloud vào: ${localDbPath}`);
    } else {
      console.log(`[Cloud Sync] Chưa có file trên Cloud. Đang tải bản database.sqlite hiện tại lên Cloud làm bản gốc...`);
      if (fs.existsSync(localDbPath)) {
        const fileStream = fs.createReadStream(localDbPath);
        await s3.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: remoteKey,
          Body: fileStream,
        }));
        console.log(`[Cloud Sync] ✅ Đã tải bản gốc ban đầu lên Cloud thành công!`);
      } else {
        console.log(`[Cloud Sync] Không có file local để tải lên.`);
      }
    }
  } catch (err) {
    console.error(`[Cloud Sync - CẢNH BÁO] Không thể đồng bộ từ Cloud:`, err.message);
    console.log(`[Cloud Sync] Tiếp tục khởi động với cơ sở dữ liệu hiện có.`);
  }
}

syncDbFromCloud()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Cloud Sync] Lỗi không mong muốn:', err);
    process.exit(0); // Không làm sập tiến trình khởi động
  });
