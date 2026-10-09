# BẢN ĐỒ KIẾN TRÚC HỆ THỐNG
## AGRIBANK DATA COLLECTION & AUDIT PLATFORM

---

## 1. SƠ ĐỒ KIẾN TRÚC TỔNG THỂ (SYSTEM TOPOLOGY)

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TRÌNH DUYỆT NGƯỜI DÙNG                                │
│       [162 Đơn vị Chi nhánh (UNIT_ADMIN)]        [Quản trị viên Trung tâm (SUPER_ADMIN)] │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ HTTP / HTTPS (JSON & Multipart Form-Data)
                                             │ Cookie: auth_token (HttpOnly, SameSite=Lax)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS 15 APP ROUTER APPLICATION                              │
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              TẦNG GIAO DIỆN (UI / PAGES)                          │  │
│  │  • /login: Màn hình đăng nhập hệ thống                                            │  │
│  │  • /unit: Tổng quan kê khai, tải mẫu, upload Excel, xem lỗi, xác nhận gửi         │  │
│  │  • /unit/training-demand: Khảo sát nhu cầu đào tạo (Vị trí -> Chuyên đề)          │  │
│  │  • /admin: Bảng điều khiển tiến độ 162 đơn vị, tỷ lệ lỗi, KPI hệ thống            │  │
│  │  • /admin/exams: Quản lý đợt kiểm tra / kỳ thi                                     │  │
│  │  • /admin/forms: Quản lý Biểu mẫu động (Forms Builder)                           │  │
│  │  • /admin/master-db: Quản trị CSDL 34.000 cán bộ trung tâm                        │  │
│  │  • /admin/training-demand: Quản trị Master Catalog, Ma trận 162 ĐV, Báo cáo & Reopen│ │
│  │  • /admin/audit-log: Nhật ký kiểm toán thao tác người dùng                        │  │
│  └─────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                            │ React Fetch API / Server Actions           │
│                                            ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          TẦNG API BACKEND (ROUTE HANDLERS)                        │  │
│  │  • /api/auth/*: login, logout, me, change-password, reset-password                │  │
│  │  • /api/uploads: Xử lý upload Excel, staging, kích hoạt đối chiếu 2 chiều         │  │
│  │  • /api/records: Phân trang danh sách cán bộ nộp & kết quả đối chiếu              │  │
│  │  • /api/confirm-submission: Xác nhận nộp chính thức (chặn nếu còn lỗi)           │  │
│  │  • /api/forms & /api/submissions: Thu thập dữ liệu biểu mẫu động (Dynamic Form)   │  │
│  │  • /api/training-catalog: Tra cứu danh mục, audit duplicate, toggle active status │  │
│  │  • /api/training-demand: Lưu draft, headcount, topic counts, submit, reopen       │  │
│  │  • /api/training-reports: Tổng hợp ma trận 162 đơn vị, xuất Excel 4 định dạng    │  │
│  │  • /api/export: Xuất Excel danh sách lỗi, dữ liệu đơn vị, toàn hệ thống           │  │
│  │  • /api/audit-logs: Truy vấn nhật ký kiểm toán                                    │  │
│  └─────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                            │                                            │
│  ┌─────────────────────────────────────────┴─────────────────────────────────────────┐  │
│  │                           TẦNG CORE ENGINES & THƯ VIỆN LÕI                        │  │
│  │                                                                                   │  │
│  │  ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────────────┐  │  │
│  │  │   auth.ts         │    │   excel.ts        │    │   validation-engine.ts    │  │  │
│  │  │   • JWT sign/ver  │    │   • Header detect │    │   • MasterValidation (2c) │  │  │
│  │  │   • Bcrypt verify │    │   • Column map    │    │   • FormRulesOnly (min/   │  │  │
│  │  │   • Session parse │    │   • Sheet parser  │    │     max/regex/select)     │  │  │
│  │  └───────────────────┘    └───────────────────┘    └───────────────────────────┘  │  │
│  │                                                                                   │  │
│  │  ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────────────┐  │  │
│  │  │   audit.ts        │    │   validation.ts   │    │   db.ts                   │  │  │
│  │  │   • Log entry ghi │    │   • Legacy Exam   │    │   • SQLite DatabaseSync   │  │  │
│  │  │     vào audit_logs│    │     Validator     │    │   • WAL mode, Singleton   │  │  │
│  │  └───────────────────┘    └───────────────────┘    └───────────────────────────┘  │  │
│  └─────────────────────────────────────────┬─────────────────────────────────────────┘  │
└────────────────────────────────────────────┼────────────────────────────────────────────┘
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      ▼                                             ▼
       ┌──────────────────────────────┐              ┌──────────────────────────────┐
       │   CƠ SỞ DỮ LIỆU SQLITE       │              │      LOCAL FILE STORAGE      │
       │   data/database.sqlite       │              │      uploads_storage/        │
       │   (21 bảng, 19 indexes, WAL) │              │  (Lưu trữ file Excel gốc)    │
       └──────────────────────────────┘              └──────────────────────────────┘
```

---

## 2. BẢN ĐỒ DÒNG DỮ LIỆU CHÍNH (DATA FLOW PIPELINES)

### Pipeline 1: Xác thực & Quản trị Phiên (Authentication & Session Guard)

```text
Người dùng nhập User/Pass
          │
          ▼
POST /api/auth/login
          │
          ├─► authenticateUser() [src/lib/auth.ts]
          │   Tìm user theo username (hoặc username_admin)
          │   Kiểm tra mật khẩu qua bcrypt (có bypass khẩn cấp Unit@123456)
          │
          ├─► signToken() tạo JWT (thời hạn 7 ngày)
          ├─► Ghi audit_logs hành động LOGIN
          │
          ▼
Trả về Set-Cookie: auth_token=jwt; HttpOnly; SameSite=Lax; Path=/
          │
          ▼
Mọi Request tiếp theo:
getSessionFromRequest(req) giải mã JWT từ Cookie -> Trả về UserSession { id, role, unitId }
          │
          ├─► Nếu role = 'UNIT_ADMIN': Mọi truy vấn bị khóa chặt bởi WHERE unit_id = session.unitId
          └─► Nếu role = 'SUPER_ADMIN': Toàn quyền giám sát 162 đơn vị
```

---

### Pipeline 2: Thu nộp & Đối chiếu Hai chiều File Thí sinh (Legacy Exam Flow)

```text
Đơn vị upload File Excel (.xlsx) qua /api/uploads
          │
          ├─► Kiểm tra đuôi file (.xlsx, .xls, .csv) & Kích thước (< 25MB)
          ├─► Tính SHA-256 Hash
          ├─► Lưu bản sao file vật lý vào uploads_storage/unit_{id}_exam_{id}_v{n}.xlsx
          │
          ▼
Phân tích cấu trúc (src/lib/excel.ts)
          │
          ├─► Dò tìm dòng tiêu đề tự động (detectHeaderAndMapping) dựa trên trọng số từ khóa
          ├─► Khớp cột: Mã cán bộ, Tài khoản eLearning, Họ tên
          ├─► Trích xuất toàn bộ dòng dữ liệu, bảo toàn 100% cột nghiệp vụ trong raw_data (JSON)
          │
          ▼
Thuật toán Đối chiếu 2 chiều (src/lib/validation.ts hoặc validation-engine.ts)
          │
          ├─► Kiểm tra trùng nội bộ file (duplicate code / duplicate elearn)
          ├─► Truy vấn Master Database:
          │   • Tìm theo Mã CB: SELECT WHERE employee_code = ?
          │   • Tìm theo eLearning: SELECT WHERE elearning_account = ?
          │
          ├─► 4 Kịch bản kiểm tra:
          │   1. Khớp hoàn toàn cả hai: HỢP LỆ
          │   2. Đúng Mã CB, sai eLearning: Báo lỗi WRONG_ELEARNING + chỉ ra eLearning chuẩn
          │   3. Đúng eLearning, sai Mã CB: Báo lỗi WRONG_EMPLOYEE_CODE + chỉ ra Mã CB chuẩn
          │   4. Tồn tại nhưng thuộc 2 người khác nhau: Báo lỗi CROSS_PERSON_MISMATCH
          │   5. Cả hai đều không có: Báo lỗi UNKNOWN_BOTH
          │
          ▼
Ghi dữ liệu vào Transaction
          │
          ├─► INSERT exam_uploads (lưu tổng dòng, dòng đúng, dòng lỗi, status = 'STAGING')
          ├─► INSERT exam_records (lưu từng dòng kèm raw_data và trạng thái)
          ├─► INSERT validation_errors (lưu từng lỗi cụ thể)
          └─► COMMIT
          │
          ▼
Đơn vị xem kết quả trên giao diện:
          ├─► Nếu còn lỗi: Bấm "Tải file lỗi về sửa" -> Nộp phiên bản mới (v2, v3...)
          └─► Nếu 0 lỗi: Nút "GỬI CHÍNH THỨC" sáng lên -> POST /api/confirm-submission
```

---

### Pipeline 3: Nền tảng Thu thập Đa Biểu mẫu (Dynamic Form Pipeline)

```text
Admin tạo Form tại /admin/forms
          │
          ├─► Chọn Collection (Đợt thu thập)
          ├─► Chọn Validation Mode:
          │   • MASTER_VALIDATION: Yêu cầu Mã CB & eLearning đối chiếu Master DB
          │   • FORM_VALIDATION_ONLY: Chỉ kiểm tra quy tắc trường biểu mẫu
          │
          ├─► Thiết lập các trường Form Builder (form_fields):
          │   Tên trường, nhãn, kiểu (TEXT, NUMBER, SINGLE_SELECT, DATE...),
          │   bắt buộc (required), validation_rules JSON (min, max, regex)
          │
          ▼
Đơn vị kê khai (Web Form hoặc Excel) qua /api/submissions
          │
          ├─► validateSubmissionBatch() [src/lib/validation-engine.ts]
          │   • Nếu FORM_VALIDATION_ONLY: Kiểm tra kiểu dữ liệu, required, danh mục options, min, max
          │   • Nếu MASTER_VALIDATION: Chạy tiếp thuật toán đối chiếu 2 chiều với employees
          │
          ├─► Lưu vào submissions, submission_records (data_values JSON), form_validation_errors
          └─► Phân tách hoàn toàn giữa các Form và các Collection khác nhau
```

---

### Pipeline 4: Khảo sát Nhu cầu Đào tạo (Training Demand Pipeline)

```text
Admin nạp Master Training Catalog từ "phụ lục danh mục đào tạo.xlsx"
          │
          ▼
Master Catalog chuẩn hóa trong CSDL:
          • training_positions (284 Vị trí)
          • training_topics (304 Chuyên đề)
          • training_position_topics (924 Quan hệ N-N)
          │
          ▼
Đơn vị kê khai tại /unit/training-demand:
          │
          ├─► Chọn Vị trí chức danh (Hệ thống tự động tải các Chuyên đề phù hợp)
          ├─► Nhập Tổng nhân sự của nhóm vị trí tại đơn vị (headcount)
          ├─► Nhập Số người có nhu cầu học theo từng chuyên đề (hoặc "Áp dụng cho tất cả")
          ├─► Kiểm tra validation: số nguyên >= 0; cảnh báo nếu số người > headcount
          ├─► Chặn thêm trùng vị trí trong cùng hồ sơ
          │
          ▼
POST /api/training-demand:
          │
          ├─► Lưu vào training_demand_positions & training_demand_topics
          ├─► Lưu Snapshot bất biến: topic_name_snapshot, duration_snapshot, delivery_method_snapshot
          ├─► Trạng thái: DRAFT (Lưu nháp) hoặc SUBMITTED (Gửi chính thức)
          │
          ▼
Admin giám sát tại /admin/training-demand:
          ├─► Xem KPI 162 đơn vị (Đã gửi, Đang soạn, Chưa nộp, Tổng lượt người)
          ├─► Tab 1: Ma trận theo Vị trí (Xem số người từng đơn vị đăng ký theo chuyên đề)
          ├─► Tab 2: Báo cáo theo Chuyên đề (Xem các vị trí áp dụng & các đơn vị đăng ký)
          ├─► Tab 3: Báo cáo theo Đơn vị & Mở lại (Reopen) cho đơn vị chỉnh sửa
          ├─► Tab 4: Quản trị Master Catalog (Audit duplicate, N-N, toggle status Active/Inactive)
          └─► Tab 5: Xuất Excel (Toàn hệ thống, Theo vị trí, Theo chuyên đề, Theo đơn vị)
```

---

## 3. MA TRẬN PHÂN QUYỀN & CÔ LẬP ĐƠN VỊ (UNIT ISOLATION MATRIX)

| API Endpoint | Phương thức | SUPER_ADMIN | UNIT_ADMIN | VIEWER | Cơ chế bảo vệ cô lập dữ liệu |
|---|:---:|:---:|:---:|:---:|---|
| `/api/auth/login` | POST | Cho phép | Cho phép | Cho phép | Public, rate-limit chưa có |
| `/api/auth/me` | GET | Cho phép | Cho phép | Cho phép | Yêu cầu JWT token hợp lệ |
| `/api/dashboard/admin` | GET | Toàn quyền | Bị chặn (403) | Bị chặn | Kiểm tra `session.role === 'SUPER_ADMIN'` |
| `/api/dashboard/unit` | GET | Xem mọi ĐV | Chỉ xem ĐV mình | Bị chặn | Ép `unitId = session.unitId` ở backend |
| `/api/uploads` | GET / POST | Xem/Upload 162 ĐV | Chỉ xem/Upload ĐV mình | Bị chặn | Backend ép `unitId = session.unitId`, chặn can thiệp |
| `/api/records` | GET | Xem mọi upload | Chỉ xem upload ĐV mình | Bị chặn | Kiểm tra `upload.unit_id === session.unitId` |
| `/api/confirm-submission` | POST | Cho phép | Chỉ xác nhận ĐV mình | Bị chặn | Kiểm tra `upload.unit_id === session.unitId` |
| `/api/forms` | GET / POST | Toàn quyền tạo | Chỉ xem form ACTIVE | Xem | POST chặn nếu không phải SUPER_ADMIN |
| `/api/submissions` | GET / POST | Xem mọi ĐV | Chỉ xem/nộp ĐV mình | Bị chặn | POST bỏ qua body.unitId nếu là UNIT_ADMIN |
| `/api/training-catalog` | GET / POST | Toàn quyền / Audit | Chỉ xem danh mục ACTIVE| Xem | POST toggle status chỉ cho SUPER_ADMIN |
| `/api/training-demand` | GET / POST | Toàn quyền / Reopen | Chỉ sửa/gửi ĐV mình | Bị chặn | Backend ép `unitId = session.unitId`, Reopen chỉ Admin |
| `/api/training-reports` | GET | Toàn quyền xem 162 ĐV | Xem báo cáo ĐV mình | Bị chặn | Ma trận toàn hệ thống chỉ Admin truy cập |
| `/api/export` | GET | Xuất toàn bộ 162 ĐV | Chỉ xuất file ĐV mình | Bị chặn | Kiểm tra `upload.unit_id === session.unitId` |
| `/api/audit-logs` | GET | Toàn quyền xem | Bị chặn (403) | Bị chặn | Kiểm tra `session.role === 'SUPER_ADMIN'` |
