const xlsx = require('xlsx');
const path = require('path');

function createTemplateWorkbook(unitCode = '', unitName = '') {
  const wb = xlsx.utils.book_new();

  // Sheet 1: Mẫu đăng ký
  const headers = [
    'STT',
    'Mã đơn vị',
    'Ca kiểm tra',
    'Ngày kiểm tra',
    'Mã cán bộ',
    'Họ và tên',
    'Chức danh/chức vụ',
    'Nghiệp vụ đăng ký kiểm tra',
    'Điện thoại di động',
    'Tài khoản E-learning',
    'Ghi chú'
  ];

  const sampleData = [
    [
      1,
      unitCode || '8802',
      'Ca 1',
      '19/09/2026',
      '200733604',
      'Nguyễn Thị Thu Hà',
      'Nhân viên',
      'Kế toán',
      '0912345678',
      'hantt',
      'Dòng mẫu 1 (Xóa dòng này khi nhập)'
    ],
    [
      2,
      unitCode || '8802',
      'Ca 1',
      '19/09/2026',
      '200733869',
      'Chu Mạnh Hùng',
      'Phó phòng',
      'Tín dụng',
      '0987654321',
      'hungchumanh',
      'Dòng mẫu 2 (Xóa dòng này khi nhập)'
    ]
  ];

  const wsData = [headers, ...sampleData];
  const ws = xlsx.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 12 }, // Mã đơn vị
    { wch: 14 }, // Ca kiểm tra
    { wch: 16 }, // Ngày kiểm tra
    { wch: 16 }, // Mã cán bộ
    { wch: 24 }, // Họ và tên
    { wch: 20 }, // Chức danh
    { wch: 26 }, // Nghiệp vụ
    { wch: 16 }, // SĐT
    { wch: 22 }, // Tài khoản E-learning
    { wch: 30 }, // Ghi chú
  ];

  xlsx.utils.book_append_sheet(wb, ws, 'DS_Dang_Ky_Thi');

  // Sheet 2: Hướng dẫn kê khai
  const guideData = [
    ['HƯỚNG DẪN KÊ KHAI DANH SÁCH THÍ SINH DỰ THI'],
    [''],
    ['1. NGUYÊN TẮC QUAN TRỌNG NHẤT:'],
    ['- Hệ thống sẽ tự động đối chiếu HAI CHIỀU giữa "Mã cán bộ" và "Tài khoản E-learning" với Database trung tâm.'],
    ['- Mã cán bộ và Tài khoản E-learning phải thuộc về CÙNG MỘT NGƯỜI trong Database trung tâm.'],
    ['- Hai cột này là bắt buộc, không được để trống bất kỳ dòng nào.'],
    [''],
    ['2. BẢO TOÀN THÔNG TIN NGHIỆP VỤ:'],
    ['- Các thông tin: Ca kiểm tra, Ngày kiểm tra, Chức danh, Nghiệp vụ, Số điện thoại... được bảo toàn 100% theo file của đơn vị.'],
    ['- Hệ thống không tự ý thay đổi hoặc ghi đè các cột nghiệp vụ của đơn vị.'],
    [''],
    ['3. CHỐNG TRÙNG LẶP:'],
    ['- Mỗi cán bộ chỉ kê khai 01 lần duy nhất trong toàn bộ file.'],
    ['- Tránh trùng lặp Mã cán bộ hoặc Tài khoản E-learning giữa các dòng trong cùng file.'],
    [''],
    ['4. QUY TRÌNH NỘP FILE:'],
    ['- Đơn vị điền dữ liệu theo mẫu tại sheet "DS_Dang_Ky_Thi" (có thể xóa các dòng mẫu trước khi nộp).'],
    ['- Đăng nhập vào hệ thống Web bằng tài khoản của chi nhánh và Upload file.'],
    ['- Nếu có lỗi đối chiếu: Tải danh sách lỗi về, sửa lại thông tin và upload lại (v2, v3...).'],
    ['- Khi số lỗi = 0: Bấm nút "Xác nhận gửi chính thức" để hoàn tất nghĩa vụ.']
  ];
  const wsGuide = xlsx.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 90 }];
  xlsx.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan_Ke_Khai');

  return wb;
}

const wb = createTemplateWorkbook('8802', 'Lào Cai II');
const outPath = path.join(__dirname, '..', 'sample_data', 'Mau_Dang_Ky_Thi_Sinh.xlsx');
xlsx.writeFile(wb, outPath);
console.log('Đã tạo thành công file mẫu tại:', outPath);
