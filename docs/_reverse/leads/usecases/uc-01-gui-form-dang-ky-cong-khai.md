# UC-01 — Gửi form đăng ký trên trang landing

**a. Tên use case:** Gửi form đăng ký trên trang landing công khai.

**b. Mã UC / phạm vi:** UC-01 — hệ thống tiếp nhận khách hàng tiềm năng; phạm vi: trang landing công khai + điểm tiếp nhận của máy chủ.

**c. Tác nhân:** Khách truy cập (chưa có tài khoản); tác nhân phụ: hệ thống chống spam (máy chủ), bộ gởi thư (nền).

**d. Điều kiện tiên quyết:** Kênh tiếp nhận đã cấu hình org đích; khách mở trang landing từ origin thuộc danh sách cho phép.

**e. Luồng chính:**
1. Khách điền họ tên và số điện thoại (bắt buộc), có thể chọn khoá quan tâm và ghi chú.
2. Trang tự kiểm tên và số điện thoại ngay khi rời ô nhập; lưu nháp tự động vào bộ nhớ trình duyệt.
3. Khách bấm gửi; trang dựng payload kèm thời gian đã trôi và trường bẫy (nếu bot điền).
4. Máy chủ lần lượt kiểm: cấu hình org, origin, cỡ body, hợp đồng dữ liệu.
5. Máy chủ kiểm bot (trường bẫy + thời gian tối thiểu 3 giây).
6. Máy chủ chạy 3 phép giới hạn nguyên tử: tần suất địa chỉ mạng (3/10 phút), trần ngày (100/org/ngày VN), gộp trùng SĐT (24 giờ).
7. Ghi dòng mới với trạng thái "mới", địa chỉ mạng đã băm, số lần gửi bằng 1.
8. Gửi thư nền thông báo cho các thành viên có quyền tài chính; lỗi thư không ảnh hưởng phản hồi.
9. Trả mã thành công; trang hiện màn thành công với tên + số điện thoại đã gửi và nút nhắn Zalo.

**f. Luồng thay thế / ngoại lệ:**
- f1. Thiếu cấu hình org đích → mã lỗi riêng 503, không ghi (BR-L02).
- f2. Origin lạ/thiếu → 403 (BR-L03).
- f3. Body vượt 4 KB → 413 (BR-L18).
- f4. Dữ liệu sai/khoá lạ → 400 kèm danh sách trường lỗi, không phản chiếu giá trị (BR-L19).
- f5. Bot dính trường bẫy hoặc gửi dưới 3 giây → thành công giả 201, không ghi, không thư (BR-L04).
- f6. Vượt 3 lượt/10 phút theo địa chỉ mạng → 429 kèm nhắc thử lại sau 10 phút (BR-L05).
- f7. Đủ 100 đăng ký mới trong ngày → 429 mã lỗi riêng (BR-L07).
- f8. SĐT đã có trong 24 giờ → cập nhật dòng cũ, giữ tên/email gốc, không thư lại; lượt thứ 6 → 429 (BR-L08, BR-L09, BR-L10).
- f9. Mạng lỗi/lỗi máy chủ → trang giữ dữ liệu, hiện phiếu văn bản copy gửi Zalo (FR-L16).

**g. Hậu điều kiện:** Đăng ký ở trạng thái "mới" xuất hiện trong danh sách quản lý của trung tâm; giáo viên nhận thư thông báo; khách thấy xác nhận.

**h. Yêu cầu liên quan:** FR-L01..FR-L04, FR-L06, FR-L07, FR-L15, FR-L16; BR-L01..BR-L10, BR-L12, BR-L18, BR-L19; NFR-L01..NFR-L05; Flow F1; Sơ đồ trạng thái (khởi tạo "Mới").

Bằng chứng tổng: [S1] apps/server/src/routes/public-leads.ts:92-367; [S19] apps/profile/public/index.html:1614-1712; [S6] apps/server/src/routes/public-leads.test.ts:109-496; [S25] apps/e2e/specs/profile-lead-intake.spec.ts:108-205.
