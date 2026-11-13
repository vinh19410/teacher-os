---
type: reverse-usecase
feature: notifications-teacher
uc: UC-05
status: draft
updated: 2026-11-12
---

# UC-05 — Gửi lại tất cả mục lỗi theo bộ lọc

a. **Mục tiêu:** Khử một loạt "Lỗi gửi" trong bộ lọc hiện tại trong một lần (tối đa 50 dòng mới nhất), không bị học viên thiếu email chặn đầu hàng đợi. (mục tiêu nghiệp vụ — kế hoạch TOS-23)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** `counts.failed > 0` (nút header tự ẩn khi = 0); bộ lọc q + event là tùy chọn (không nhận status); bỏ lọc = requeue toàn bộ dòng failed trong trần 50.
d. **Luồng chính (truy vết F4):**
   1. Nút "Gửi lại tất cả mục lỗi ({failedCount})" hiện ở PageHead khi counts.failed > 0 (FR-14).
   2. Bấm → Modal "Gửi lại tất cả thông báo lỗi?" với mô tả "Đưa {N} thông báo lỗi trong bộ lọc hiện tại về hàng đợi để gửi lại Email. Thông báo In-app trên cổng học viên không bị gửi trùng." (FR-14).
   3. "Xác nhận gửi lại" → POST `/api/notification-logs/resend-failed` body `{q?, event?}` strict (FR-14, E-05).
   4. Server chọn tối đa 50 (RESEND_BATCH_LIMIT) dòng `failed` mới nhất có `student.email` hợp lệ khớp q + event (chế độ khớp cả email hiện tại — BR-09); dòng no_email tách vào `skipped`, không tính vào `remaining` (FR-14, BR-05, BR-06).
   5. Reset loạt như UC-04 rồi deliver nền (F6); trả `{requeued, skipped, remaining}` (FR-17).
   6. Toast: "Đã đưa N thông báo về hàng đợi để gửi lại." + (nếu có) "Bỏ qua N mục thiếu email." + (nếu còn) "Còn N mục lỗi, bấm lại để gửi tiếp." (FR-15).
e. **Luồng thay thế:**
   - 3a. JSON hỏng → 400 `invalid json`; thừa/thiếu trường (vd gửi status) → 400 `invalid body` (E-04, E-05).
   - 3b. Thiếu Origin hợp lệ → 403; thiếu Content-Type JSON → 415 (E-08, E-09).
   - 3c. "Hủy"/Esc → đóng modal, 0 request (FR-14).
   - 4a. `requeued = 0` và có skipped → toast lỗi "Bỏ qua N thông báo do học viên chưa có email." (E-14).
   - 5a. Đang gửi → nút disable; modal không đóng được bằng Esc trong lúc pending (FR-14).
   - 5b. Lỗi khác → toast "Không thể gửi lại các thông báo lỗi. Vui lòng thử lại." (E-12).
f. **Hậu điều kiện:** Tối đa 50 dòng về `queued` và gửi lại; `remaining` phản ánh số dòng eligible còn lại sau đợt này; chip "Lỗi gửi" giảm sau khi làm mới.
g. **Quy tắc liên quan:** FR-14, FR-15, FR-19; BR-01, BR-05, BR-06, BR-09.
h. **Truy vết:** apps/server/src/routes/notification-logs.ts:191-219; apps/server/src/lib/notifications/requeue.ts:144-233; packages/api/src/contracts.ts:3989-4016; apps/web/src/routes/_auth/notifications/index.tsx:233-254, apps/web/src/routes/_auth/notifications/index.tsx:337-365, apps/web/src/routes/_auth/notifications/index.tsx:612-644; test: apps/server/src/routes/notification-logs.test.ts:319-452, apps/server/src/routes/notification-logs.test.ts:604-768; E2E: apps/e2e/specs/notifications-ac-003.spec.ts:130-386.
