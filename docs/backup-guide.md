# HƯỚNG DẪN LÊN LỊCH SAO LƯU CƠ SỞ DỮ LIỆU TỰ ĐỘNG (AGRIBANK DATA SYSTEM)

Tài liệu này hướng dẫn quản trị viên thiết lập lịch sao lưu tự động hàng ngày cho cơ sở dữ liệu SQLite (`data/database.sqlite`) của Hệ thống Thu thập Thông tin Đa đơn vị Agribank.

---

## 1. NGUYÊN TẮC SAO LƯU BẢO MẬT
1. **Công nghệ:** Sử dụng lệnh `VACUUM INTO` thuần của SQLite (`scripts/backup_db.js`). Lệnh này tạo snapshot nhất quán và an toàn tuyệt đối khi hệ thống đang chạy chế độ WAL (Write-Ahead Logging).
2. **Kiểm tra tính toàn vẹn:** Mỗi file sao lưu sinh ra đều được tự động xác thực bằng lệnh `PRAGMA integrity_check`.
3. **Cơ chế xoay vòng:** Tự động giữ lại **14 bản sao lưu gần nhất** trong thư mục `backups/` và tự động xoá các bản cũ hơn để tiết kiệm dung lượng ổ đĩa.
4. **An toàn lưu trữ:** Thư mục `backups/` được bảo vệ, nằm ngoài thư mục `public/` và không bao giờ được truy cập trực tiếp từ trình duyệt mà không qua phân quyền Super Admin.

---

## 2. HƯỚNG DẪN CÀI ĐẶT TRÊN WINDOWS SERVER (TASK SCHEDULER)

Trên máy chủ Windows Server hoặc máy tính trạm chạy Node.js:

### Bước 1: Mở Task Scheduler
- Nhấn tổ hợp phím `Windows + R`, gõ `taskschd.msc` và nhấn `Enter`.

### Bước 2: Tạo tác vụ mới (Create Task)
1. Ở bảng điều khiển bên phải, bấm **"Create Task..."** (không dùng Basic Task).
2. **Tab General:**
   - **Name:** `Agribank_Database_Daily_Backup`
   - **Description:** `Tự động sao lưu CSDL Agribank hàng ngày lúc 01:00 AM và giữ 14 bản gần nhất`
   - Chọn tùy chọn: **"Run whether user is logged on or not"**
   - Tích chọn: **"Run with highest privileges"**

3. **Tab Triggers:**
   - Bấm **"New..."**
   - **Begin the task:** `On a schedule`
   - Chọn: **Daily** (Hàng ngày)
   - **Start:** Chọn ngày hiện tại, thời gian thiết lập: `01:00:00 AM`
   - **Recur every:** `1 days`
   - Bấm **OK**.

4. **Tab Actions:**
   - Bấm **"New..."**
   - **Action:** `Start a program`
   - **Program/script:** Gõ đường dẫn tới `node.exe` (ví dụ: `C:\Program Files\nodejs\node.exe` hoặc đơn giản là `node`).
   - **Add arguments:** `scripts/backup_db.js`
   - **Start in:** Điền đường dẫn thư mục gốc của dự án, ví dụ:
     `C:\Users\NGOCNGUYEN\Documents\Antigravitu\App web đơn vị tự kê khai`
   - Bấm **OK**.

5. **Tab Settings:**
   - Tích chọn: **"Allow task to be run on demand"** (cho phép chạy thử ngay lập tức).
   - Tích chọn: **"If the task fails, restart every 10 minutes"** (thử lại 3 lần).

6. Bấm **OK** và nhập mật khẩu tài khoản hệ thống (nếu được yêu cầu).

---

## 3. HƯỚNG DẪN CÀI ĐẶT TRÊN LINUX (CRONTAB)

Nếu hệ thống được triển khai trên môi trường Linux:

1. Mở terminal và chỉnh sửa crontab của tài khoản quản trị:
   ```bash
   crontab -e
   ```
2. Thêm dòng sau vào cuối file để chạy sao lưu lúc 01:00 AM mỗi ngày:
   ```cron
   0 1 * * * cd /duong/dan/toi/du_an && /usr/bin/node scripts/backup_db.js >> logs/backup_cron.log 2>&1
   ```
3. Lưu và thoát. Kiểm tra danh sách cronjob:
   ```bash
   crontab -l
   ```

---

## 4. QUY TRÌNH PHỤC HỒI DỮ LIỆU KHI CÓ SỰ CỐ (DISASTER RECOVERY)

Khi xảy ra sự cố cần khôi phục dữ liệu từ bản sao lưu:

> [!CAUTION]
> **Tuyệt đối không phục hồi dữ liệu trực tiếp khi ứng dụng Web đang chạy!**
> Phục hồi dữ liệu chỉ được thực hiện bằng dòng lệnh tương tác trên máy chủ.

1. **Bước 1: Tạm dừng tiến trình ứng dụng Web**
   - Tắt process Next.js / PM2 / Windows Service đang chạy app.
2. **Bước 2: Mở cửa sổ dòng lệnh (Terminal / PowerShell)** tại thư mục gốc của dự án.
3. **Bước 3: Chạy script phục hồi tương tác:**
   ```bash
   node scripts/restore_db.js
   ```
4. **Bước 4: Thao tác theo hướng dẫn trên màn hình:**
   - Danh sách các file backup khả dụng sẽ được hiển thị kèm dung lượng và thời gian tạo.
   - Nhập số thứ tự file backup muốn phục hồi.
   - Hệ thống sẽ yêu cầu xác nhận gõ chữ `YES`.
   - Script tự động sao lưu CSDL hiện tại sang file `pre_restore_backup_*.sqlite` để đảm bảo 100% không mất dữ liệu bất kể tình huống nào.
   - Script ghi đè dữ liệu và chạy `PRAGMA integrity_check` để kiểm tra toàn vẹn.
5. **Bước 5: Khởi động lại ứng dụng Web:**
   ```bash
   npm start
   ```
