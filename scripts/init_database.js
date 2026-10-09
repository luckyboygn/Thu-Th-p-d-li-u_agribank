const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
console.log('Khởi tạo Database tại:', dbPath);

const db = new DatabaseSync(dbPath);

// Đọc và chạy schema.sql
const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
db.exec(schemaSql);

// Kiểm tra danh sách bảng
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('✅ Khởi tạo thành công các bảng trong Database:');
tables.forEach(t => console.log(' - ' + t.name));

// Kiểm tra indexes
const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('✅ Khởi tạo thành công các Indexes tốc độ cao:');
indexes.forEach(idx => console.log(' - ' + idx.name));

console.log('Database sẵn sàng hoạt động!');
