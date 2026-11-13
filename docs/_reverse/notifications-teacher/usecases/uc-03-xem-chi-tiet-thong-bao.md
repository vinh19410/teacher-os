---
type: reverse-usecase
feature: notifications-teacher
uc: UC-03
status: draft
updated: 2026-11-12
---

# UC-03 — Xem chi tiết một thông báo

a. **Mục tiêu:** Đọc đúng nội dung thư đã gửi và metadata gửi (người gửi, Reply-To, thời điểm gửi/đọc, số lần thử, lỗi) để trả lời "học viên đã nhận được gì". (mục tiêu nghiệp vụ do BA suy — OQ-02)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Đang thấy ít nhất một dòng trên nhật ký (mọi trạng thái đều mở được dialog).
d. **Luồng chính (truy vết F2):**
   1. Bấm nút eye (aria-label "Xem chi tiết thông báo cho {tên}") trên dòng (FR-07).
   2. Modal mở với tiêu đề = tiêu đề thông báo; body hiển thị pre-wrap (FR-09).
   3. Các trường: Người nhận (tên · email), Người gửi (—" nếu rỗng), Reply-To (—" nếu null), Gửi lúc, Đọc lúc (—" khi null; định dạng vi-VN, Asia/Ho_Chi_Minh), Số lần thử lại "N/3 lần thử" (FR-09).
   4. Dòng lỗi hiển thị thêm "Lỗi gửi" với last_error đầy đủ (FR-09); trên bảng, dòng failed đã rút gọn thành "E-010: <nguyên nhân ≤80> sau N lần thử" kèm tooltip fullText (FR-08).
   5. Đóng modal → về bảng, không đổi dữ liệu.
e. **Luồng thay thế:**
   - 4a. last_error rỗng/null trên dòng lỗi → fallback "Không gửi được email" (FR-08).
   - 4b. lastError mang mã máy "E-selfomy-alignment-010: <nguyên nhân>" — được cắt tiền tố khi rút gọn, giữ nguyên trong tooltip (FR-08, E-10).
f. **Hậu điều kiện:** Không đổi dữ liệu; dialog chỉ đọc từ row đã fetch.
g. **Quy tắc liên quan:** FR-08, FR-09; BR-13 (kênh hiển thị theo nhãn 3 giá trị).
h. **Truy vết:** apps/web/src/components/notifications/notification-detail-dialog.tsx:35-89; apps/web/src/lib/notification-error.ts:14-31; apps/web/src/routes/_auth/notifications/index.tsx:188, apps/web/src/routes/_auth/notifications/index.tsx:466-496, apps/web/src/routes/_auth/notifications/index.tsx:540-547, apps/web/src/routes/_auth/notifications/index.tsx:604-610; test: apps/web/src/routes/_auth/notifications/index.test.tsx:224-272, apps/web/src/lib/notification-error.test.ts:4-42.
