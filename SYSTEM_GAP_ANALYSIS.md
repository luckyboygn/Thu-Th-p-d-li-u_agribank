# BÁO CÁO PHÂN TÍCH KHOẢNG TRỐNG VÀ NỢ KỸ THUẬT
## (SYSTEM GAP ANALYSIS & TECHNICAL DEBT REPORT)

---

## 1. PHÂN LOẠI MỨC ĐỘ THÔNG TIN THEO NGUYÊN TẮC KIỂM TOÁN

| Hạng mục | Trạng thái xác nhận | Chi tiết chứng minh trong Source Code |
|---|:---:|---|
| **Frontend Next.js 15 App Router** | **ĐÃ XÁC NHẬN** | Tồn tại đầy đủ tại `src/app/*`, `src/components/*` |
| **Backend Route Handlers** | **ĐÃ XÁC NHẬN** | 15 thư mục API tại `src/app/api/*` |
| **CSDL SQLite & 21 Bảng** | **ĐÃ XÁC NHẬN** | File vật lý `data/database.sqlite` và `schema.sql` |
| **Master Training Catalog (284 Vị trí, 304 Chuyên đề)** | **ĐÃ XÁC NHẬN** | Đã import từ file Excel gốc vào CSDL, 924 quan hệ N-N |
| **Thuật toán đối chiếu 2 chiều (Bidirectional)** | **ĐÃ XÁC NHẬN** | `src/lib/validation.ts` và `src/lib/validation-engine.ts` |
| **Phân quyền & Khóa Đơn vị (Unit Isolation)** | **ĐÃ XÁC NHẬN** | Backend ép `unitId = session.unitId` tại tất cả API đơn vị |
| **Form Builder Động (Forms / Fields / Submissions)** | **ĐÃ XÁC NHẬN** | Schema bảng 9-14 và API `src/app/api/forms/route.ts` |
| **Hệ thống Testing tự động** | **ĐÃ XÁC NHẬN** | 4 script kiểm thử độc lập trong `scripts/` (Test 10 cases, 14 cases, 15 cases) |
| **Dịch vụ Cloud Storage (S3 / GCS / Supabase Storage)** | **KHÔNG TÌM THẤY** | Hiện tại file lưu trên ổ cứng cục bộ `uploads_storage/` |
| **PostgreSQL / Supabase Database trực tiếp** | **CHƯA CÓ** | Hiện chỉ chạy SQLite cục bộ, file `.env.example` có gợi ý chuỗi kết nối |
| **CI/CD Pipeline (.github/workflows)** | **KHÔNG TÌM THẤY** | Không có thư mục `.github/` hoặc cấu hình CI tự động |
| **Git Version Control (.git)** | **KHÔNG TÌM THẤY** | Thư mục dự án hiện tại là thư mục độc lập, không có `.git` |

---

## 2. MA TRẬN VẤN ĐỀ & NỢ KỸ THUẬT (TECHNICAL DEBT MATRIX)

### 🔴 MỨC ĐỘ BLOCKER (Bắt buộc phải lưu ý/xử lý khi triển khai Production)

#### 1. Cơ chế Bypass Mật khẩu Hardcoded (Cửa sau tài khoản đơn vị)
- **Vị trí:** `src/lib/auth.ts` (dòng 83–85):
  ```typescript
  if (!valid && user.role === 'UNIT_ADMIN' && (password === 'Unit@123456' || password === '123456')) {
    valid = true;
  }
  ```
- **Vấn đề:** Bất kỳ ai biết tên người dùng của đơn vị (ví dụ `unit_8802`) đều có thể đăng nhập bằng mật khẩu mặc định `Unit@123456` hoặc `123456`, kể cả khi đơn vị đã đổi mật khẩu khác!
- **Rủi ro:** Nghiêm trọng (Bypass xác thực tài khoản đơn vị).
- **Khuyến nghị:** Xóa bỏ đoạn mã này khi đưa vào môi trường Production chính thức, bắt buộc xác thực 100% qua hash bcrypt trong database.

#### 2. Lưu trữ File trên Local Disk với Container Môi trường Tạm thời (Ephemeral Filesystem)
- **Vị trí:** `src/app/api/uploads/route.ts` (dòng 171–177):
  ```typescript
  const storageDir = path.join(process.cwd(), 'uploads_storage');
  fs.writeFileSync(savedFilePath, buffer);
  ```
- **Vấn đề:** Nếu ứng dụng được đóng gói Docker hoặc deploy lên Render/Vercel mà không gắn persistent disk, thư mục `uploads_storage/` sẽ bị xóa sạch mỗi khi container restart hoặc redeploy.
- **Rủi ro:** Mất file Excel gốc của đơn vị đã nộp.
- **Khuyến nghị:** Lưu trữ trên S3-compatible Object Storage (MinIO nội bộ hoặc Cloud Storage) nếu triển khai container.

---

### 🟠 MỨC ĐỘ HIGH (Ưu tiên cao cần cải thiện)

#### 3. Khóa ghi đơn luồng của SQLite (Single-Writer Lock Concurrency)
- **Vị trí:** `src/lib/db.ts` (kết nối `node:sqlite`).
- **Vấn đề:** Mặc dù đã bật WAL mode (`PRAGMA journal_mode = WAL`), SQLite chỉ cho phép duy nhất 1 tiến trình ghi tại một thời điểm. Khi 162 đơn vị nộp file Excel đồng thời (mỗi file chèn hàng trăm bản ghi vào `exam_records`), có thể xảy ra lỗi `database is locked` (`SQLITE_BUSY`).
- **Khuyến nghị:** Cấu hình `PRAGMA busy_timeout = 10000;` (chờ 10 giây trước khi báo lỗi) hoặc di chuyển tầng CSDL sang PostgreSQL khi triển khai đồng thời cho 162 đơn vị.

#### 4. Thiếu Cơ chế Giới hạn Tần suất Yêu cầu (Rate Limiting) trên API Đăng nhập
- **Vị trí:** `src/app/api/auth/login/route.ts`.
- **Vấn đề:** Không có bộ đếm thử mật khẩu sai hoặc IP rate limiting, dẫn đến nguy cơ bị tấn công dò quét mật khẩu (Brute-force).
- **Khuyến nghị:** Bổ sung middleware đếm số lần đăng nhập thất bại (khóa tài khoản 15 phút sau 5 lần thử sai).

#### 5. Hai Tầng Validation Độc lập Chưa Được Thống nhất Hoàn toàn
- **Vị trí:** `src/lib/validation.ts` (dành riêng cho module kiểm tra thi cũ) và `src/lib/validation-engine.ts` (dành cho kiến trúc biểu mẫu động mới).
- **Vấn đề:** Logic kiểm tra 2 chiều bị trùng lặp ở 2 file riêng biệt với tham số truyền vào khác nhau.
- **Khuyến nghị:** Thống nhất toàn bộ vào `validation-engine.ts`, coi kỳ thi là một trường hợp đặc biệt của Form với `validation_mode = 'MASTER_VALIDATION'`.

---

### 🟡 MỨC ĐỘ MEDIUM (Cải thiện trong quá trình phát triển)

#### 6. Kích thước Component Giao diện Quá lớn (Fat Components)
- **Vị trí:** 
  - `src/app/admin/training-demand/page.tsx` (891 dòng, ~42 KB).
  - `src/app/unit/page.tsx` (hơn 1.000 dòng, ~68 KB).
- **Vấn đề:** Chứa quá nhiều state, modal, bảng dữ liệu và hàm xử lý sự kiện trong một file duy nhất, gây khó khăn cho việc bảo trì.
- **Khuyến nghị:** Tách thành các component con độc lập: `MatrixView.tsx`, `TopicReportView.tsx`, `UnitDetailModal.tsx`, `CatalogAuditCard.tsx`.

#### 7. Thiếu Thư viện Quản lý Trạng thái Toàn cục (Global State / React Query)
- **Vị trí:** Các trang đang dùng `useState` và `fetch` thủ công trong `useEffect`.
- **Vấn đề:** Không có cơ chế tự động cache dữ liệu API, dẫn đến việc chuyển đổi giữa các tab có thể phải gọi lại API nhiều lần.
- **Khuyến nghị:** Tích hợp SWR hoặc TanStack Query (React Query) để tự động cache dữ liệu và revalidate mượt mà.

#### 8. Thiếu Bộ Framework Test Chuẩn Hóa (Jest / Vitest)
- **Vị trí:** Thư mục `scripts/`.
- **Vấn đề:** Các bài test hiện đang chạy dưới dạng script NodeJS độc lập (`test_stage5_suite.ts`, `test_training_demand_suite.ts`). Chưa có báo cáo độ bao phủ mã nguồn (Code Coverage).
- **Khuyến nghị:** Thiết lập Vitest hoặc Jest để tự động chạy regression test trong chu trình phát triển.

---

### 🟢 MỨC ĐỘ LOW (Xử lý tối ưu sau)

#### 9. Expression Index trên Username Chữ thường
- **Vị trí:** Bảng `users` trong `schema.sql`.
- **Vấn đề:** Truy vấn `LOWER(username) = LOWER(?)` không tận dụng được index `UNIQUE(username)` mặc định nếu không có expression index.
- **Khuyến nghị:** Thêm `CREATE INDEX IF NOT EXISTS idx_users_lower_uname ON users(LOWER(username));`.

#### 10. Thiếu Cơ chế Tự động Dọn dẹp File Rác (Orphan Files Cleanup)
- **Vị trí:** Thư mục `uploads_storage/`.
- **Vấn đề:** Khi đơn vị upload bản xem trước (preview) hoặc tải lên nhiều bản nháp, file vật lý lưu trên đĩa nhưng không được xóa nếu bản ghi bị xóa khỏi CSDL.
- **Khuyến nghị:** Xây dựng Cron Job định kỳ dọn dẹp các file cũ hơn 30 ngày không còn liên kết trong bảng `exam_uploads` hoặc `submissions`.

---

## 3. ĐÁNH GIÁ MỨC ĐỘ SẴN SÀNG CỦA MODULE KHẢO SÁT NHU CẦU ĐÀO TẠO

| Tiêu chí đánh giá | Trạng thái | Minh chứng thực tế |
|---|:---:|---|
| **Cơ sở dữ liệu Danh mục Master (Vị trí & Chuyên đề)** | **100% HOÀN THÀNH** | Đã có 284 vị trí, 304 chuyên đề, 924 quan hệ N-N trong CSDL |
| **Cơ sở dữ liệu Nhu cầu Đơn vị (Demand Submissions)** | **100% HOÀN THÀNH** | Bảng `training_demand_submissions`, `positions`, `topics` |
| **Giao diện Đơn vị Kê khai (/unit/training-demand)** | **100% HOÀN THÀNH** | Đầy đủ: Chọn vị trí, nạp chuyên đề, nhập số người, bulk apply, cảnh báo headcount, lưu draft, submit |
| **Giao diện Quản trị Admin (/admin/training-demand)** | **100% HOÀN THÀNH** | Đầy đủ 5 tab: Ma trận vị trí 162 ĐV, Báo cáo chuyên đề, Báo cáo đơn vị & Reopen, Audit Catalog, Xuất Excel |
| **API Nghiệp vụ Backend** | **100% HOÀN THÀNH** | `/api/training-catalog`, `/api/training-demand`, `/api/training-reports` |
| **Xuất Excel 4 định dạng chuẩn** | **100% HOÀN THÀNH** | All System, By Position, By Topic, By Unit |
| **Kiểm thử tự động 14 Test Cases (Stage 5)** | **100% PASS** | Đạt 14/14 bài test (chặn số âm, số thập phân, duplicate, N-N, isolation, aggregation) |
