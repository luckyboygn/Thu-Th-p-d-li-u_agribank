const xlsx = require('xlsx');
const path = require('path');

const wb = xlsx.utils.book_new();

// Sheet 1: Bảng dữ liệu người dùng trung tâm
const headers = [
  'STT',
  'Mã cán bộ',
  'Họ và tên',
  'Tên đăng nhập',
  'Mã đơn vị',
  'Tên đơn vị',
  'Ghi chú'
];

const sampleRows = [
  [
    1,
    '200733604',
    'Nguyễn Thị Thu Hà',
    'hantt',
    '8802',
    'Chi nhánh Lào Cai II',
    'Dòng mẫu 1'
  ],
  [
    2,
    '200733869',
    'Chu Mạnh Hùng',
    'hungchumanh',
    '8802',
    'Chi nhánh Lào Cai II',
    'Dòng mẫu 2'
  ],
  [
    3,
    '200903092',
    'Nguyễn Văn A',
    'abc123',
    '3160',
    'Chi nhánh Sóc Sơn',
    'Dòng mẫu 3'
  ]
];

const wsData = [headers, ...sampleRows];
const ws = xlsx.utils.aoa_to_sheet(wsData);

ws['!cols'] = [
  { wch: 6 },  // STT
  { wch: 18 }, // Mã cán bộ (Unique)
  { wch: 26 }, // Họ và tên
  { wch: 22 }, // Tên đăng nhập (eLearning Unique)
  { wch: 14 }, // Mã đơn vị
  { wch: 30 }, // Tên đơn vị
  { wch: 26 }, // Ghi chú
];

xlsx.utils.book_append_sheet(wb, ws, 'Danh_Sach_Nguoi_Dung');

// Sheet 2: Hướng dẫn chi tiết
const guideData = [
  ['HƯỚNG DẪN THIẾT LẬP FILE DATABASE CÁN BỘ TRUNG TÂM (NGUỒN ĐỐI CHIẾU 34.000 NGƯỜI)'],
  [''],
  ['1. NGUYÊN TẮC QUAN TRỌNG NHẤT (QUAN HỆ 1 - 1):'],
  ['- Mỗi Mã cán bộ chỉ có DUY NHẤT 01 Tên đăng nhập (Tài khoản eLearning).'],
  ['- Mỗi Tên đăng nhập chỉ thuộc về DUY NHẤT 01 Mã cán bộ.'],
  ['- Tuyệt đối KHÔNG có trường hợp 1 mã cán bộ gán 2 eLearning hoặc 1 eLearning thuộc 2 cán bộ.'],
  ['- Hai cột "Mã cán bộ" và "Tên đăng nhập" là 2 trường bắt buộc, không được để trống.'],
  [''],
  ['2. KIỂM TRA CHẤT LƯỢNG TỰ ĐỘNG KHI IMPORT:'],
  ['- Khi Quản trị viên nạp file này vào hệ thống, hệ thống sẽ tự động quét toàn bộ file.'],
  ['- Nếu phát hiện bất kỳ trường hợp trùng lặp hoặc vi phạm quan hệ 1-1, hệ thống sẽ từ chối nạp và chỉ rõ số dòng lỗi.'],
  [''],
  ['3. Ý NGHĨA NGHIỆP VỤ:'],
  ['- Database này là NGUỒN XÁC THỰC DUY NHẤT cho toàn bộ 162 chi nhánh khi nộp danh sách.'],
  ['- Tất cả file danh sách do các đơn vị nộp lên sẽ được đối chiếu 2 chiều với Database này.'],
  [''],
  ['4. CÁCH NẠP VÀO HỆ THỐNG:'],
  ['- Bước 1: Điền dữ liệu toàn bộ cán bộ vào sheet "Danh_Sach_Nguoi_Dung" (có thể xóa 3 dòng mẫu).'],
  ['- Bước 2: Vào Web App -> Đăng nhập admin -> Bấm "Database Trung Tâm" -> Bấm "Chọn file Excel Master".']
];

const wsGuide = xlsx.utils.aoa_to_sheet(guideData);
wsGuide['!cols'] = [{ wch: 100 }];
xlsx.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan_Database_Goc');

const outPath = path.join(__dirname, '..', 'sample_data', 'Mau_Database_Can_Bo_Trung_Tam.xlsx');
xlsx.writeFile(wb, outPath);
console.log('Đã tạo thành công file mẫu Master Database tại:', outPath);
