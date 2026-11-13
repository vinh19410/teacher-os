---
type: reverse-usecase
feature: notifications-teacher
uc: UC-06
status: draft
updated: 2026-11-12
---

# UC-06 — Học viên đọc thông báo in-app (nguồn trạng thái "Đã xem")

a. **Mục tiêu:** Học viên mở thông báo trên cổng học viên; hành vi này là nguồn duy nhất khiến dòng trên nhật ký GV chuyển "Đã xem" (read_at). (UC biên — actor là học viên; mục tiêu nghiệp vụ do BA suy — OQ-02)
b. **Actor:** Học viên (student portal). GV không thao tác trong UC này — chỉ nhìn hệ quả trên màn [5].
c. **Tiền điều kiện:** Tồn tại bản ghi notification_record của chính học viên trong org đang chọn; học viên đã đăng nhập portal (requireStudent).
d. **Luồng chính (truy vết F7):**
   1. Cổng học viên GET `/api/student/inbox` — 50 dòng mới nhất của chính học viên, kèm `unread`; response KHÔNG trả recipient_email/reply_to_email/last_error (FR-18).
   2. Học viên mở 1 thông báo → POST `/api/student/inbox/:id/read`.
   3. Nếu `read_at` còn null: đặt read_at = now; chỉ khi status = `sent` thì nâng thành `read`; `queued` giữ nguyên (deliver sau sẽ chuyển thẳng read vì read_at là nguồn chân lý); `failed` giữ nguyên status (FR-18, BR-03).
   4. Dòng tương ứng trên nhật ký GV hiển thị "Đã xem" (nhãn `read`).
e. **Luồng thay thế:**
   - 2a. Id lạ / không thuộc học viên → 404 "Không tìm thấy thông báo".
   - 3a. Đã có read_at → 200 `{ok: true}` không ghi lại (idempotent).
   - 3b. Bản ghi `failed`: in-app vẫn xem được, status không rời khỏi failed (TOS-22 D5) — GV vẫn thấy dòng lỗi để Gửi lại.
f. **Hậu điều kiện:** `read_at` đặt vĩnh viễn (resend không xóa read_at); `unread` giảm; nhật ký GV phản ánh "Đã xem".
g. **Quy tắc liên quan:** FR-18; BR-03 (read_at nguồn chân lý), BR-04 (bản ghi chỉ in_app cũng đọc được).
h. **Truy vết:** apps/server/src/routes/student.ts:755-841; packages/api/src/contracts.ts:4018-4036; apps/server/src/lib/notifications/deliver.ts:193-207; test: apps/server/src/routes/student-inbox.test.ts:1-329; E2E: apps/e2e/specs/notifications-ac-001.spec.ts:196-409 (bước 3 — chuông badge → mở thông báo → dòng GV chuyển "Đã xem").
