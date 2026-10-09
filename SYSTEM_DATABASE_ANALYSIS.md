# BÁO CÁO PHÂN TÍCH TOÀN DIỆN CƠ SỞ DỮ LIỆU
## AGRIBANK DATA COLLECTION & AUDIT PLATFORM

---

## 1. TỔNG QUAN HỆ CƠ SỞ DỮ LIỆU

- **Hệ quản trị CSDL thực tế:** SQLite 3 (thông qua Node.js built-in `node:sqlite` — `DatabaseSync`).
- **File lưu trữ:** `data/database.sqlite` (kích thước ~824 KB).
- **Cấu hình hiệu năng:** 
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging tăng tốc độ ghi/đọc song song).
  - `PRAGMA synchronous = NORMAL;`
  - `PRAGMA foreign_keys = ON;`
- **Tổng số bảng:** 21 bảng vật lý.
- **Tổng số bản ghi thực tế trong CSDL:** 2.471 dòng.

---

## 2. BẢN ĐỒ THỰC THỂ LIÊN KẾT (ERD) DẠNG TEXT

```text
========================================================================================
                                PHÂN HỆ 1: QUẢN TRỊ ĐƠN VỊ & NGƯỜI DÙNG
========================================================================================

    ┌────────────────┐ 1        N ┌────────────────┐
    │     units      ├───────────►│     users      │
    │ (162+ Chi nhánh│            │ (Admin, Unit...)│
    └───────┬────────┘            └───────┬────────┘
            │ 1                           │ 1
            │                             │
            │ N                           │ N
            ▼                             ▼
    ┌──────────────────────────────────────────────┐
    │                  audit_logs                  │
    │     (Nhật ký kiểm toán truy vết thao tác)     │
    └──────────────────────────────────────────────┘

========================================================================================
                       PHÂN HỆ 2: MASTER DATABASE CÁN BỘ & ĐỐI CHIẾU THI
========================================================================================

    ┌────────────────────────┐
    │       employees        │
    │ (Master 34.000 cán bộ) │
    │ emp_code ↔ elearning   │
    └───────────┬────────────┘
                │
                │ [Logic đối chiếu 2 chiều: độc lập, không dùng FK cứng]
                ▼
    ┌────────────────┐ 1        N ┌────────────────┐ 1        N ┌────────────────┐
    │     exams      ├───────────►│  exam_uploads  ├───────────►│  exam_records  │
    │  (Kỳ thi cũ)   │            │(File staging vN│            │(Chi tiết cán bộ│
    └────────────────┘            └───────┬────────┘            └───────┬────────┘
                                          │ 1                           │ 1
                                          │                             │
                                          │ N                           │ N
                                          ▼                             ▼
                                  ┌──────────────────────────────────────────────┐
                                  │              validation_errors               │
                                  │      (Lỗi sai mã CB, sai eLearning...)       │
                                  └──────────────────────────────────────────────┘

========================================================================================
                       PHÂN HỆ 3: NỀN TẢNG THU THẬP ĐA BIỂU MẪU (DYNAMIC FORMS)
========================================================================================

    ┌────────────────┐ 1        N ┌────────────────┐ 1        N ┌────────────────┐
    │  collections   ├───────────►│     forms      ├───────────►│  form_fields   │
    │ (Đợt thu thập) │            │(Biểu mẫu động) │            │ (Trường dữ liệu│
    └───────┬────────┘            └───────┬────────┘            └────────────────┘
            │ 1                           │ 1
            │                             │
            │ N                           │ N
            ▼                             ▼
    ┌──────────────────────────────────────────────┐ 1        N ┌────────────────┐
    │                 submissions                  ├───────────►│submission_recor│
    │      (Hồ sơ nộp theo Form của từng Đơn vị)   │            │ (JSON data_val)│
    └──────────────────────┬───────────────────────┘            └───────┬────────┘
                           │ 1                                          │ 1
                           │                                            │
                           │ N                                          │ N
                           ▼                                            ▼
                   ┌─────────────────────────────────────────────────────────────┐
                   │                    form_validation_errors                   │
                   │              (Lỗi biểu mẫu: min, max, regex...)             │
                   └─────────────────────────────────────────────────────────────┘

========================================================================================
                       PHÂN HỆ 4: KHẢO SÁT NHU CẦU ĐÀO TẠO (VỊ TRÍ ↔ CHUYÊN ĐỀ)
========================================================================================

    ┌────────────────────┐ 1       N ┌──────────────────────────┐ N       1 ┌────────────────────┐
    │ training_positions ├──────────►│ training_position_topics ├───────────┤  training_topics   │
    │ (284 Vị trí chuẩn) │           │ (924 Quan hệ N - N)      │           │(304 Chuyên đề chuẩn│
    └─────────┬──────────┘           └──────────────────────────┘           └─────────┬──────────┘
              │ 1                                                                     │ 1
              │                                                                       │
              ▼                                                                       ▼
    ┌──────────────────────────┐ 1       N ┌──────────────────────────┐ N             │
    │training_demand_positions ├──────────►│  training_demand_topics  ├──────────────┘
    │(Vị trí đơn vị chọn &     │           │(Số người học >= 0 kèm    │
    │ target_headcount)        │           │ snapshot bất biến)       │
    └─────────▲────────────────┘           └──────────────────────────┘
              │ N
              │ 1
    ┌─────────┴────────────────┐
    │training_demand_submission│ ◄─── Thuộc collections(id) & units(id)
    │ (Hồ sơ khảo sát đơn vị)  │
    └──────────────────────────┘
```

---

## 3. CHI TIẾT 21 BẢNG TRONG CƠ SỞ DỮ LIỆU

### Nhóm 1: Quản trị Đơn vị & Người dùng

#### Bảng 1: `units` (Đơn vị chi nhánh toàn hệ thống)
- **Mục đích:** Danh mục các chi nhánh và đơn vị trực thuộc Agribank.
- **Số bản ghi hiện tại:** 305 dòng (bao gồm 162 chi nhánh loại I, các chi nhánh loại II, trung tâm hội sở).
- **Cấu trúc:**
  - `id`: INTEGER, Primary Key, Auto Increment.
  - `unit_code`: VARCHAR(50), UNIQUE, NOT NULL (Mã đơn vị: `8802`, `3160`, `1400`...).
  - `unit_name`: VARCHAR(255), NOT NULL (Tên đơn vị: `Chi nhánh Lào Cai II`...).
  - `status`: VARCHAR(20), DEFAULT `'ACTIVE'`.
  - `user_account`: TEXT, Nullable (Tài khoản người dùng liên kết nếu có).
  - `created_at`: TIMESTAMP, DEFAULT `CURRENT_TIMESTAMP`.
- **Ràng buộc:** `sqlite_autoindex_units_1` UNIQUE trên `unit_code`.

#### Bảng 2: `users` (Tài khoản người dùng)
- **Mục đích:** Quản lý tài khoản đăng nhập cho quản trị viên và đại diện 162 đơn vị.
- **Số bản ghi hiện tại:** 166 dòng (1 tài khoản `admin`, 165 tài khoản đơn vị dạng `unit_xxxx`).
- **Cấu trúc:**
  - `id`: INTEGER, Primary Key, Auto Increment.
  - `username`: VARCHAR(100), UNIQUE, NOT NULL.
  - `password_hash`: VARCHAR(255), NOT NULL (mã hóa bcrypt).
  - `full_name`: VARCHAR(255), NOT NULL.
  - `role`: VARCHAR(20), NOT NULL (`'SUPER_ADMIN'`, `'UNIT_ADMIN'`, `'VIEWER'`).
  - `unit_id`: INTEGER, Foreign Key tham chiếu `units(id)`.
  - `status`: VARCHAR(20), DEFAULT `'ACTIVE'`.
  - `created_at`: TIMESTAMP, DEFAULT `CURRENT_TIMESTAMP`.
- **Ràng buộc & Index:** UNIQUE trên `username`.

#### Bảng 3: `audit_logs` (Nhật ký kiểm toán hệ thống)
- **Mục đích:** Lưu trữ nhật vết truy cập, upload, kiểm tra, xác nhận và thay đổi dữ liệu.
- **Số bản ghi hiện tại:** 13 dòng.
- **Cấu trúc:**
  - `id`: INTEGER, Primary Key, Auto Increment.
  - `user_id`: INTEGER, Foreign Key tham chiếu `users(id)`.
  - `username`: VARCHAR(100).
  - `unit_id`: INTEGER, Foreign Key tham chiếu `units(id)`.
  - `action`: VARCHAR(100), NOT NULL (`LOGIN`, `UPLOAD_EXAM_FILE`, `SUBMIT_OFFICIAL`...).
  - `details`: TEXT (lưu chi tiết JSON).
  - `ip_address`: VARCHAR(50).
  - `created_at`: TIMESTAMP, DEFAULT `CURRENT_TIMESTAMP`.
- **Index:** `idx_audit_created` trên `(created_at)`.

---

### Nhóm 2: Phân hệ CSDL Cán bộ Trung tâm & Thi (Legacy Module)

#### Bảng 4: `employees` (Master Employee Database)
- **Mục đích:** Nguồn xác thực duy nhất 1-1 giữa Mã cán bộ và Tài khoản eLearning toàn hệ thống.
- **Số bản ghi hiện tại:** 245 dòng (mẫu thử nghiệm, thực tế thiết kế chịu tải 34.000 cán bộ).
- **Cấu trúc:**
  - `id`: INTEGER, Primary Key, Auto Increment.
  - `employee_code`: VARCHAR(50), UNIQUE, NOT NULL.
  - `elearning_account`: VARCHAR(100), UNIQUE, NOT NULL.
  - `full_name`: VARCHAR(255), NOT NULL.
  - `unit_code`: VARCHAR(50), Nullable.
  - `unit_name`: VARCHAR(255), Nullable.
  - `department`: VARCHAR(255), Nullable.
  - `position`: VARCHAR(255), Nullable.
  - `raw_info`: TEXT, Nullable.
  - `created_at`, `updated_at`: TIMESTAMP.
- **Indexes:** 
  - `idx_emp_code` trên `(employee_code)`
  - `idx_emp_elearn` trên `(elearning_account)`
  - `idx_emp_unit` trên `(unit_code)`

#### Bảng 5: `exams` (Kỳ thi / Đợt kiểm tra)
- **Số bản ghi:** 4 dòng.
- **Cấu trúc:** `id`, `code` (UNIQUE), `title`, `description`, `status` (`'OPEN'`, `'CLOSED'`), `start_date`, `end_date`, `created_at`.

#### Bảng 6: `exam_uploads` (Lịch sử upload file của đơn vị)
- **Số bản ghi:** 1 dòng.
- **Cấu trúc:** `id`, `exam_id` (FK), `unit_id` (FK), `version`, `file_name`, `file_size`, `file_hash`, `original_file_path`, `total_rows`, `valid_rows`, `error_rows`, `status` (`'STAGING'`, `'VALIDATED'`, `'OFFICIAL_SUBMITTED'`), `uploaded_by` (FK), `submitted_at`, `created_at`.
- **Index:** `idx_uploads_unit_exam` trên `(unit_id, exam_id)`.

#### Bảng 7: `exam_records` (Dữ liệu danh sách thí sinh nộp)
- **Số bản ghi:** 100 dòng.
- **Cấu trúc:** `id`, `upload_id` (FK CASCADE), `exam_id` (FK), `unit_id` (FK), `row_index`, `employee_code`, `elearning_account`, `full_name`, `raw_data` (TEXT JSON chứa 100% cột gốc), `validation_status`, `validation_message`, `created_at`.
- **Indexes:** `idx_records_upload`, `idx_records_emp_code`, `idx_records_elearn`.

#### Bảng 8: `validation_errors` (Chi tiết lỗi đối chiếu 2 chiều của file thi)
- **Số bản ghi:** 100 dòng.
- **Cấu trúc:** `id`, `upload_id` (FK CASCADE), `record_id` (FK CASCADE), `row_index`, `employee_code`, `elearning_account`, `error_type`, `error_message`, `created_at`.
- **Index:** `idx_val_errors_upload`.

---

### Nhóm 3: Phân hệ Đa Biểu mẫu (Dynamic Forms Engine)

#### Bảng 9: `collections` (Đợt thu thập dữ liệu tổng quát)
- **Số bản ghi hiện tại:** 1 dòng (`id = 1`, `code = 'COLL_2026_Q1'`, `title = 'Đợt Thu Thập Dữ Liệu Quý I/2026'`).
- **Cấu trúc:** `id`, `code` (UNIQUE), `title`, `description`, `status` (`'OPEN'`, `'CLOSED'`, `'ARCHIVED'`), `start_date`, `end_date`, `created_at`.

#### Bảng 10: `forms` (Biểu mẫu thu thập thuộc Collection)
- **Số bản ghi hiện tại:** 2 dòng:
  1. `FORM_EXAM_CANDIDATES`: Chế độ `MASTER_VALIDATION` (đối chiếu mã CB ↔ eLearning).
  2. `FORM_BRANCH_FACILITIES`: Chế độ `FORM_VALIDATION_ONLY` (khảo sát cơ sở vật chất).
- **Cấu trúc:** `id`, `collection_id` (FK CASCADE), `form_code`, `title`, `description`, `input_method` (`'EXCEL'`, `'WEB_FORM'`, `'BOTH'`), `validation_mode` (`'MASTER_VALIDATION'`, `'FORM_VALIDATION_ONLY'`), `employee_code_field`, `elearning_field`, `status`, `display_order`, `created_at`.
- **Ràng buộc:** UNIQUE trên `(collection_id, form_code)`, index `idx_forms_collection`.

#### Bảng 11: `form_fields` (Cấu hình trường của Form Builder)
- **Số bản ghi:** 6 dòng.
- **Cấu trúc:** `id`, `form_id` (FK CASCADE), `field_name`, `label`, `field_type` (`'TEXT'`, `'NUMBER'`, `'SINGLE_SELECT'`, `'DATE'`...), `required`, `default_value`, `options` (JSON), `validation_rules` (JSON: min, max, regex), `display_order`, `created_at`.
- **Index:** `idx_form_fields_form`.

#### Bảng 12: `submissions` (Hồ sơ nộp dữ liệu của đơn vị cho Form)
- **Số bản ghi:** 0 dòng.
- **Cấu trúc:** `id`, `form_id` (FK CASCADE), `collection_id` (FK), `unit_id` (FK), `version`, `input_method`, `file_name`, `file_size`, `file_hash`, `total_rows`, `valid_rows`, `error_rows`, `status` (`'STAGING'`, `'VALIDATED'`, `'OFFICIAL_SUBMITTED'`), `submitted_by` (FK), `submitted_at`, `created_at`.
- **Indexes:** `idx_submissions_form_unit`, `idx_submissions_collection`.

#### Bảng 13: `submission_records` (Bản ghi kê khai dạng JSON động)
- **Số bản ghi:** 0 dòng.
- **Cấu trúc:** `id`, `submission_id` (FK CASCADE), `form_id` (FK), `unit_id` (FK), `row_index`, `employee_code` (Nullable), `elearning_account` (Nullable), `full_name` (Nullable), `data_values` (TEXT JSON chứa toàn bộ key-value động), `validation_status`, `validation_message`, `created_at`.
- **Index:** `idx_sub_records_sub`.

#### Bảng 14: `form_validation_errors` (Lỗi kiểm tra biểu mẫu động)
- **Số bản ghi:** 0 dòng.
- **Cấu trúc:** `id`, `submission_id` (FK CASCADE), `record_id` (FK CASCADE), `row_index`, `field_name`, `error_type`, `error_message`, `created_at`.
- **Index:** `idx_form_val_errors_sub`.

---

### Nhóm 4: Phân hệ Khảo sát Nhu cầu Đào tạo (Master Training Catalog & Demand)

#### Bảng 15: `training_positions` (Danh mục Vị trí / Chức danh chuẩn)
- **Số bản ghi hiện tại:** 284 dòng.
- **Cấu trúc:** `id`, `code` (VARCHAR(100) UNIQUE), `name`, `group_name`, `description`, `status` (`'ACTIVE'`, `'INACTIVE'`), `display_order`, `created_at`, `updated_at`.
- **Indexes:** `idx_pos_code`, `sqlite_autoindex_training_positions_1` [UNIQUE].

#### Bảng 16: `training_topics` (Danh mục Chuyên đề đào tạo chuẩn)
- **Số bản ghi hiện tại:** 304 dòng.
- **Cấu trúc:** `id`, `code`, `name` (NOT NULL), `delivery_method`, `duration`, `learning_path`, `competency`, `prerequisite`, `certificate_requirement`, `description`, `status` (`'ACTIVE'`, `'INACTIVE'`), `display_order`, `created_at`, `updated_at`.
- **Index:** `idx_topic_name`.

#### Bảng 17: `training_position_topics` (Quan hệ N - N giữa Vị trí và Chuyên đề)
- **Số bản ghi hiện tại:** 924 dòng.
- **Cấu trúc:** `id`, `position_id` (FK CASCADE), `topic_id` (FK CASCADE), `display_order`, `created_at`.
- **Ràng buộc:** UNIQUE trên `(position_id, topic_id)`.
- **Indexes:** `idx_pos_top_pos`, `idx_pos_top_top`.

#### Bảng 18: `training_catalog_imports` (Nhật ký Import Master Catalog)
- **Số bản ghi hiện tại:** 1 dòng.
- **Cấu trúc:** `id`, `import_batch_id`, `file_name`, `imported_by` (FK), `total_rows`, `positions_created`, `topics_created`, `relations_created`, `error_count`, `created_at`.

#### Bảng 19: `training_demand_submissions` (Hồ sơ khảo sát đào tạo của đơn vị)
- **Số bản ghi hiện tại:** 0 dòng (sau khi chạy test và dọn dẹp fixture).
- **Cấu trúc:** `id`, `collection_id` (FK), `form_id` (FK Nullable), `unit_id` (FK), `version`, `status` (`'DRAFT'`, `'SUBMITTED'`, `'REOPENED'`), `note`, `submitted_by` (FK), `submitted_at`, `created_at`, `updated_at`.
- **Index:** `idx_demand_sub_unit_coll` trên `(collection_id, unit_id)`.

#### Bảng 20: `training_demand_positions` (Vị trí đơn vị đã kê khai)
- **Số bản ghi hiện tại:** 0 dòng.
- **Cấu trúc:** `id`, `submission_id` (FK CASCADE), `position_id` (FK), `target_headcount` (INTEGER >= 0), `created_at`.
- **Ràng buộc:** UNIQUE trên `(submission_id, position_id)` (chặn trùng vị trí trong cùng hồ sơ).
- **Index:** `idx_demand_pos_sub`.

#### Bảng 21: `training_demand_topics` (Chi tiết số người đăng ký theo chuyên đề)
- **Số bản ghi hiện tại:** 0 dòng.
- **Cấu trúc:** `id`, `demand_position_id` (FK CASCADE), `topic_id` (FK), `participant_count` (INTEGER >= 0), `topic_name_snapshot`, `duration_snapshot`, `delivery_method_snapshot`, `created_at`.
- **Ràng buộc:** UNIQUE trên `(demand_position_id, topic_id)` [UNIQUE index: `idx_demand_top_pos_unique`].
- **Indexes:** `idx_demand_top_pos`, `idx_demand_top_top`.

---

## 4. ĐÁNH GIÁ CHẤT LƯỢNG CƠ SỞ DỮ LIỆU (DATABASE QUALITY)

### 4.1. Chuẩn hóa & Toàn vẹn Dữ liệu (Integrity & Normalization)
- **Dữ liệu trùng lặp (Duplicate):** 
  - Đạt 100% không có trùng lặp trên các khóa tự nhiên: `units.unit_code`, `users.username`, `employees.employee_code`, `employees.elearning_account`, `training_positions.code`.
  - Bảng quan hệ N-N `training_position_topics` có ràng buộc UNIQUE `(position_id, topic_id)`, ngăn chặn hoàn toàn việc gán trùng 1 chuyên đề nhiều lần cho cùng 1 vị trí.
- **Nguy cơ Orphan Records:** Rất thấp do hầu hết các bảng con (`exam_records`, `validation_errors`, `form_fields`, `submission_records`, `training_demand_positions`, `training_demand_topics`) đều có khai báo `ON DELETE CASCADE`.
- **Snapshot Immutability:** Bảng `training_demand_topics` lưu trữ các trường `topic_name_snapshot`, `duration_snapshot`, `delivery_method_snapshot`. Điều này bảo vệ dữ liệu lịch sử các đợt khảo sát cũ không bị sai lệch nếu sau này Master Catalog thay đổi.

### 4.2. Độ bao phủ Index (Index Coverage)
- **Đã có:** 19 indexes chuyên biệt cho:
  - Khóa tìm kiếm người dùng: `idx_emp_code`, `idx_emp_elearn`, `idx_emp_unit`.
  - Phân vùng đơn vị & đợt: `idx_uploads_unit_exam`, `idx_submissions_form_unit`, `idx_demand_sub_unit_coll`.
  - Truy vấn liên kết bảng con: `idx_records_upload`, `idx_sub_records_sub`, `idx_demand_pos_sub`, `idx_demand_top_pos`.
  - Quan hệ N-N: `idx_pos_top_pos`, `idx_pos_top_top`.
- **Thiếu sót cần cải thiện:**
  - Chưa có index trên cột `status` của các bảng nộp bài (`submissions`, `training_demand_submissions`).
  - Cột `users.username` chỉ có UNIQUE autoindex, nhưng trong code thường xuyên truy vấn `LOWER(username)` $\rightarrow$ Cần thêm expression index `idx_users_lower_username ON users(LOWER(username))` để tối ưu.

### 4.3. Khả năng chịu tải (Scalability Assessment)
- **Đối với 162 đơn vị:** Hoạt động rất mượt mà trong chế độ WAL mode của SQLite.
- **Đối với 34.000 cán bộ:** B-Tree index của SQLite trên cột `VARCHAR` xử lý truy vấn tìm kiếm `SELECT WHERE employee_code = ?` trong dưới 1 miligiây.
- **Điểm nghẽn tiềm ẩn khi mở rộng quy mô cực lớn:**
  - SQLite có cơ chế **Single-Writer Lock** (chỉ 1 tiến trình được ghi tại 1 thời điểm). Nếu 162 đơn vị nộp file Excel đồng thời trong cùng 1 phút, các transaction ghi có thể phải chờ xếp hàng (busy timeout).
  - Khuyến nghị nâng cấp lên **PostgreSQL** nếu mở rộng cho toàn bộ 34.000 cán bộ tự đăng nhập trực tiếp thay vì chỉ 162 tài khoản quản trị đơn vị.
