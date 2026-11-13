---
type: reverse-usecase
feature: notifications-teacher
uc: UC-07
status: draft
updated: 2026-11-12
---

# UC-07 — Phát sinh dòng nhật ký khi nghiệp vụ gửi thông báo (nơi GHI)

a. **Mục tiêu:** Mỗi lần nghiệp vụ nhắc học viên (mời vào lớp, giao bài, trả điểm, hóa đơn, nhắc nợ, đổi lịch, nghỉ lễ) tạo ĐÚNG 1 dòng nhật ký cho mỗi học viên đích, có đầy đủ snapshot (kênh, email, người gửi) để màn [5] và in-app dùng chung. (UC biên — actor là hệ thống; ranh giới với feature "gửi thông báo")
b. **Actor:** Hệ thống — route nghiệp vụ trong apps/server/src (enroll/invite, giao bài, chấm bài, hóa đơn, nhắc nợ, đổi lịch/hủy buổi, lịch nghỉ).
c. **Tiền điều kiện:** Nghiệp vụ gốc ghi THÀNH CÔNG (thông báo luôn phát sau khi ghi, trước khi return); có danh sách học viên đích.
d. **Luồng chính (truy vết F5):**
   1. Route dựng `NotificationEvent` từ builder thuần (templates.ts) với khóa chống trùng dạng `<event_type>:<ref>[:<studentId>]` (FR-16, BR-02).
   2. `notify()` / `emitNotifications()` → `enqueueNotifications`: resolve email học viên (chunk 50) + `resolveOrgMailSender` (sender_name = tên org, reply_to = email chủ org teacher/owner sớm nhất) (FR-16).
   3. Học viên không thuộc org → bỏ qua hoàn toàn; có email → channels "email,in_app" + status `queued`; không email → channels "in_app" + status `sent` ngay (sent_at = lúc tạo, recipientEmail null) (BR-04).
   4. INSERT `onConflictDoNothing` theo unique (org_id, idempotency_key), chunk 50 — replay nghiệp vụ không nhân đôi dòng (BR-02).
   5. `deliverNotifications(createdIds)` chạy nền (runInBackground) hoặc await khi vắng (FR-17, F6).
e. **Luồng thay thế:**
   - 2a. Lỗi enqueue/deliver bị nuốt (fail-open) — nghiệp vụ gốc vẫn trả 2xx; trường hợp cực đoan mất cả bảng vẫn 201 (BR-08).
   - 5a. Vắng mailer cấu hình → dòng email giữ `queued` + console.warn (FR-17).
   - 5b. Route nhắc nợ `/api/debt-reminders` KHÔNG qua notify fail-open: gọi enqueue + deliver trực tiếp để trả đúng `{queued, skipped}` theo hóa đơn còn nợ (BR-08 — ngoại lệ).
f. **Hậu điều kiện:** Dòng xuất hiện trên nhật ký GV với trạng thái `Đang chờ`/`Đã gửi` (và trên in-app học viên); lỗi gửi diễn ra về sau theo F6 mà không cần nghiệp vụ gốc chạy lại.
g. **Quy tắc liên quan:** FR-16, FR-17; BR-02, BR-04, BR-08, BR-13 (chỉ 2 kênh).
h. **Truy vết:** apps/server/src/routes/kernel.ts:337-345, apps/server/src/routes/kernel.ts:638-660, apps/server/src/routes/kernel.ts:1617-1626, apps/server/src/routes/kernel.ts:3101-3108, apps/server/src/routes/kernel.ts:3392-3480; apps/server/src/routes/grading.ts:1113-1131; apps/server/src/routes/assignments/index.ts:180-191; apps/server/src/routes/holidays.ts:636-671; apps/server/src/lib/notifications/emit.ts:61-91; apps/server/src/lib/notifications/enqueue.ts:20-80; apps/server/src/lib/notifications/templates.ts:40-193; test: apps/server/src/kernel.test.ts:7446-7844, apps/server/src/lib/notifications/notifications.test.ts:33-516.
