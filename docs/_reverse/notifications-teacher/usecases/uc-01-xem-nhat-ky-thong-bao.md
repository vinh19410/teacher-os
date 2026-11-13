---
type: reverse-usecase
feature: notifications-teacher
uc: UC-01
status: draft
updated: 2026-11-12
---

# UC-01 — Xem nhật ký thông báo đã gửi

a. **Mục tiêu:** Giáo viên nhìn thấy toàn bộ thông báo hệ thống đã nhắc học viên (ai, lúc nào, qua kênh nào, gửi tới đâu) để đối soát và phát hiện dòng gửi lỗi. (mục tiêu nghiệp vụ do BA suy — cần xác nhận, xem OQ-02)
b. **Actor:** Giáo viên (mọi thành viên org — màn dùng chung, không guard tài chính; BR-10). Student/admin bị chặn 403 ở gate app.
c. **Tiền điều kiện:** Đã đăng nhập app GV; org đã bootstrap; có ít nhất một nghiệp vụ đã phát thông báo (hoặc màn hiện empty-state).
d. **Luồng chính (truy vết F1):**
   1. Mở `/notifications` từ sidebar mục "Nhật ký thông báo" (FR-20).
   2. Client gọi GET `/api/notification-logs` với credentials include; server kiểm kernelCtx (FR-01, FR-12).
   3. Server trả 20 dòng mới nhất (created_at desc, id desc) kèm total, counts, page, pageSize (FR-01).
   4. Bảng hiển thị Thời gian / Người nhận (tên + email) / Sự kiện / Kênh / Trạng thái / Thao tác; nhãn tiếng Việt cho sự kiện, kênh, trạng thái (FR-07).
   5. Chip trạng thái mang badge đếm do server tính (FR-04, BR-07).
e. **Luồng thay thế:**
   - 2a. Chưa đăng nhập → 401 `unauthorized` (E-01); session student/admin → 403 `ACCOUNT_STUDENT_ROLE` / `ACCOUNT_ADMIN_ROLE` (E-02).
   - 3a. Response 401 → `reauth()` điều hướng đăng nhập lại (FR-12).
   - 4a. `counts.all = 0` và không có filter → empty-state toàn cục "Chưa có thông báo nào" kèm mô tả (FR-11).
   - 4b. Tải lỗi → "Không tải được nhật ký thông báo. Thử tải lại trang." (E-11); response lệch contract → ZodError (E-15).
f. **Hậu điều kiện:** Không đổi dữ liệu (GET thuần); danh sách + badge đếm phản ánh đúng org hiện tại.
g. **Quy tắc liên quan:** FR-01, FR-04, FR-07, FR-10, FR-11, FR-12, FR-19, FR-20; BR-10 (màn dùng chung), BR-11 (phân biệt feed `notif`), BR-13 (chỉ 2 kênh).
h. **Truy vết:** apps/server/src/routes/notification-logs.ts:71-189; apps/web/src/routes/_auth/notifications/index.tsx:347-450; apps/web/src/lib/repos/notifications.ts:29-59; apps/web/src/components/layout/sidebar.tsx:80-85; test: apps/server/src/routes/notification-logs.test.ts:169-230, apps/web/src/routes/_auth/notifications/index.test.tsx:149-171, apps/web/src/routes/_auth/notifications/index.test.tsx:290-318; E2E: apps/e2e/specs/notifications-ac-001.spec.ts:196-409.
