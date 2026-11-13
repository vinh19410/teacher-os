# UC-05 — Thông báo email đăng ký mới (use case hệ thống)

**a. Tên use case:** Tự động gửi email thông báo cho trung tâm khi có đăng ký mới.

**b. Mã UC / phạm vi:** UC-05 — use case hệ thống (tác nhân không phải người), chạy nền sau khi ghi đăng ký thành công.

**c. Tác nhân:** Hệ thống; tác nhân phụ: bộ gởi thư, cơ sở dữ liệu thành viên.

**d. Điều kiện tiên quyết:** Đăng ký mới đã ghi thành công (lần tạo đầu tiên, không áp dụng cho gộp trùng); hệ thống có bộ gởi thư cấu hình.

**e. Luồng chính:**
1. Sau khi ghi dòng mới, hệ thống tra danh sách thành viên của org đích.
2. Lọc giữ lại thành viên thuộc nhóm vai trò tài chính; gộp trùng email (viết thường, cắt khoảng trắng); bỏ email rỗng.
3. Với mỗi người nhận, dựng thư: tiêu đề "Đăng ký học mới: {tên}"; nội dung gồm dòng đầu "Học viên tiềm năng: {tên}", khoá/hình thức/lịch (bản nhãn tiếng Việt nếu mã nằm trong danh mục), và liên kết mở màn danh sách ở bộ lọc đăng ký mới.
4. Nội dung không chứa số điện thoại, email, ngày sinh, ghi chú (vì một chế độ gởi thư ghi nguyên nội dung ra log); phần HTML bọc khối văn bản đã thoát ký tự.
5. Gửi song song cho mọi người nhận; chạy nền (không chặn phản hồi cho khách).

**f. Luồng thay thế / ngoại lệ:**
- f1. Không có bộ gởi thư → ghi cảnh báo log và bỏ qua; đăng ký vẫn thành công.
- f2. Tra người nhận lỗi → ghi log (chỉ mã đăng ký, không dữ liệu cá nhân) và bỏ qua.
- f3. Không còn ai đủ quyền có email → không gửi gì.
- f4. Bộ gởi thư lỗi với một người nhận → nuốt lỗi, ghi log; các người nhận khác vẫn nhận; phản hồi cho khách không đổi.

**g. Hậu điều kiện:** Mỗi thành viên đủ quyền nhận đúng một thư cho mỗi đăng ký mới; không thư cho gộp trùng; lỗi thư không để lại trạng thái sai nào trên đăng ký.

**h. Yêu cầu liên quan:** FR-L10; BR-L10, BR-L16; NFR-L02; Flow F1.

Bằng chứng tổng: [S11] apps/server/src/lib/lead-notify.ts:16-109; [S1] apps/server/src/routes/public-leads.ts:331-366; [S6] apps/server/src/routes/public-leads.test.ts:358-405.
