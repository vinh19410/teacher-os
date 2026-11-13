---
feature: student-tuition
type: reverse-usecase
uc: UC-04
status: draft
author: vinh19410
updated: "2026-11-12"
---

# UC-04 — Vào mục học phí từ thông báo

a. **Mục tiêu:** Hóa đơn mới / nhắc đến hạn đưa học viên thẳng tới mục Học phí bằng một
   lần bấm trên Chuông.
b. **Actor:** Học viên (student SPA); hệ thống thông báo là người phát sự kiện (phía giáo
   viên — cross-ref tuition-invoicing).
c. **Tiền điều kiện:** Có sự kiện invoice_issued hoặc tuition_reminder chưa đọc trong
   hộp thông báo; portal đã đăng nhập.
d. **Luồng chính (truy vết F4):**
   1. Giáo viên tạo hóa đơn / hệ thống nhắc đến hạn → sự kiện với linkPath "/tuition".
   2. Học viên mở thông báo trên Chuông → navigate theo linkPath.
   3. Rơi vào `/tuition` — tiếp tục như UC-01.
e. **Luồng thay thế:**
   - 2a. Thông báo không có linkPath → chỉ đánh dấu đã đọc, không điều hướng.
f. **Hậu điều kiện:** Thông báo được đánh dấu đã đọc; màn hình đích không đổi dữ liệu.
g. **Quy tắc liên quan:** FR-01, FR-02; BR-01, BR-02.
h. **Truy vết:** apps/server/src/lib/notifications/templates.ts:40-52,
   apps/server/src/lib/notifications/templates.ts:130-145;
   apps/student/src/components/layout/notification-bell.tsx:53-61.
