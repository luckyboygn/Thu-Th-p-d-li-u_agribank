const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const XLSX = require('xlsx');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

const rows = db.prepare(`
  SELECT 
    u.id, 
    u.username, 
    u.full_name, 
    u.role, 
    u.status,
    un.unit_code,
    un.unit_name
  FROM users u
  LEFT JOIN units un ON u.unit_id = un.id
  ORDER BY 
    CASE u.role 
      WHEN 'SUPER_ADMIN' THEN 1 
      WHEN 'VIEWER' THEN 2 
      ELSE 3 
    END,
    CAST(un.unit_code AS INTEGER) ASC,
    un.unit_code ASC
`).all();

const data = rows.map((r, index) => {
  let password = 'Unit@123456';
  let roleName = 'Đơn vị';

  if (r.role === 'SUPER_ADMIN') {
    password = 'Admin@123456';
    roleName = 'Quản trị viên Hệ thống (Admin)';
  } else if (r.role === 'VIEWER') {
    password = 'Viewer@123456';
    roleName = 'Cán bộ Giám sát Toàn hệ thống (Viewer)';
  } else if (r.role === 'UNIT_ADMIN') {
    roleName = 'Quản trị Đơn vị (Unit Admin)';
  }

  return {
    'STT': index + 1,
    'Mã đơn vị': r.unit_code || '-',
    'Tên đơn vị': r.unit_name || (r.role === 'SUPER_ADMIN' ? 'Trụ sở chính' : 'Toàn hệ thống'),
    'Họ và tên': r.full_name,
    'Tên đăng nhập': r.username,
    'Mật khẩu khởi tạo': password,
    'Vai trò': roleName,
    'Trạng thái': r.status === 'ACTIVE' ? 'Đang hoạt động' : r.status,
    'Ghi chú': r.role === 'SUPER_ADMIN' ? 'Tài khoản toàn quyền quản trị' : (r.role === 'VIEWER' ? 'Chỉ xem báo cáo toàn hệ thống' : 'Tài khoản kê khai & lập nhu cầu')
  };
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(data);

// Căn chỉnh độ rộng cột tự động
const colWidths = [
  { wch: 6 },  // STT
  { wch: 12 }, // Mã đơn vị
  { wch: 40 }, // Tên đơn vị
  { wch: 35 }, // Họ và tên
  { wch: 18 }, // Tên đăng nhập
  { wch: 20 }, // Mật khẩu
  { wch: 38 }, // Vai trò
  { wch: 16 }, // Trạng thái
  { wch: 40 }, // Ghi chú
];
ws['!cols'] = colWidths;

XLSX.utils.book_append_sheet(wb, ws, 'Danh sách Tài khoản');

const exportDir = path.join(process.cwd(), 'exports');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

const outputPath = path.join(exportDir, 'Danh_sach_tai_khoan_Agribank.xlsx');
XLSX.writeFile(wb, outputPath);

console.log('--- XUẤT FILE EXCEL THÀNH CÔNG ---');
console.log('Tổng số tài khoản:', data.length);
console.log('Đường dẫn file:', outputPath);
