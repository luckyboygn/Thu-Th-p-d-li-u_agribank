# KẾ HOẠCH TRIỂN KHAI HỆ THỐNG QUẢN LÝ, ĐỐI CHIẾU VÀ TỔNG HỢP DANH SÁCH THÍ SINH
**Quy mô:** ~162 đơn vị | ~34.000 cán bộ/thí sinh  
**Kiến trúc:** Next.js (React + TypeScript + Tailwind CSS), Node.js, SQL Engine (PostgreSQL / SQLite tốc độ cao với chỉ mục Unique), SheetJS (XLSX).

---

## 1. PHÂN TÍCH CẤU TRÚC VÀ FILE EXCEL MẪU (STAGE 1)

Qua khảo sát thực tế các file dữ liệu có sẵn trên máy:
1. **File Master Trung tâm (`master_users.xlsx` / `Danh_sach_toan_bo_nguoi_dung_Agribank...`):**
   - Sheet: `Danh_Sach_Nguoi_Dung`
   - Dòng 1: Tiêu đề cột chuẩn:
     - `STT`
     - `Mã cán bộ` (Số/Chuỗi, ví dụ: `200733604`)
     - `Họ và tên` (Chuỗi tiếng Việt)
     - `Tên đăng nhập` (Chính là tài khoản eLearning, ví dụ: `hantt`, `hungchumanh`)
     - `Mật khẩu mặc định`
   - Quan hệ cốt lõi: Mỗi dòng đại diện 1 cán bộ, quan hệ giữa **Mã cán bộ** và **Tên đăng nhập (eLearning)** là duy nhất 1-1.

2. **File Đơn vị kê khai nộp lên (`8802 Lào Cai II...`, `Tây Hồ...`, `Đồng Tháp...`):**
   - Cấu trúc thực tế rất đa dạng:
     - Dòng 1 - 11/16: Tiêu đề hành chính ("NGÂN HÀNG NÔNG NGHIỆP...", "BẢNG ĐĂNG KÝ...", số công văn, người gửi).
     - Dòng tiêu đề bảng dữ liệu (Header Row): Thường nằm ở dòng 12 hoặc dòng 17.
     - Các cột bắt buộc cần xác thực:
       - Cột Mã cán bộ: Các tên biến thể như `Mã cán bộ`, `Mã cán bộ (1)`, `Mã CB`, `MACB`.
       - Cột Tài khoản eLearning: Các biến thể như `Tài khoản E-learning`, `Tài khoản eLearning`, `TK eLearning`, `Tên đăng nhập`.
     - Các cột nghiệp vụ khác (phải GIỮ NGUYÊN 100% THEO EXCEL):
       - `Mã đơn vị`, `Ca kiểm tra`, `Ngày kiểm tra`, `Họ và tên`, `Chức danh/chức vụ`, `Nghiệp vụ đăng ký kiểm tra`, `Điện thoại di động`, `Ghi chú`...
     - Các dòng phân cách (Section Headers): Ví dụ `I. DANH SÁCH CÁN BỘ THI CA 1 NGÀY 19/9/2026`, `II. CA 2...`.
     - Các dòng tổng kết/chữ ký ở cuối bảng: `Tổng cộng: 187 cán bộ`, `Lập Bảng`, `Kiểm soát`, `Giám đốc`, SĐT người lập.
   - **Giải pháp bóc tách:**
     - Tự động quét từ dòng 1 đến 30 để tìm Header Row thông qua thuật toán tính điểm khớp từ khóa (Header Detection).
     - Cho phép giao diện hiển thị Preview & Mapping để cán bộ đơn vị/Admin xác nhận hoặc chọn lại nếu file có cấu trúc đặc biệt.
     - Bộ lọc thông minh loại bỏ các dòng phân ca/tiêu đề con và dòng chữ ký ở chân trang.
     - Giữ nguyên toàn bộ cấu trúc các cột gốc khi lưu trữ và khi xuất báo cáo tổng hợp.

---

## 2. THIẾT KẾ KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

```
[ Trình duyệt Web (Desktop First) ]
  ├── Đơn vị (Unit Admin): Upload Excel, Xem Preview/Mapping, Xem Kết quả đối chiếu chi tiết, Tải báo cáo lỗi, Xác nhận nộp chính thức.
  └── Quản trị viên (Super Admin): Giám sát 162 đơn vị, Quản lý Database gốc (34.000 CB), Tạo kỳ thi, Khóa/mở đợt nộp, Xuất file tổng hợp toàn hệ thống.
          │
          ▼ HTTPS / JSON REST API
[ Backend Next.js API Routes (Node.js + TypeScript) ]
  ├── Module Authentication & RBAC (Super Admin, Unit Admin theo unit_id)
  ├── Module Excel Engine (SheetJS): Đọc đa dạng sheet, phát hiện header, mapping cột, bảo toàn toàn bộ dữ liệu cột nghiệp vụ
  ├── Module Bidirectional Validation Engine:
  │     ├── Bước 1: Validate cấu trúc, trường bắt buộc, dữ liệu rỗng
  │     ├── Bước 2: Kiểm tra trùng lặp nội bộ trong file (Duplicate in File)
  │     ├── Bước 3: Đối chiếu 2 chiều với Central Database (10 CASE bắt buộc)
  │     └── Bước 4: Lưu kết quả Staging & chi tiết lỗi
  ├── Module Export Engine: Xuất file lỗi, file kết quả từng đơn vị, file tổng hợp 162 đơn vị (giữ nguyên cột gốc + cột trạng thái)
  └── Module Audit Logging: Ghi nhận mọi thao tác upload, validate, sửa đổi, xuất file
          │
          ▼ Fast Indexed Queries / Transactions
[ Database Layer (PostgreSQL / SQLite Tốc độ cao) ]
  ├── units: 162 đơn vị
  ├── users: Tài khoản Admin và Đơn vị (mã hóa mật khẩu bằng bcrypt)
  ├── master_employees: Cán bộ trung tâm (UNIQUE employee_code, UNIQUE elearning_account, INDEX unit_code)
  ├── exams: Quản lý các kỳ thi/đợt thi
  ├── exam_uploads: Lịch sử upload (lưu phiên bản V1, V2, V3..., file gốc, mã hash, thống kê lỗi)
  ├── exam_records: Bản ghi thí sinh từng đơn vị (lưu raw_data JSON và các trường đã chuẩn hóa)
  ├── validation_errors: Chi tiết từng lỗi (dòng, mã CB, eLearning, mã lỗi, thông báo chi tiết)
  └── audit_logs: Nhật ký hoạt động toàn hệ thống
```

---

## 3. THIẾT KẾ DATABASE SCHEMA (DATA MODEL)

### 3.1. Bảng `units` (Đơn vị)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `unit_code`: VARCHAR(50) UNIQUE NOT NULL (Ví dụ: `8802`, `3160`)
- `unit_name`: VARCHAR(255) NOT NULL (Ví dụ: `Chi nhánh Lào Cai II`)
- `status`: VARCHAR(20) DEFAULT 'ACTIVE'
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3.2. Bảng `users` (Người dùng hệ thống)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `username`: VARCHAR(100) UNIQUE NOT NULL
- `password_hash`: VARCHAR(255) NOT NULL
- `full_name`: VARCHAR(255) NOT NULL
- `role`: VARCHAR(20) NOT NULL ('SUPER_ADMIN' | 'UNIT_ADMIN' | 'VIEWER')
- `unit_id`: INTEGER REFERENCES units(id) (NULL nếu là SUPER_ADMIN)
- `status`: VARCHAR(20) DEFAULT 'ACTIVE'
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3.3. Bảng `master_employees` (Database trung tâm 34.000 cán bộ)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `employee_code`: VARCHAR(50) UNIQUE NOT NULL
- `elearning_account`: VARCHAR(100) UNIQUE NOT NULL
- `full_name`: VARCHAR(255) NOT NULL
- `unit_code`: VARCHAR(50)
- `unit_name`: VARCHAR(255)
- `raw_info`: TEXT
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- **Indexes:**
  - `idx_master_emp_code` on `employee_code`
  - `idx_master_elearn` on `elearning_account`
  - `idx_master_unit` on `unit_code`

### 3.4. Bảng `exams` (Kỳ thi / Đợt kiểm tra)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `code`: VARCHAR(100) UNIQUE NOT NULL (Ví dụ: `DOT_2_2026`)
- `title`: VARCHAR(255) NOT NULL
- `description`: TEXT
- `status`: VARCHAR(20) DEFAULT 'OPEN' ('DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED')
- `start_date`: DATE
- `end_date`: DATE
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3.5. Bảng `exam_uploads` (Lịch sử tải lên & Phiên bản)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `exam_id`: INTEGER NOT NULL REFERENCES exams(id)
- `unit_id`: INTEGER NOT NULL REFERENCES units(id)
- `version`: INTEGER NOT NULL DEFAULT 1
- `file_name`: VARCHAR(255) NOT NULL
- `file_size`: INTEGER NOT NULL
- `file_hash`: VARCHAR(64) NOT NULL
- `original_file_path`: VARCHAR(500)
- `total_rows`: INTEGER DEFAULT 0
- `valid_rows`: INTEGER DEFAULT 0
- `error_rows`: INTEGER DEFAULT 0
- `status`: VARCHAR(30) DEFAULT 'STAGING' ('STAGING' | 'VALIDATED' | 'OFFICIAL_SUBMITTED')
- `uploaded_by`: INTEGER REFERENCES users(id)
- `submitted_at`: TIMESTAMP
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3.6. Bảng `exam_records` (Dữ liệu kê khai chi tiết)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `upload_id`: INTEGER NOT NULL REFERENCES exam_uploads(id) ON DELETE CASCADE
- `exam_id`: INTEGER NOT NULL REFERENCES exams(id)
- `unit_id`: INTEGER NOT NULL REFERENCES units(id)
- `row_index`: INTEGER NOT NULL (Số dòng thực tế trong file Excel)
- `employee_code`: VARCHAR(50)
- `elearning_account`: VARCHAR(100)
- `full_name`: VARCHAR(255)
- `raw_data`: TEXT (Lưu 100% JSON dữ liệu gốc của dòng Excel để bảo toàn tất cả cột nghiệp vụ)
- `validation_status`: VARCHAR(20) DEFAULT 'PENDING' ('VALID' | 'INVALID')
- `validation_message`: TEXT
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- **Indexes:**
  - `idx_rec_upload` on `upload_id`
  - `idx_rec_emp_code` on `employee_code`
  - `idx_rec_elearn` on `elearning_account`

### 3.7. Bảng `validation_errors` (Danh sách lỗi chi tiết)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `upload_id`: INTEGER NOT NULL REFERENCES exam_uploads(id) ON DELETE CASCADE
- `record_id`: INTEGER REFERENCES exam_records(id) ON DELETE CASCADE
- `row_index`: INTEGER NOT NULL
- `employee_code`: VARCHAR(50)
- `elearning_account`: VARCHAR(100)
- `error_type`: VARCHAR(50) NOT NULL
- `error_message`: TEXT NOT NULL
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3.8. Bảng `audit_logs` (Nhật ký kiểm toán)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `user_id`: INTEGER REFERENCES users(id)
- `username`: VARCHAR(100)
- `unit_id`: INTEGER REFERENCES units(id)
- `action`: VARCHAR(100) NOT NULL
- `details`: TEXT
- `ip_address`: VARCHAR(50)
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

---

## 4. THUẬT TOÁN ĐỐI CHIẾU 2 CHIỀU (BIDIRECTIONAL VALIDATION ENGINE)

Thực thi tuần tự và nghiêm ngặt qua 4 bước:

### Bước 1: Kiểm tra tính toàn vẹn cơ bản
- Bỏ qua dòng trống.
- Kiểm tra xem dòng có đủ 2 trường bắt buộc `Mã cán bộ` và `Tài khoản eLearning` hay không.
- Nếu thiếu một trong hai trường: Ghi nhận lỗi `THIẾU_THÔNG_TIN_BẮT_BUỘC`.

### Bước 2: Kiểm tra trùng lặp trong chính file Excel (File Internal Duplicates)
- Duyệt file và lập Map theo `employee_code` và theo `elearning_account`.
- Nếu `employee_code` xuất hiện >= 2 lần trong file:
  - Báo lỗi: `LỖI – Mã cán bộ xuất hiện nhiều lần trong file (Dòng ${first_row} và Dòng ${current_row})`.
- Nếu `elearning_account` xuất hiện >= 2 lần trong file:
  - Báo lỗi: `LỖI – Tài khoản eLearning xuất hiện nhiều lần trong file (Dòng ${first_row} và Dòng ${current_row})`.

### Bước 3: Đối chiếu 2 chiều với Database trung tâm
Truy vấn Database trung tâm:
1. `record_by_code`: Tìm cán bộ có `master_employees.employee_code == excel_code`
2. `record_by_elearn`: Tìm cán bộ có `master_employees.elearning_account == excel_elearn`

Phân loại 10 CASE chính xác:
- **CASE 1 (HỢP LỆ):**
  - Cả hai tồn tại trong DB, và `record_by_code.id === record_by_elearn.id`.
  - Kết quả: `VALID` (Hợp lệ).
- **CASE 2 (Sai eLearning):**
  - `record_by_code` tồn tại, nhưng `record_by_elearn` KHÔNG tồn tại hoặc `record_by_elearn.employee_code !== excel_code`.
  - Thông báo: `"Mã cán bộ ${excel_code} tồn tại trong Database nhưng tài khoản eLearning do đơn vị kê khai không đúng. Tài khoản đúng trong Database là ${record_by_code.elearning_account}."`
- **CASE 3 (Sai Mã cán bộ - Yêu cầu bắt buộc):**
  - `record_by_elearn` tồn tại, nhưng `record_by_code` KHÔNG tồn tại hoặc `record_by_code.elearning_account !== excel_elearn`.
  - Thông báo: `"Tài khoản eLearning ${excel_elearn} thuộc Mã cán bộ ${record_by_elearn.employee_code}, nhưng đơn vị kê khai Mã cán bộ ${excel_code}."`
- **CASE 4 (Cả hai tồn tại nhưng thuộc 2 người khác nhau):**
  - Cả `record_by_code` và `record_by_elearn` đều tồn tại trong DB, nhưng `record_by_code.id !== record_by_elearn.id`.
  - Thông báo: `"Mã cán bộ ${excel_code} (thuộc cán bộ ${record_by_code.full_name}) và tài khoản eLearning ${excel_elearn} (thuộc cán bộ ${record_by_elearn.full_name} - Mã CB ${record_by_elearn.employee_code}) thuộc hai người khác nhau trong Database."`
- **CASE 5 (Mã cán bộ không tồn tại):**
  - Không tìm thấy `excel_code` trong DB.
  - Thông báo: `"Mã cán bộ ${excel_code} không tồn tại trong Database."`
- **CASE 6 (eLearning không tồn tại):**
  - Không tìm thấy `excel_elearn` trong DB.
  - Thông báo: `"Tài khoản eLearning ${excel_elearn} không tồn tại trong Database."`
- **CASE 7 (Cả hai đều không tồn tại):**
  - Cả `excel_code` và `excel_elearn` đều không có trong DB.
  - Thông báo: `"Không tìm thấy cả Mã cán bộ ${excel_code} và tài khoản eLearning ${excel_elearn} trong Database."`
- **CASE 8, 9, 10:** Trùng lặp nội bộ trong file và dữ liệu dị biệt.

### Bước 4: Nguyên tắc bảo toàn dữ liệu
- Tất cả các trường khác từ Excel: `Họ tên`, `Chức danh`, `Phòng ban`, `Ca thi`, `Ngày thi`, `Nghiệp vụ`... **được giữ nguyên vẹn 100% từ Excel**, không bao giờ bị ghi đè bởi Database trung tâm.

---

## 5. LỘ TRÌNH 10 GIAI ĐOẠN PHÁT TRIỂN (10 STAGES)

| Giai đoạn | Nội dung thực hiện | Tiêu chí hoàn thành / Kiểm thử |
|---|---|---|
| **STAGE 1** | Phân tích dữ liệu & Khảo sát mẫu file Excel | Xác định rõ các biến thể header, sheet name, footer. Viết kịch bản kiểm tra structure parser. |
| **STAGE 2** | Database & Migration Layer | Thiết lập SQL adapter với indexes, unique constraints, transactions, khởi tạo bảng. |
| **STAGE 3** | Authentication & Phân quyền RBAC | Đăng nhập bảo mật (JWT/Session, bcrypt), phân tách Super Admin và 162 Unit Admin, Unit-isolation RLS. |
| **STAGE 4** | Excel Upload, Preview & Staging | Đọc file, nhận diện tự động dòng header, preview 10 dòng đầu, xác nhận mapping cột, lưu Staging. |
| **STAGE 5** | Bidirectional Validation Engine | Triển khai thuật toán 2 chiều, viết 10 unit test tự động tương ứng 10 CASE kiểm tra tính đúng đắn. |
| **STAGE 6** | Unit Dashboard | Giao diện cho đơn vị: Upload file, xem thống kê Hợp lệ/Lỗi, bảng lỗi phân trang, tải danh sách lỗi, xác nhận gửi chính thức. |
| **STAGE 7** | Admin Dashboard | Dashboard tổng quan 162 đơn vị (tỷ lệ hoàn thành, số lượng người, trạng thái từng chi nhánh), xem chi tiết từng đơn vị. |
| **STAGE 8** | Export Module | Xuất Excel: Tải danh sách lỗi đơn vị, tải kết quả đơn vị, tải tổng hợp 162 đơn vị (giữ nguyên cột gốc + cột trạng thái). |
| **STAGE 9** | Security & Audit Logging | Chống upload file độc hại, giới hạn file size, validate MIME, không lộ DB trung tâm cho đơn vị, Audit Log đầy đủ. |
| **STAGE 10** | End-to-End Stress Testing | Test với dữ liệu mô phỏng 10 đơn vị / 1.000 người, và mở rộng 162 đơn vị / 34.000 người. Nghiệm thu luồng hoàn chỉnh. |
