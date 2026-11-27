# Kết nối Claude Desktop qua MCP (Soạn bài tập & Full Test)

Tài liệu hướng dẫn giáo viên kết nối **Claude Desktop** với hệ thống Teacher OS qua giao thức **Remote Streamable HTTP MCP** (`/mcp`) để dùng ngôn ngữ tự nhiên tạo/chỉnh sửa đề 6 kỹ năng trong Ngân hàng đề và ghép Full Test IELTS.

---

## 1. Yêu cầu trên máy giáo viên

- Đã cài **Claude Desktop** (macOS hoặc Windows).
- Đã cài **Node.js ≥ 20** (để chạy lệnh cầu nối `npx -y mcp-remote`). Kiểm tra nhanh bằng `node -v` trong Terminal / Command Prompt.
- Có tài khoản giáo viên hợp lệ trên Teacher OS (môi trường beta/staging: `https://lms.staging.teacheros.io.vn`).

## 2. Tạo mã kết nối & cấu hình Claude Desktop

1. Đăng nhập Teacher OS → mở **Hồ sơ** (`/teacher/profile`).
2. Tại thẻ **Kết nối Claude Desktop (MCP)**:
   - Nhập tên gợi nhớ thiết bị (ví dụ: `MacBook Cô Mỹ`).
   - Chọn thời hạn mã (`30 ngày`, `90 ngày`, `1 năm`, hoặc `Không hết hạn`) rồi bấm **Tạo mã kết nối**.
   - Mỗi tài khoản giữ tối đa **10 mã đang hoạt động**.
3. Trong khung **Mã mới tạo (chỉ hiển thị một lần duy nhất)**, bấm **Sao chép cấu hình JSON**.
4. Mở ứng dụng **Claude Desktop**:
   - Vào **Settings → Developer → Edit Config** để mở file `claude_desktop_config.json`:
     - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
     - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - Dán đoạn JSON đã sao chép vào file (nếu file đã có các `mcpServers` khác, ghép mục `"teacher-os"` vào bên trong `"mcpServers"`).
5. **Khởi động lại Claude Desktop** hoàn toàn (Quit rồi mở lại) để tải danh sách tool từ Teacher OS.

## 3. Ví dụ prompt tạo bài tập

- **Tạo đề lẻ (mặc định lưu nháp):**
  > "Hãy tạo 1 đề IELTS Reading Passage 1 band 6.5 chủ đề Solar Microgrids gồm 5 câu True/False/Not Given kèm giải thích đáp án, lưu nháp để cô kiểm tra."
- **Tạo đề ngữ pháp / từ vựng:**
  > "Tạo 1 đề Grammar dạng gap-fill gồm 6 câu về câu điều kiện hỗn hợp và đính kèm 1 đề Writing Task 1 mô tả biểu đồ, đánh dấu sẵn sàng luôn."
- **Ghép Full Test hoàn chỉnh:**
  > "Soạn đủ 3 Passage Reading chủ đề Renewable Energy rồi ghép thành 1 Full Test Reading hoàn chỉnh (thời gian 60 phút, trạng thái nháp)."

## 4. Lưu ý về trạng thái `draft` / `ready` và media

- Mọi đề tạo mới mặc định ở trạng thái **`draft`** để giáo viên kiểm tra trước khi giao cho lớp.
- Khi yêu cầu đánh dấu **`ready`** ngay:
  - Đề **Listening** chưa có file âm thanh hoặc đề **Diagram/Map** chưa có ảnh + tọa độ pin sẽ được tự động giữ ở **`draft`** kèm hướng dẫn, để giáo viên mở đường dẫn `editUrl` trên web tải file âm thanh/ảnh rồi chuyển sang **Sẵn sàng**.
- Đề đã có học viên làm bài sẽ bị khóa nội dung (`PROMPT_CONTENT_LOCKED` / `TEST_PARTS_LOCKED`), chỉ cho phép cập nhật metadata (tiêu đề, band, nguồn, trạng thái).
- MCP **không có tool xoá** và **không giao bài trực tiếp cho lớp** để tránh gửi nhầm thông báo cho học viên.

## 5. Mô hình bảo mật & xử lý sự cố

- **Lưu trữ token:** Hệ thống chỉ lưu **SHA-256 hash** (`mcp_token.token_hash`) và tiền tố hiển thị (`tos_mcp_...`), không lưu hay ghi log token trần.
- **Phân quyền:** Mỗi request tới `POST /mcp` kiểm tra lại token chưa bị thu hồi, chưa hết hạn, vai trò tài khoản `teacher`, membership tổ chức có quyền soạn bài (`canPublishGrade`), allowlist `TEACHER_EMAILS` (nếu cấu hình) và kiểm tra `Origin` chống DNS rebinding.
- **Khi nghi ngờ lộ token hoặc đổi máy:** Vào `/teacher/profile` bấm **Thu hồi** ngay — token hết hiệu lực tức thì.
- **Sự cố thường gặp:**
  - *Claude không hiện tool `teacher-os`:* Kiểm tra `node -v` ≥ 20, đóng hẳn Claude Desktop (Cmd+Q / Tray Quit) rồi mở lại.
  - *Lỗi `401 unauthorized`:* Token đã hết hạn hoặc bị thu hồi — tạo mã mới trên `/teacher/profile` và cập nhật lại `claude_desktop_config.json`.
  - *Lỗi `403`:* Tài khoản không có quyền giáo viên hoặc không nằm trong allowlist `TEACHER_EMAILS`.
