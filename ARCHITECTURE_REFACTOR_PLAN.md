# KẾ HOẠCH CẢI TỔ KIẾN TRÚC HỆ THỐNG
## NỀN TẢNG THU THẬP DỮ LIỆU ĐA BIỂU MẪU TỪ 162 ĐƠN VỊ
*(Agribank Data Collection Platform — Modular Form & Validation Engine Architecture)*

---

## I. HIỆN TRẠNG HỆ THỐNG & ĐÁNH GIÁ MỨC ĐỘ TÁC ĐỘNG

### 1. Những phần giữ nguyên (100% Bảo toàn)
- **Hệ thống xác thực & Phân quyền:** Cookie JWT HttpOnly, bảng `users`, 3 vai trò `SUPER_ADMIN`, `UNIT_ADMIN`, `VIEWER`.
- **162 Đơn vị:** Toàn bộ bảng `units` (162 đơn vị) và tài khoản các đơn vị, cơ chế đăng nhập theo đơn vị.
- **Master Employee Database:** Bảng `employees` (Mã cán bộ, Tài khoản eLearning, Họ tên, Phòng ban, Chức vụ...).
- **Thuật toán đối chiếu 2 chiều (Bidirectional Check):** Giữ nguyên vẹn logic kiểm tra 2 chiều (`WRONG_EMPLOYEE_CODE`, `WRONG_ELEARNING`, `CROSS_PERSON_MISMATCH`, `DUPLICATE...`). Thuật toán này sẽ được đóng gói thành **Module con `MasterValidationStrategy`** trong `ValidationEngine`.
- **Bộ máy xử lý Excel (Excel Parser):** Đọc workbook đa sheet, dò tìm dòng tiêu đề tự động, mapping cột linh hoạt.
- **Nhật ký kiểm toán:** Bảng `audit_logs` ghi vết đầy đủ thao tác.
- **Giao diện chuẩn Agribank:** Màu sắc `#005F3E` (Xanh lá đậm), `#A81D22` (Đỏ đô), `#F2A900` (Vàng lúa), Responsive Sidebar.

### 2. Những điểm hạn chế của kiến trúc cũ cần cải tổ
- **Cấu trúc 1 tầng (`exams` -> `exam_uploads`):** Mặc định mỗi "kỳ" chỉ thu thập đúng 1 file danh sách thí sinh.
- **Hard-coded cột định danh:** Bảng `exam_records` và `exam_uploads` gắn cứng các trường `employee_code`, `elearning_account` và bắt buộc đối chiếu với `employees`.
- **Thiếu khái niệm Form động:** Không thể tạo biểu mẫu khảo sát ý kiến, khảo sát nhu cầu đào tạo của đơn vị nếu không có danh sách cán bộ.

---

## II. THIẾT KẾ KIẾN TRÚC MỚI (COLLECTION → FORM → SUBMISSION)

Hệ thống chuyển đổi sang mô hình 3 lớp phân cấp rõ ràng:

```text
┌────────────────────────────────────────────────────────┐
│ MASTER DATA (employees, units)                        │
│ Dữ liệu danh mục chuẩn trung ương phục vụ định danh   │
└──────────────────────────┬─────────────────────────────┘
                           │ (Chỉ tham chiếu khi Form yêu cầu)
                           ▼
┌────────────────────────────────────────────────────────┐
│ COLLECTION (Đợt thu thập dữ liệu)                      │
│ Ví dụ: "Thu thập & Khảo sát Nhu cầu Đào tạo Năm 2027" │
│ Quản lý thời hạn: OPEN / CLOSED                        │
└──────────────────────────┬─────────────────────────────┘
                           │ 1 Collection có N Forms
                           ▼
┌────────────────────────────────────────────────────────┐
│ FORMS (Biểu mẫu thu thập)                             │
│ ├── Input Method: EXCEL / WEB_FORM                    │
│ ├── Validation Mode: MASTER_VALIDATION                │
│ │                    hoặc FORM_VALIDATION_ONLY        │
│ └── Form Fields & Rules (Cấu hình động các trường)     │
└──────────────────────────┬─────────────────────────────┘
                           │ 1 Form có N Submissions theo Unit
                           ▼
┌────────────────────────────────────────────────────────┐
│ SUBMISSIONS (Hồ sơ kê khai của từng Đơn vị)           │
│ ├── Versioning: v1, v2, v3...                         │
│ ├── Records & Form Values (raw_data JSON linh hoạt)   │
│ └── Validation Errors & Status: HỢP LỆ / CÓ LỖI / GỬI │
└────────────────────────────────────────────────────────┘
```

---

## III. THIẾT KẾ DATABASE MIGRATION (TƯƠNG THÍCH NGƯỢC 100%)

Để đảm bảo không làm mất dữ liệu hiện tại, ta tạo các bảng mới và thiết lập view/fallback tương thích:

### 1. Bảng `collections` (Thay thế/mở rộng `exams`)
```sql
CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'OPEN', -- 'OPEN' | 'CLOSED' | 'ARCHIVED'
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Bảng `forms` (Biểu mẫu thuộc Collection)
```sql
CREATE TABLE IF NOT EXISTS forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    form_code VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    input_method VARCHAR(20) DEFAULT 'EXCEL', -- 'EXCEL' | 'WEB_FORM' | 'BOTH'
    validation_mode VARCHAR(30) DEFAULT 'FORM_VALIDATION_ONLY', -- 'MASTER_VALIDATION' | 'FORM_VALIDATION_ONLY'
    employee_code_field VARCHAR(100) DEFAULT 'employee_code', -- Chỉ dùng khi MASTER_VALIDATION
    elearning_field VARCHAR(100) DEFAULT 'elearning_account',  -- Chỉ dùng khi MASTER_VALIDATION
    status VARCHAR(20) DEFAULT 'ACTIVE',
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, form_code)
);
```

### 3. Bảng `form_fields` (Định nghĩa trường cho Form Builder)
```sql
CREATE TABLE IF NOT EXISTS form_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL, -- Tên biến (training_topic, quantity...)
    label VARCHAR(255) NOT NULL,      -- Nhãn hiển thị ("Lĩnh vực đào tạo")
    field_type VARCHAR(30) NOT NULL,  -- 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATE' | 'DATETIME' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'RADIO' | 'CHECKBOX' | 'FILE'
    required INTEGER DEFAULT 0,       -- 1: Bắt buộc, 0: Tuỳ chọn
    default_value TEXT,
    options TEXT,                     -- JSON Array cho select/radio ["Online", "Trực tiếp"]
    validation_rules TEXT,            -- JSON: {"min": 0, "max": 10000, "regex": "..."}
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. Bảng `submissions` & `submission_records` (Lưu trữ theo từng Form & Đơn vị)
```sql
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    collection_id INTEGER NOT NULL REFERENCES collections(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    version INTEGER NOT NULL DEFAULT 1,
    input_method VARCHAR(20) DEFAULT 'EXCEL', -- 'EXCEL' | 'WEB_FORM'
    file_name VARCHAR(255),
    file_size INTEGER,
    file_hash VARCHAR(64),
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'STAGING', -- 'STAGING' | 'VALIDATED' | 'OFFICIAL_SUBMITTED'
    submitted_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submission_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    form_id INTEGER NOT NULL REFERENCES forms(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    row_index INTEGER NOT NULL,
    employee_code VARCHAR(50),      -- NULL nếu form khảo sát
    elearning_account VARCHAR(100), -- NULL nếu form khảo sát
    full_name VARCHAR(255),
    data_values TEXT NOT NULL,       -- JSON lưu toàn bộ trường của dòng kê khai
    validation_status VARCHAR(20) DEFAULT 'VALID', -- 'VALID' | 'INVALID'
    validation_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS form_validation_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    record_id INTEGER REFERENCES submission_records(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    field_name VARCHAR(100),
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## IV. THIẾT KẾ VALIDATION ENGINE MỚI (TÁCH BIỆT 2 TẦNG)

Cấu trúc module `src/lib/validation-engine/`:

```text
src/lib/validation/
├── index.ts                 # Facade chính: validateSubmission()
├── types.ts                 # Interfaces cho Rules, Field, Errors
├── form-validator.ts        # Chạy kiểm tra quy tắc Biểu mẫu (Required, Type, Number range, Select options...)
└── master-validator.ts      # Chạy kiểm tra 2 chiều với Master Employees (Mã CB ↔ eLearning)
```

### Luồng thực thi:
1. **Nếu `validation_mode === 'FORM_VALIDATION_ONLY'`:**
   - Chạy `validateFormRules(record, formFields)`.
   - **TUYỆT ĐỐI KHÔNG** kết nối hoặc query bảng `employees`.
   - Nếu vi phạm (thiếu trường required, số lượng < 0...): ghi lỗi `FORM_VALIDATION_ERROR`.
   - Nếu hợp lệ: đánh dấu `VALID`.

2. **Nếu `validation_mode === 'MASTER_VALIDATION'`:**
   - Bước 1: Chạy `validateFormRules(...)`.
   - Bước 2: Chạy `validateMasterBidirectional(...)` (kiểm tra tồn tại Mã CB, tồn tại eLearning, kiểm tra chéo 2 chiều cùng 1 người, trùng lặp nội bộ).
   - Bản ghi chỉ được tính là `VALID` khi cả 2 bước đều đạt 100%.

---

## V. KẾ HOẠCH TRIỂN KHAI THEO 12 GIAI ĐOẠN (STAGES)

- **STAGE 1:** Phân tích code hiện tại *(Đã hoàn thành)*.
- **STAGE 2:** Thiết kế kiến trúc Collection → Form → Submission *(Tài liệu này)*.
- **STAGE 3:** Tạo migration schema và script khởi tạo dữ liệu mẫu chứng minh 2 loại Form trong cùng 1 Collection:
  - Form 1: *Danh sách cán bộ* (`MASTER_VALIDATION`, Input: EXCEL).
  - Form 2: *Khảo sát nhu cầu đào tạo đơn vị* (`FORM_VALIDATION_ONLY`, Input: WEB_FORM / EXCEL).
- **STAGE 4 & 5:** Tách Validation Engine thành 2 module riêng biệt hỗ trợ `validation_mode`.
- **STAGE 6:** Xây dựng Form Builder giao diện và API quản lý fields/rules.
- **STAGE 7 & 8:** Cập nhật Unit Dashboard: Cho phép đơn vị chọn Form trong Collection để làm việc (nhập web form hoặc nạp Excel).
- **STAGE 9:** Cập nhật Admin Dashboard: Hiển thị bảng tổng hợp tiến độ theo từng Form trong Collection.
- **STAGE 10:** Reporting & Export Engine linh hoạt theo từng Form.
- **STAGE 11:** Bộ Automated Test Suite kiểm thử 6 ca bắt buộc (Test A -> Test F).
- **STAGE 12:** Security review và kiểm tra toàn diện.

---
*Kế hoạch đã sẵn sàng để thực hiện từng bước có kiểm soát.*
