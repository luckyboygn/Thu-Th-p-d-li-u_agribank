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

      // Kiểm tra và tự động vá catalog 818 chuyên đề nếu DB tải về từ Cloud bị thiếu metadata
      try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(localDbPath);
        // Chạy migration schema
        const cols = db.prepare('PRAGMA table_info(training_program_topics)').all();
        const colNames = cols.map(c => c.name);
        const newCols = {
          position_code: 'TEXT',
          learning_path: 'TEXT',
          competency: 'TEXT',
          certificate_requirement: 'TEXT',
          cert_planning_higher: 'TEXT',
          cert_appoint_higher: 'TEXT',
          cert_reappoint: 'TEXT'
        };
        for (const [col, type] of Object.entries(newCols)) {
          if (!colNames.includes(col)) {
            db.exec(`ALTER TABLE training_program_topics ADD COLUMN ${col} ${type};`);
          }
        }
        
        // Kiểm tra xem đã đủ metadata chưa
        const check = db.prepare("SELECT count(*) as cnt FROM training_program_topics WHERE position_code IS NOT NULL AND position_code != '' AND learning_path IS NOT NULL AND learning_path != ''").get();
        if (!check || check.cnt < 700) {
          console.log('[Cloud Sync] DB từ Cloud thiếu metadata chuyên đề. Đang tự động nạp từ master-topics-data.json...');
          const masterJsonPath = path.resolve(__dirname, '../src/lib/master-topics-data.json');
          if (fs.existsSync(masterJsonPath)) {
            const masterTopics = JSON.parse(fs.readFileSync(masterJsonPath, 'utf8'));
            const dbTopics = db.prepare("SELECT t.id, t.topic_name, p.code as prog_code FROM training_program_topics t JOIN training_programs p ON t.program_id = p.id").all();
            const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            const tMap = new Map();
            for (const t of dbTopics) {
              const k = `${norm(t.prog_code)}||${norm(t.topic_name)}`;
              if (!tMap.has(k)) tMap.set(k, []);
              tMap.get(k).push(t);
              const fallbackKey = norm(t.topic_name);
              if (!tMap.has(fallbackKey)) tMap.set(fallbackKey, []);
              tMap.get(fallbackKey).push(t);
            }
            const updateStmt = db.prepare(`
              UPDATE training_program_topics
              SET position_code = ?, delivery_method = ?, duration = ?, learning_path = ?, competency = ?, certificate_requirement = ?, cert_planning_higher = ?, cert_appoint_higher = ?, cert_reappoint = ?
              WHERE id = ?
            `);
            let countUpdated = 0;
            for (const mt of masterTopics) {
              const k = `pl_${norm(mt.progCode)}||${norm(mt.topicName)}`;
              const list = tMap.get(k) || tMap.get(norm(mt.topicName));
              if (list && list.length > 0) {
                const target = list.find(x => x.prog_code.includes(mt.progCode)) || list[0];
                updateStmt.run(mt.positionCode||'', mt.deliveryMethod||'', mt.duration||'', mt.learningPath||'', mt.competency||'', mt.certificateRequirement||'', mt.certPlanningHigher||'', mt.certAppointHigher||'', mt.certReappoint||'', target.id);
                countUpdated++;
              }
            }
            console.log(`[Cloud Sync] ✅ Đã cập nhật ${countUpdated}/${masterTopics.length} chuyên đề chuẩn.`);
            db.close();

            // Đẩy lại file SQLite đã hoàn thiện lên Cloud Storage!
            console.log(`[Cloud Sync] Đang đồng bộ bản hoàn thiện lên Cloud Storage...`);
            const fileStream = fs.createReadStream(localDbPath);
            await s3.send(new PutObjectCommand({
              Bucket: bucketName,
              Key: remoteKey,
              Body: fileStream,
            }));
            console.log(`[Cloud Sync] ✅ Đã đồng bộ bản hoàn thiện lên Cloud Storage thành công!`);
          } else {
            db.close();
          }
        } else {
          db.close();
        }
      } catch (err) {
        console.warn('[Cloud Sync] Lỗi cập nhật master catalog:', err.message);
      }
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
