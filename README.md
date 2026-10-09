# HỆ THỐNG QUẢN LÝ, ĐỐI CHIẾU VÀ TỔNG HỢP DANH SÁCH THÍ SINH
**Quy mô:** ~162 đơn vị | ~34.000 cán bộ/thí sinh  
**Kiến trúc:** Next.js 15 (React 19 + TypeScript + Tailwind CSS), Node.js v24 (Native SQLite B-Tree Indexes / PostgreSQL Compatible), SheetJS (XLSX).

---

## 1. MỤC TIÊU & NGUYÊN TẮC CỐT LÕI

Hệ thống phục vụ việc các đơn vị tự đăng nhập và upload file Excel danh sách cán bộ đăng ký dự thi, tự động đối chiếu hai chiều với Central Database, phát hiện lỗi cụ thể và cho phép người quản trị tổng hợp dữ liệu toàn hệ thống một cách tự động.

### Ba nguyên tắc bất khả xâm phạm:
1. **Kiểm tra HAI CHIỀU:** Mã cán bộ ↔ Tài khoản eLearning phải thuộc cùng một người trong Database trung tâm. Hệ thống phát hiện chính xác trường hợp:
   - *Database:* `Mã CB: 200903092 ↔ eLearning: abc123`
   - *Excel:* `Mã CB: 200999999 ↔ eLearning: abc123`
   - *Kết quả bắt buộc:* `❌ LỖI - SAI MÃ CÁN BỘ: Tài khoản eLearning abc123 thuộc Mã cán bộ 200903092, nhưng đơn vị kê khai Mã cán bộ 200999999.`
2. **Bảo toàn 100% dữ liệu nghiệp vụ của đơn vị:** Toàn bộ các cột ngoài Mã cán bộ và eLearning (Họ tên, Chức vụ, Phòng ban, Ca thi, Ngày thi, Nghiệp vụ, Điện thoại, Ghi chú...) được giữ nguyên vẹn từ file Excel của đơn vị, **không bao giờ bị Database trung tâm ghi đè**.
3. **Phân lập dữ liệu tuyệt đối (Unit Isolation):** Đơn vị chỉ được xem và upload dữ liệu của đơn vị mình. Không bao giờ lộ Database trung tâm 34.000 người cho các đơn vị.

---

## 2. THUẬT TOÁN ĐỐI CHIẾU 2 CHIỀU (10 TEST CASES)

Hệ thống đã tích hợp bộ kiểm thử tự động (`npm run test:validation`) cho toàn bộ 10 CASE:
- **CASE 1 – Cả hai chính xác:** `HỢP LỆ`.
- **CASE 2 – Đúng Mã cán bộ nhưng sai eLearning:** Báo chi tiết tài khoản đúng trong Database.
- **CASE 3 – Đúng eLearning nhưng sai Mã cán bộ:** Báo rõ tài khoản eLearning thuộc cán bộ nào trong Database.
- **CASE 4 – Cả hai tồn tại nhưng thuộc 2 người khác nhau:** Báo rõ lỗi chéo người.
- **CASE 5 – Mã cán bộ không tồn tại:** Báo không tìm thấy Mã cán bộ.
- **CASE 6 – eLearning không tồn tại:** Báo không tìm thấy eLearning.
- **CASE 7 – Cả hai đều không tồn tại:** Báo không tìm thấy cả hai.
- **CASE 8 – Trùng Mã cán bộ trong file:** Báo rõ dòng bị trùng lặp.
- **CASE 9 – Trùng eLearning trong file:** Báo rõ dòng bị trùng lặp.
- **CASE 10 – Thiếu trường bắt buộc:** Báo lỗi thiếu dữ liệu.

---

## 3. TÀI KHOẢN ĐĂNG NHẬP MẪU

| Phân quyền | Tài khoản | Mật khẩu | Phạm vi |
|---|---|---|---|
| **Quản trị viên Trung tâm** | `admin` | `Admin@123456` | Giám sát 162 đơn vị, quản lý Central DB, tạo kỳ thi, xuất tổng hợp |
| **Đơn vị Lào Cai II (8802)** | `unit_8802` | `Unit@123456` | Chỉ xem & upload file Chi nhánh Lào Cai II |
| **Đơn vị Sóc Sơn (3160)** | `unit_3160` | `Unit@123456` | Chỉ xem & upload file Chi nhánh Sóc Sơn |
| **Đơn vị Tây Hồ (1400)** | `unit_1400` | `Unit@123456` | Chỉ xem & upload file Chi nhánh Tây Hồ |
| **Đơn vị Đồng Tháp (6900)** | `unit_6900` | `Unit@123456` | Chỉ xem & upload file Chi nhánh Đồng Tháp |

*(Tại màn hình Đăng nhập có sẵn các nút bấm đăng nhập nhanh 1-click để kiểm thử)*

---

## 4. HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG

### Cách 1: Khởi chạy 1-Click trên Windows
Nhấp đúp chuột vào file:
```
CHAY_UNGDUNG.bat
```
File sẽ tự động kiểm tra database, chạy test suite validation và mở trình duyệt tại `http://localhost:3000`.

### Cách 2: Chạy bằng lệnh dòng lệnh
```bash
# 1. Khởi tạo Database và nạp dữ liệu mẫu
npm run db:init
npm run db:seed

# 2. Chạy kiểm thử tự động Validation Engine
npm run test:validation

# 3. Khởi động Web App
npm run start
# hoặc npm run dev (chế độ phát triển)
```
Mở trình duyệt: `http://localhost:3000`

---

## 5. QUY TRÌNH HOẠT ĐỘNG THỰC TẾ

```
[ Đơn vị đăng nhập ]
        ↓
[ Chọn file Excel nộp ]
        ↓
[ Hệ thống Preview & Xác nhận Mapping Cột ]
        ↓
[ Đưa vào Staging & Chạy Đối chiếu 2 chiều ]
        ↓
    ┌───────────────┴───────────────┐
    ▼                               ▼
[ Phát hiện Lỗi ]             [ Hợp lệ 100% ]
    │                               │
[ Xem bảng lỗi chi tiết ]    [ Kích hoạt nút Xác nhận ]
    │                               │
[ Tải file lỗi về sửa ]      [ BẤM GỬI CHÍNH THỨC ]
    │                               │
[ Upload lại v2, v3... ]             │
    └───────────────┬───────────────┘
                    ▼
[ Admin Dashboard: Theo dõi 162 đơn vị ]
                    ↓
[ Admin: Tải file Excel Tổng Hợp 162 đơn vị ]
```

---

## 6. CẤU TRÚC THƯ MỤC DỰ ÁN

```
App web đơn vị tự kê khai/
├── data/
│   └── database.sqlite         # Database lưu trữ tốc độ cao (B-Tree Unique Indexes)
├── sample_data/
│   ├── master_users.xlsx       # File Central Database người dùng mẫu
│   └── unit_submission_laocai.xlsx # File Excel thực tế chi nhánh nộp
├── scripts/
│   ├── init_database.js        # Script khởi tạo schema, tables & indexes
│   ├── seed_database.js        # Nạp 162 đơn vị, tài khoản & master users
│   ├── test_validation_engine.js # Automated unit test cho 10 CASE đối chiếu
│   └── test_e2e_workflow.js    # Automated End-to-End workflow test
├── src/
│   ├── app/
│   │   ├── admin/page.tsx      # Dashboard Quản trị viên (162 đơn vị, Master DB)
│   │   ├── unit/page.tsx       # Dashboard Đơn vị (Upload, Preview, Lỗi, Xác nhận)
│   │   ├── login/page.tsx      # Trang đăng nhập và các tài khoản mẫu
│   │   └── api/                # REST API routes (Auth, Upload, Records, Export...)
│   └── lib/
│       ├── auth.ts             # JWT, Bcrypt, RBAC & Unit Isolation
│       ├── db.ts               # Database connection & WAL mode
│       ├── excel.ts            # Đọc Excel, auto header detection, bảo toàn cột gốc
│       ├── validation.ts       # Core Bidirectional Validation Engine
│       └── audit.ts            # Audit logging system
├── schema.sql                  # Database Schema DDL tiêu chuẩn
├── IMPLEMENTATION_PLAN.md      # Tài liệu thiết kế kỹ thuật chi tiết
└── CHAY_UNGDUNG.bat            # File khởi chạy nhanh 1-click Windows
```
