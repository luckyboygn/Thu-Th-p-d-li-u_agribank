# TÀI LIỆU THIẾT KẾ KIẾN TRÚC NGHIỆP VỤ & KỸ THUẬT
# MODULE KHẢO SÁT NHU CẦU ĐÀO TẠO (162 ĐƠN VỊ TOÀN HỆ THỐNG)
*STAGE 1 – BÁO CÁO PHÂN TÍCH & KẾ HOẠCH TRIỂN KHAI*

---

## 1. PHÂN TÍCH THỰC TẾ FILE "phụ lục danh mục đào tạo.xlsx"

Sau khi đọc và phân tích tự động toàn bộ 1.323 dòng trong Sheet `3. PL full` của file `phụ lục danh mục đào tạo.xlsx`, hệ thống ghi nhận cấu trúc thực tế như sau:

### 1.1. Cấu trúc Cột thực tế (Dòng 4 của Sheet):
| STT Cột | Tên Cột Thực Tế Trong Excel | Ý Nghĩa Nghiệp Vụ | Kiểu Dữ Liệu |
| :---: | :--- | :--- | :---: |
| **C1** | `STT` | Số thứ tự chuyên đề trong nhóm | Số nguyên (`1, 2, 3...`) |
| **C2** | `Vị trí chức danh` | Mã vị trí / Chức danh được phân công học | Chuỗi ký tự (VD: `CN. KHDN. NV`, `CN. TĐ. NV`, `LĐTV`...) |
| **C3** | `Tên chuyên đề` | Tên chuyên đề đào tạo chuẩn | Chuỗi ký tự (VD: `Tổng quan Agribank`, `Nghiệp vụ tín dụng`...) |
| **C4** | `Hình thức đào tạo` | Phương thức tổ chức đào tạo | Chuỗi ký tự (`Trực tuyến`, `Trực tiếp`, `Video Conference`...) |
| **C5** | `Thời lượng đào tạo` | Số giờ hoặc buổi đào tạo | Chuỗi ký tự (`1 giờ`, `0,5 giờ`, `3 ngày`...) |
| **C6** | `Lộ trình đào tạo` | Giai đoạn đào tạo theo tiến trình công tác | Chuỗi ký tự (`0-2 tháng thử việc`, `Định kỳ hàng năm`...) |
| **C7** | `Năng lực` | Nhóm khung năng lực đáp ứng | Chuỗi ký tự (`NLC` - Năng lực chung, `NLCM` - Chuyên môn, `NLQL` - Quản lý...) |
| **C8** | `Hoàn thành các chuyên đề đào tạo` | Điều kiện tiên quyết hoặc chuyên đề tương đương | Chuỗi ký tự |
| **C9** | `Đáp ứng chứng chỉ/chứng nhận đào tạo` | Yêu cầu chứng nhận/chứng chỉ đầu ra | Chuỗi ký tự (VD: `Người lao động thử việc`, `Chứng chỉ IFRS`...) |

### 1.2. Thống kê & Quy luật dữ liệu:
- **Tổng số dòng chuyên đề hợp lệ:** **818** dòng.
- **Số lượng Tên chuyên đề DUY NHẤT:** **304** chuyên đề.
- **Số lượng Vị trí / Chức danh DUY NHẤT:** **284** vị trí.
- **QUAN HỆ GIỮA VỊ TRÍ VÀ CHUYÊN ĐỀ:**
  - Có **129 / 304** chuyên đề xuất hiện ở từ 2 vị trí trở lên.
  - Ví dụ điển hình: Chuyên đề *"Quản trị rủi ro trọng yếu trong hoạt động ngân hàng"* áp dụng cho đồng thời **28** vị trí chức danh khác nhau.
  - Một vị trí chức danh (VD: `CN. KHDN. NV` - Nhân viên KHDN Chi nhánh) có từ **10 đến 35** chuyên đề tương ứng.
  - **$\Rightarrow$ KẾT LUẬN KIẾN TRÚC BẮT BUỘC:** Mối quan hệ giữa Vị trí (`training_positions`) và Chuyên đề (`training_topics`) là **QUAN HỆ NHIỀU - NHIỀU (Many-to-Many / N-N)** thông qua bảng nối `training_position_topics`.

---

## 2. ĐỐI SOÁT TỪ ĐIỂN TÊN VỊ TRÍ CHỨC DANH

Các mã vị trí trong cột C2 (như `CN. KHDN. NV`, `CN. TĐ. NV`, `LĐTV`, `ALCO. NV`...) được đối chiếu khớp với file từ điển `Vai trò cá nhân.xlsx` trên máy tính:
- `CN. KHDN. NV`: Chi nhánh - Khách hàng doanh nghiệp (Nhân viên).
- `CN. TĐ. NV`: Chi nhánh - Thẩm định (Nhân viên).
- `CN. KHCN. NV`: Chi nhánh - Khách hàng cá nhân (Nhân viên).
- `LĐTV`: Người lao động thử việc.
- Hệ thống hỗ trợ hiển thị cả **Mã viết tắt** và **Tên đầy đủ diễn giải** để người dùng tại 162 đơn vị tìm kiếm và chọn lựa trực quan nhất.

---

## 3. THIẾT KẾ CƠ SỞ DỮ LIỆU CHUẨN HÓA

Hệ thống tuân thủ nghiêm ngặt nguyên tắc: **Tách biệt hoàn toàn Master Data (Danh mục chuẩn) khỏi Demand Data (Nhu cầu số lượng của 162 đơn vị).**

```text
┌────────────────────────────────────────────────────────────────────────┐
│ MASTER TRAINING CATALOG (Dữ liệu danh mục chuẩn từ Trụ sở chính)       │
│                                                                        │
│  ┌──────────────────────┐         ┌─────────────────────────┐          │
│  │  training_positions  │◄───────►│ training_position_topics│          │
│  │  (284 Vị trí)        │  (N-N)  │ (818 Quan hệ)           │          │
│  └──────────────────────┘         └────────────┬────────────┘          │
│                                                │                       │
│                                                ▼                       │
│                                   ┌─────────────────────────┐          │
│                                   │     training_topics     │          │
│                                   │     (304 Chuyên đề)     │          │
│                                   └─────────────────────────┘          │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Tham chiếu danh mục khi lập khảo sát
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ TRAINING DEMAND DATA (Dữ liệu nhu cầu khảo sát thực tế của 162 đơn vị) │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ training_demand_submissions                                      │  │
│  │ (Theo: collection_id + form_id + unit_id; Versioning v1, v2...)  │  │
│  │ Status: DRAFT -> SUBMITTED -> REOPENED                           │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │ (1 Đơn vị chọn N Vị trí)             │
│                                 ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ training_demand_positions                                        │  │
│  │ (Lưu vị trí đơn vị đã chọn: position_id, target_headcount)       │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │ (Mỗi vị trí có N Chuyên đề)          │
│                                 ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ training_demand_topics                                           │  │
│  │ (Lưu số lượng người đăng ký: topic_id, participant_count >= 0)   │  │
│  │ Snapshot: topic_name, duration, delivery_method để bảo toàn lịch │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Chi tiết các bảng Master Catalog:
1. **`training_positions`**:
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `code VARCHAR(100) UNIQUE NOT NULL` (Mã vị trí: `CN. KHDN. NV`...)
   - `name VARCHAR(255) NOT NULL` (Tên đầy đủ)
   - `group_name VARCHAR(100)` (Phân nhóm: Chi nhánh, Trụ sở chính, Thử việc...)
   - `status VARCHAR(20) DEFAULT 'ACTIVE'` (`ACTIVE` | `INACTIVE`)
   - `created_at`, `updated_at`

2. **`training_topics`**:
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `code VARCHAR(100)`
   - `name VARCHAR(255) NOT NULL` (Tên chuyên đề)
   - `delivery_method VARCHAR(255)` (Hình thức đào tạo)
   - `duration VARCHAR(100)` (Thời lượng)
   - `learning_path VARCHAR(255)` (Lộ trình đào tạo)
   - `competency VARCHAR(255)` (Khung năng lực)
   - `prerequisite TEXT` (Chuyên đề hoàn thành)
   - `certificate_requirement TEXT` (Chứng chỉ/chứng nhận đầu ra)
   - `status VARCHAR(20) DEFAULT 'ACTIVE'`
   - `created_at`, `updated_at`

3. **`training_position_topics`** (Bảng quan hệ N-N):
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `position_id INTEGER REFERENCES training_positions(id)`
   - `topic_id INTEGER REFERENCES training_topics(id)`
   - `display_order INTEGER DEFAULT 1`
   - `UNIQUE(position_id, topic_id)`

### 3.2. Chi tiết các bảng Nhu cầu Khảo sát (Demand Data):
1. **`training_demand_submissions`**:
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `collection_id INTEGER REFERENCES collections(id)`
   - `form_id INTEGER REFERENCES forms(id)`
   - `unit_id INTEGER REFERENCES units(id)`
   - `version INTEGER DEFAULT 1`
   - `status VARCHAR(20) DEFAULT 'DRAFT'` (`DRAFT` | `SUBMITTED` | `REOPENED`)
   - `note TEXT`
   - `submitted_by INTEGER REFERENCES users(id)`
   - `submitted_at TIMESTAMP`
   - `created_at`, `updated_at`

2. **`training_demand_positions`**:
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `submission_id INTEGER REFERENCES training_demand_submissions(id) ON DELETE CASCADE`
   - `position_id INTEGER REFERENCES training_positions(id)`
   - `target_headcount INTEGER` (Tổng số người của nhóm vị trí tại đơn vị, kiểm tra `integer >= 0`)
   - `created_at`
   - `UNIQUE(submission_id, position_id)` (Ngăn chọn trùng cùng 1 vị trí trong 1 lần kê khai)

3. **`training_demand_topics`**:
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `demand_position_id INTEGER REFERENCES training_demand_positions(id) ON DELETE CASCADE`
   - `topic_id INTEGER REFERENCES training_topics(id)`
   - `participant_count INTEGER NOT NULL DEFAULT 0` (Số người có nhu cầu, kiểm tra `integer >= 0`)
   - `topic_name_snapshot VARCHAR(255)` (Lưu tên snapshot để bảo toàn lịch sử nếu danh mục Master thay đổi trong tương lai)
   - `created_at`

---

## 4. QUY TRÌNH NGHIỆP VỤ & TRẢI NGHIỆM NGƯỜI DÙNG (UX/UI WORKFLOW)

### 4.1. Phân hệ Đơn vị tự kê khai (Unit Admin):
1. **Bước 1 - Vào Đợt & Chọn Biểu mẫu:**
   - Đăng nhập $\rightarrow$ Chọn Đợt *"Khảo sát Nhu cầu Đào tạo"* $\rightarrow$ Chọn Form *"Khảo sát nhu cầu đào tạo của đơn vị"*.
   - Màn hình hiển thị: Danh sách các vị trí đơn vị đã kê khai và tổng số nhu cầu.
2. **Bước 2 - Thêm vị trí:**
   - Nhấn **[ + Thêm vị trí / chức danh ]**.
   - Hộp thoại có ô tìm kiếm (`🔍 Tìm vị trí...`), lấy danh sách từ `training_positions`.
   - Nhập **Số lượng nhân sự của nhóm vị trí này tại đơn vị** (VD: 150 người).
   - Kiểm tra: `required`, `integer`, `>= 0`. Nếu người dùng chọn lại vị trí đã có: báo lỗi *"Vị trí này đã được khai báo"*.
3. **Bước 3 - Hiển thị chuyên đề & Nhập số người:**
   - Hệ thống tự động truy vấn các chuyên đề thuộc riêng vị trí đó (thông qua bảng nối `training_position_topics`).
   - Bảng chuyên đề: `STT | Tên chuyên đề | Hình thức | Thời lượng | Năng lực | Số người có nhu cầu`.
   - **Tính năng trọng tâm "Áp dụng cho tất cả":**
     - Nhập ô: `[ 150 ]` $\rightarrow$ Bấm nút **[ Áp dụng cho tất cả chuyên đề ]** $\rightarrow$ Toàn bộ chuyên đề tự điền `150`.
     - Người dùng có thể sửa riêng từng dòng (chuyên đề nào không học sửa về `0`).
   - **Cảnh báo logic:** Nếu chuyên đề nhập lớn hơn số nhân sự của vị trí ($180 > 150$) $\rightarrow$ hiển thị Huy hiệu Cảnh báo màu vàng (Warning).
4. **Bước 4 - Lưu nháp & Gửi chính thức:**
   - Hỗ trợ **[ Lưu nháp (DRAFT) ]** bất kỳ lúc nào để làm việc nhiều phiên.
   - Khi hoàn thành tất cả các vị trí $\rightarrow$ Bấm **[ Gửi chính thức (SUBMITTED) ]**.
   - Khi đã gửi, dữ liệu chuyển sang chế độ chỉ đọc. Nếu cần sửa, Admin có thể nhấn Reopen.

### 4.2. Phân hệ Quản trị viên (Admin):
1. **Quản lý Master Training Catalog:**
   - Xem toàn bộ danh sách Vị trí, Chuyên đề, số lượng chuyên đề của từng vị trí.
   - Công cụ **Import Excel Master** có quy trình: Tải file $\rightarrow$ Xem trước (Preview) $\rightarrow$ Validate $\rightarrow$ Xác nhận cập nhật (Upsert), lưu nhật ký Audit Log.
2. **Báo cáo tổng hợp không cần ghép file thủ công:**
   - **Báo cáo 1 - Theo Vị trí (Quan trọng nhất):** Chọn 1 vị trí $\rightarrow$ hiển thị ma trận toàn bộ 162 đơn vị theo từng chuyên đề kèm Tổng cộng.
   - **Báo cáo 2 - Chi tiết theo từng Đơn vị:** Xem trọn vẹn cơ cấu nhu cầu của một chi nhánh.
   - **Báo cáo 3 - Tổng hợp toàn hệ thống:** Danh sách Chuyên đề và tổng số người đăng ký trên toàn quốc.
   - **Xuất Excel trực tiếp:** Xuất tức thì 3 mẫu báo cáo ra file Excel chuẩn định dạng Agribank.

---

## 5. BẢO MẬT (SECURITY) & HIỆU NĂNG (PERFORMANCE)

1. **Kiểm soát quyền chặt chẽ ở Backend:**
   - Mọi API của Đơn vị (`/api/training-demand/*`) đều lấy `unit_id = session.unitId` trực tiếp từ token xác thực JWT HttpOnly cookie.
   - Tuyệt đối không nhận `unit_id` tùy ý từ frontend. Đơn vị A không thể xem hoặc sửa dữ liệu của Đơn vị B.
2. **Tối ưu truy vấn & Tránh nghẽn dữ liệu:**
   - Không load toàn bộ 304 chuyên đề hay 284 vị trí cùng một lúc.
   - Chuyên đề chỉ được load lazy-loading sau khi người dùng bấm chọn một vị trí cụ thể.
   - Đánh chỉ mục (Index) đầy đủ trên `position_id`, `topic_id`, `submission_id`, `collection_id`, `unit_id`.

---

## 6. KẾ HOẠCH TRIỂN KHAI CÁC GIAI ĐOẠN TIẾP THEO

- **STAGE 1:** Phân tích cấu trúc file và lập báo cáo kiến trúc *(Tài liệu này - Đã hoàn thành)*.
- **STAGE 2:** Thiết kế Migration Database (Tạo các bảng Master Catalog và Demand Tables).
- **STAGE 3:** Viết script Import & Seed toàn bộ Master Training Catalog từ file `sample_data/phu_luc_danh_muc_dao_tao.xlsx`.
- **STAGE 4:** Xây dựng hệ thống REST API (`/api/training-catalog/*`, `/api/training-demand/*`, `/api/training-reports/*`).
- **STAGE 5:** Xây dựng Giao diện Khảo sát cho Đơn vị (Dashboard vị trí, Modal thêm vị trí, Bảng chuyên đề, Nút áp dụng cho tất cả).
- **STAGE 6:** Xây dựng Giao diện Quản trị & Báo cáo cho Admin (Quản lý catalog, Báo cáo theo vị trí/đơn vị/toàn hệ thống, Xuất file Excel).
- **STAGE 7:** Viết và chạy bộ kiểm thử Automated Test cho 15 ca kiểm thử bắt buộc (TEST 1 $\rightarrow$ TEST 15).
- **STAGE 8:** Tổng kết và nghiệm thu bàn giao.

---
*Tài liệu Stage 1 đã sẵn sàng để trình duyệt trước khi chuyển sang bước lập trình mã nguồn.*
