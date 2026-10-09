import * as fs from 'fs';
import * as path from 'path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType
} from 'docx';

function createHeading1(text: string) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 140 },
  });
}

function createHeading2(text: string) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
  });
}

function createHeading3(text: string) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 140, after: 60 },
  });
}

function createPara(text: string, bold = false) {
  return new Paragraph({
    children: [
      new TextRun({
        text: text,
        bold: bold,
        size: 24, // 12pt
        font: 'Times New Roman',
      }),
    ],
    spacing: { after: 100, line: 300 },
  });
}

function createBullet(text: string, boldPrefix = '') {
  return new Paragraph({
    children: [
      ...(boldPrefix
        ? [
            new TextRun({
              text: boldPrefix,
              bold: true,
              size: 24,
              font: 'Times New Roman',
            }),
          ]
        : []),
      new TextRun({
        text: text,
        size: 24,
        font: 'Times New Roman',
      }),
    ],
    bullet: { level: 0 },
    spacing: { after: 80, line: 280 },
  });
}

function createCustomTable(headers: string[], rows: string[][], colWidths: number[]) {
  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: 'CCCCCC',
  };

  const borders = {
    top: borderStyle,
    bottom: borderStyle,
    left: borderStyle,
    right: borderStyle,
  };

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((header, idx) =>
        new TableCell({
          width: { size: colWidths[idx], type: WidthType.PERCENTAGE },
          shading: { fill: '005F3E', type: ShadingType.CLEAR },
          borders: borders,
          margins: { top: 120, bottom: 120, left: 140, right: 140 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: header,
                  bold: true,
                  color: 'FFFFFF',
                  size: 22,
                  font: 'Times New Roman',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        })
      ),
    }),
    ...rows.map((row, rIdx) =>
      new TableRow({
        children: row.map((cellText, cIdx) =>
          new TableCell({
            width: { size: colWidths[cIdx], type: WidthType.PERCENTAGE },
            shading: {
              fill: rIdx % 2 === 1 ? 'F4F6F8' : 'FFFFFF',
              type: ShadingType.CLEAR,
            },
            borders: borders,
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cellText,
                    size: 22,
                    font: 'Times New Roman',
                  }),
                ],
                alignment: cIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
              }),
            ],
          })
        ),
      })
    ),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

async function generateDocx() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 24,
            color: '1A1A1A',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          // Tiêu đề lớn
          new Paragraph({
            children: [
              new TextRun({
                text: 'TÀI LIỆU TỔNG HỢP TOÀN BỘ CHỨC NĂNG',
                bold: true,
                size: 36, // 18pt
                color: '005F3E',
                font: 'Times New Roman',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'HỆ THỐNG THU THẬP DỮ LIỆU & ĐỐI CHIẾU KIỂM TRA TỰ ĐỘNG B2B',
                bold: true,
                size: 28, // 14pt
                color: 'A81D22',
                font: 'Times New Roman',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: '(Kiến trúc Agribank Style — Chuẩn hóa quy trình kê khai hồ sơ số hóa)',
                italics: true,
                size: 22,
                color: '666666',
                font: 'Times New Roman',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // PHẦN 1: TỔNG QUAN HỆ THỐNG
          createHeading1('I. TỔNG QUAN HỆ THỐNG'),
          createPara(
            'Hệ thống thu thập dữ liệu là nền tảng quản trị và tiếp nhận hồ sơ tập trung giữa Trụ sở chính (Ban Quản trị / Admin) và các Chi nhánh, Đơn vị thành viên (Đơn vị tự kê khai). Nền tảng giải quyết triệt để vấn đề sai lệch thông tin cán bộ, lỗi trùng lặp dữ liệu, và tự động hóa toàn bộ khâu đối chiếu kiểm tra hai chiều theo thời gian thực.'
          ),

          createHeading2('1. Mục tiêu và Giá trị cốt lõi'),
          createBullet(' Chuẩn hóa và làm sạch 100% dữ liệu trước khi tổng hợp về hệ thống nguồn trung ương.', '• Tính chính xác tuyệt đối:'),
          createBullet(' Thuật toán đối chiếu chéo (Mã cán bộ ↔ Tài khoản eLearning) phát hiện tức thì người mạo danh, sai mã, sai tài khoản.', '• Kiểm tra tự động 2 chiều:'),
          createBullet(' Giữ nguyên toàn vẹn mọi thông tin kê khai thực tế (Họ tên, Chức vụ, Phòng ban, Nghiệp vụ...) mà không bị dữ liệu mẫu ghi đè.', '• Bảo toàn dữ liệu đơn vị:'),
          createBullet(' Toàn bộ phiên bản nộp (v1, v2, v3...), thời gian nộp, người thao tác và kết quả kiểm tra đều được lưu vết đầy đủ.', '• Quản trị phiên bản & Audit Log:'),

          createHeading2('2. Phân quyền người dùng (Role-Based Access Control)'),
          createCustomTable(
            ['STT', 'Vai trò (Role)', 'Đối tượng sử dụng', 'Phạm vi & Thẩm quyền chính'],
            [
              ['1', 'ADMIN (Quản trị viên)', 'Ban Tổ chức / Quản trị viên Trung ương', 'Quản lý Đợt thu thập, CSDL Master, Theo dõi tiến độ toàn hệ thống, Xem Audit log, Xuất báo cáo tổng hợp'],
              ['2', 'UNIT (Đơn vị kê khai)', 'Chi nhánh, Đơn vị cơ sở', 'Xem quy chế đợt, Tải file mẫu, Nạp file Excel, Đối chiếu sửa lỗi tự động, Xem toàn bộ danh sách, Xác nhận gửi chính thức'],
            ],
            [10, 25, 25, 40]
          ),
          createPara(''),

          // PHẦN 2: CHỨC NĂNG DÀNH CHO ĐƠN VỊ TỰ KÊ KHAI
          createHeading1('II. CÁC CHỨC NĂNG DÀNH CHO ĐƠN VỊ (UNIT)'),
          createPara(
            'Giao diện phân hệ Đơn vị được thiết kế theo quy chuẩn thương hiệu: Xanh lá đậm (#005F3E), Đỏ cảnh báo (#A81D22), Vàng lúa (#F2A900), bố cục Sidebar thu gọn linh hoạt và tích hợp toàn bộ thao tác trong cùng một màn hình.'
          ),

          createHeading2('1. Bộ chọn Đợt thu thập / Báo cáo & Huy hiệu trạng thái'),
          createBullet(' Cho phép đơn vị chuyển đổi linh hoạt giữa các đợt mở hoặc xem lại lịch sử các đợt đã đóng.', '• Lựa chọn đợt làm việc:'),
          createBullet(' Hiển thị rõ ràng trạng thái đợt (ĐANG MỞ TIẾP NHẬN / ĐÃ ĐÓNG ĐỢT NỘP). Tự động khóa nút nộp file khi đợt đã hết hạn tiếp nhận.', '• Kiểm soát thời hạn:'),
          createBullet(' Huy hiệu trực quan theo 4 cấp độ: [CHƯA UPLOAD], [CÓ N LỖI CẦN SỬA (vX)], [HỢP LỆ - CHỜ XÁC NHẬN (vX)], [ĐÃ GỬI CHÍNH THỨC (vX)].', '• Trạng thái hồ sơ:'),

          createHeading2('2. Tiến trình xử lý trực quan (4-Step Pipeline)'),
          createBullet(' Từng bước quy trình (1. Upload Excel -> 2. Đối chiếu 2 chiều -> 3. Danh sách lỗi -> 4. Báo cáo & Gửi) hiển thị tiến độ bằng màu sắc.', '• Thanh điều hướng trực quan:'),
          createBullet(' Cho phép người dùng click nhanh vào từng bước để chuyển ngay đến nội dung cần xử lý tương ứng.', '• Tương tác nhanh:'),

          createHeading2('3. Thẻ thống kê thời gian thực (Stats Grid)'),
          createBullet(' Tổng số bản ghi đơn vị đã kê khai trong file hiện tại.', '• Tổng số bản ghi trong file:'),
          createBullet(' Số dòng khớp đúng 100% cả Mã cán bộ và Tài khoản eLearning với CSDL Trung tâm.', '• Bản ghi Hợp lệ:'),
          createBullet(' Số dòng phát hiện sai sót (hiển thị màu đỏ cảnh báo, cần sửa để tiếp tục).', '• Bản ghi Phát hiện Lỗi:'),
          createBullet(' Số thứ tự phiên bản file nộp (v1, v2, v3...) giúp lưu trữ trọn vẹn lịch sử nộp lại.', '• Phiên bản file:'),

          createHeading2('4. Phân hệ tích hợp: "Nộp file & Đối chiếu kiểm tra" (Trọng tâm)'),
          createPara(
            'Toàn bộ chu trình nộp file, sửa lỗi và nộp lại được tích hợp hoàn toàn trong 1 màn hình duy nhất:'
          ),
          createBullet(' Tải file cấu trúc chuẩn về máy tính để nhập thông tin cán bộ.', '• Nút Tải File Excel Mẫu (Vàng lúa #F2A900):'),
          createBullet(' Mở hộp thoại chọn file .xlsx/.xls từ máy tính để nạp lên hệ thống.', '• Nút Chọn file Excel nộp / Nộp lại (Xanh #005F3E):'),
          createBullet(' Hiển thị modal xem trước 5 dòng đầu, tự động dò tìm dòng tiêu đề và ánh xạ thông minh các cột.', '• Xem trước & Ánh xạ cột (Preview Modal):'),
          createBullet(' Thanh tiến trình phần trăm (%) hiển thị trạng thái tải và phân tích dữ liệu mượt mà.', '• Thanh tiến trình (Progress Bar):'),
          createBullet(' Bảng chi tiết từng dòng lỗi kèm số dòng Excel thực tế, mã cán bộ, tài khoản, mã phân loại lỗi và nguyên nhân chi tiết.', '• Bảng chi tiết lỗi đối chiếu:'),
          createBullet(' Cho phép đơn vị tải riêng file Excel chỉ chứa các dòng bị lỗi về máy tính để chỉnh sửa thuận tiện.', '• Nút Tải danh sách lỗi:'),
          createBullet(' Tải file Excel danh sách kết quả đối chiếu đầy đủ.', '• Nút Tải file kết quả:'),
          createBullet(' Chỉ kích hoạt khi số lỗi bằng 0. Khi bấm, hệ thống chốt danh sách hợp lệ cuối cùng lên Ban Quản trị.', '• Xác nhận gửi chính thức (Xanh dương):'),

          createHeading2('5. Toàn bộ danh sách kê khai (Data Records Viewer)'),
          createBullet(' Xem tất cả bản ghi đã được đơn vị nạp lên với đầy đủ các cột nghiệp vụ.', '• Bảng dữ liệu toàn diện:'),
          createBullet(' Tìm kiếm tức thời theo Tên cán bộ, Mã cán bộ hoặc Tài khoản.', '• Tìm kiếm nhanh:'),
          createBullet(' Chuyển đổi xem [Tất cả] / [Chỉ bản ghi hợp lệ] / [Chỉ bản ghi có lỗi].', '• Bộ lọc trạng thái:'),
          createBullet(' Hỗ trợ phân trang mượt mà 20 dòng/trang.', '• Phân trang:'),

          createHeading2('6. Lịch sử phiên bản nộp (Version History)'),
          createBullet(' Xem danh sách toàn bộ các phiên bản đã nạp từ v1 đến hiện tại.', '• Lịch sử nộp lại:'),
          createBullet(' Thống kê từng phiên bản: Tên file gốc, Thời gian nộp, Số bản ghi, Số lỗi, Tải lại file phiên bản cũ.', '• Thông tin chi tiết:'),

          // PHẦN 3: CHỨC NĂNG DÀNH CHO ADMIN
          createHeading1('III. CÁC CHỨC NĂNG DÀNH CHO QUẢN TRỊ VIÊN (ADMIN)'),
          createPara(
            'Phân hệ Quản trị viên được xây dựng hoàn toàn dưới dạng các trang độc lập (không lạm dụng Modal popup lớn), đảm bảo tốc độ và trải nghiệm B2B chuyên nghiệp.'
          ),

          createHeading2('1. Bảng điều khiển Tổng quan (Dashboard)'),
          createBullet(' Bộ chọn kỳ/đợt làm việc kèm nút Tạo đợt mới và Xuất báo cáo tổng hợp (Excel).', '• Khối chọn kỳ báo cáo:'),
          createBullet(' 4 thẻ chỉ số lớn: Tổng đơn vị tham gia, Đơn vị đã nộp, Đơn vị chưa nộp, Đơn vị đang có lỗi.', '• Hàng thẻ thống kê (Stats Cards):'),
          createBullet(' Liệt kê tất cả đơn vị kèm Mã ĐV, Tên ĐV, Số hồ sơ đã nạp, Phiên bản nộp, Trạng thái (Hợp lệ, Có lỗi, Chưa nộp), Thời gian cập nhật.', '• Bảng tiến độ từng đơn vị:'),
          createBullet(' Lọc theo Đã nộp / Chưa nộp / Có lỗi / Đã gửi chính thức và tìm kiếm theo tên đơn vị.', '• Lọc & Tìm kiếm:'),
          createBullet(' Xem danh sách hồ sơ chi tiết của bất kỳ đơn vị nào hoặc xuất file đơn vị đó.', '• Thao tác nhanh:'),

          createHeading2('2. Quản lý Đợt thu thập dữ liệu (Trang độc lập /admin/exams)'),
          createBullet(' Tạo mới đợt thu thập với Mã đợt, Tên đợt, Ngày bắt đầu, Ngày kết thúc.', '• Tạo mới đợt:'),
          createBullet(' Bật/Tắt tiếp nhận hồ sơ (OPEN / CLOSED) nhanh chóng.', '• Đóng/Mở đợt thu thập:'),
          createBullet(' Chỉnh sửa thông tin đợt hoặc xóa đợt (chỉ xóa được khi chưa có dữ liệu nộp ràng buộc).', '• Quản trị vòng đời:'),

          createHeading2('3. Cơ sở dữ liệu Trung tâm / Master Database (/admin/master-db)'),
          createBullet(' Quản lý kho dữ liệu chuẩn trung ương (Mã cán bộ, Tài khoản eLearning, Họ tên, Phòng ban, Trạng thái hoạt động).', '• Danh mục CSDL Master:'),
          createBullet(' Cho phép Admin tải file Excel dữ liệu nguồn nhân sự lên để nạp hàng chục nghìn cán bộ vào hệ thống.', '• Import Excel danh sách Master:'),
          createBullet(' Tìm kiếm cán bộ theo Mã hoặc Email/Tài khoản, lọc theo trạng thái.', '• Tra cứu dữ liệu:'),
          createBullet(' Hiển thị Badge số đếm tổng bản ghi Master ngay trên Menu Sidebar.', '• Huy hiệu số lượng:'),

          createHeading2('4. Nhật ký hệ thống & Kiểm toán (Audit Log /admin/audit-log)'),
          createBullet(' Ghi lại toàn bộ hành động: Đăng nhập, Nộp file, Sửa lỗi, Xác nhận nộp, Tạo đợt, Đổi mật khẩu, Xuất dữ liệu.', '• Lưu vết tự động:'),
          createBullet(' Ghi nhận đầy đủ: Người thực hiện, Vai trò, Địa chỉ IP, Thời gian chi tiết và Nội dung thay đổi.', '• Bằng chứng kiểm toán:'),
          createBullet(' Lọc theo loại hành vi và tìm kiếm theo tài khoản.', '• Tìm kiếm & Bộ lọc:'),

          // PHẦN 4: THUẬT TOÁN ĐỐI CHIẾU 2 CHIỀU
          createHeading1('IV. QUY TẮC ĐỐI CHIẾU KIỂM TRA TỰ ĐỘNG 2 CHIỀU'),
          createPara(
            'Đây là lõi thuật toán quan trọng nhất của hệ thống, giúp ngăn chặn triệt để mọi sai sót nghiệp vụ:'
          ),
          createCustomTable(
            ['Mã lỗi (Error Code)', 'Tên nghiệp vụ', 'Nguyên nhân & Cách hệ thống xử lý'],
            [
              ['WRONG_EMPLOYEE_CODE', 'Sai Mã cán bộ', 'Mã cán bộ trong file đơn vị nộp không tồn tại trong CSDL Master trung tâm.'],
              ['WRONG_ELEARNING', 'Sai Tài khoản eLearning', 'Tài khoản eLearning trong file đơn vị nộp không tồn tại trong CSDL Master trung tâm.'],
              ['CROSS_PERSON_MISMATCH', 'Lệch chéo 2 chiều (Mạo danh)', 'Mã cán bộ thuộc về người A, nhưng Tài khoản eLearning lại thuộc về người B trong CSDL Master.'],
              ['DUPLICATE_INTERNAL', 'Trùng lặp nội bộ file', 'Cùng một cán bộ (hoặc cùng tài khoản) xuất hiện từ 2 dòng trở lên trong file đơn vị.'],
              ['INACTIVE_EMPLOYEE', 'Cán bộ đã thôi việc/nghỉ', 'Cán bộ tồn tại trong CSDL Master nhưng trạng thái không hoạt động (INACTIVE).'],
            ],
            [22, 28, 50]
          ),
          createPara(''),

          // PHẦN 5: CHỨC NĂNG HỆ THỐNG DÙNG CHUNG
          createHeading1('V. CÁC TÍNH NĂNG TIỆN ÍCH DÙNG CHUNG'),
          createBullet(' Xác thực an toàn qua HttpOnly Cookie JWT, tự động phân luồng giao diện theo quyền (Admin -> /admin, Unit -> /unit).', '• Đăng nhập an toàn (Authentication):'),
          createBullet(' Hộp thoại Modal nhanh (nhấn từ Avatar góc phải) cho phép người dùng tự đổi mật khẩu bất cứ lúc nào.', '• Đổi mật khẩu nhanh (Change Password Modal):'),
          createBullet(' Admin có thể đặt lại mật khẩu về mặc định cho bất kỳ tài khoản đơn vị nào.', '• Đặt lại mật khẩu (Reset Password):'),
          createBullet(' Hỗ trợ xuất dữ liệu ra file Excel chuẩn định dạng cho nhiều nghiệp vụ (Mẫu chuẩn, Báo cáo đơn vị, Danh sách lỗi, Báo cáo tổng hợp Admin).', '• Xuất báo cáo Excel (Export Engine):'),
          createBullet(' Thiết kế Responsive, thanh Menu thu gọn (Collapse Sidebar) giúp tối ưu diện tích hiển thị trên các màn hình làm việc.', '• Giao diện tối ưu công thái học:'),

          // KẾT THÚC
          new Paragraph({
            children: [
              new TextRun({
                text: '--- HẾT ---',
                bold: true,
                size: 24,
                color: '666666',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 300 },
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(process.cwd(), 'Tai_Lieu_Cac_Chuc_Nang_App.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log('SUCCESS: Document generated at ' + outputPath);
}

generateDocx().catch((err) => {
  console.error(err);
  process.exit(1);
});
