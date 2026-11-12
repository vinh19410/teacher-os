# UC-02 — Làm bài kiểm tra đầu vào và đồng bộ kết quả

**a. Tên use case:** Làm bài kiểm tra đầu vào qua cổng công khai và đồng bộ kết quả về đăng ký.

**b. Mã UC / phạm vi:** UC-02 — cổng bài kiểm tra đầu vào trên trang công khai; phạm vi: trang bài test + điểm tiếp nhận của máy chủ.

**c. Tác nhân:** Thí sinh (khách chưa có tài khoản).

**d. Điều kiện tiên quyết:** Kênh tiếp nhận đã cấu hình org đích; bộ đề bài test đã phát hành cho org đó.

**e. Luồng chính:**
1. Thí sinh mở trang bài kiểm tra đầu vào; điền thông tin cá nhân — họ tên, email, số điện thoại bắt buộc; ngày sinh/khoá/hình thức/ghi chú tuỳ chọn.
2. Trang kiểm định dạng; lỗi hiển thị theo từng ô.
3. Trang gửi đăng ký với nguồn "bài test" qua cùng điểm tiếp nhận công khai (chịu cùng mọi giới hạn của UC-01); gửi bị khoá trong 10 giây và chống gửi trùng.
4. Được chấp nhận thì thí sinh vào phần làm bài.
5. Thí sinh trả lời và nộp; bài được chấm ngay trên trình duyệt, tổng hợp điểm từng phần và dải xếp lớp cùng khoá đề xuất.
6. Trang tự gửi đồng bộ kết quả về cùng SĐT (kết quả đã cắt còn 300 ký tự, dùng cơ chế gửi cả khi rời trang); lượt này đi đường gộp trùng → cập nhật dòng cũ, tăng số lần gửi, KHÔNG gửi thư thứ hai.
7. Thí sinh thấy kết quả và gợi ý khoá.

**f. Luồng thay thế / ngoại lệ:**
- f1. Thiếu/sai email ở cổng → 400 với trường email được đánh dấu (FR-L05).
- f2. Chạm giới hạn tần suất → thông báo "quá nhiều lượt đăng ký từ mạng này… nhắn Zalo cô Mỹ".
- f3. Lỗi khác/mạng đứt ở bước cổng → thông báo hệ thống bận; thí sinh chưa được vào bài.
- f4. Đăng ký đã tồn tại từ form trang chủ → luồng bài test điền bổ sung kết quả, giữ nguyên nguồn ban đầu và các lựa chọn cũ (FR-L08).
- f5. Đồng bộ kết quả thất bại → kết quả vẫn hiển thị cục bộ; trạng thái "chưa đồng bộ" được giữ.

**g. Hậu điều kiện:** Đăng ký mang kết quả test tự mô tả; giáo viên thấy trường kết quả trong chi tiết đăng ký; không có thư thêm.

**h. Yêu cầu liên quan:** FR-L05, FR-L07, FR-L08; BR-L03, BR-L05, BR-L07..BR-L10, BR-L19; NFR-L05, NFR-L06, NFR-L07, NFR-L08, NFR-L09; Flow F2.

Bằng chứng tổng: [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:132-284; [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1029-1135, 1478-1512; [S6] apps/server/src/routes/public-leads.test.ts:526-635; [S23] apps/profile/tests/placement-test.test.mjs:343-361.
