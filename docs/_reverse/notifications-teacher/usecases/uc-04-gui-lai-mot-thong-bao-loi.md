---
type: reverse-usecase
feature: notifications-teacher
uc: UC-04
status: draft
updated: 2026-11-12
---

# UC-04 — Gửi lại một thông báo lỗi

a. **Mục tiêu:** Đưa đúng một dòng đang "Lỗi gửi" về hàng đợi và gửi lại Email (lấy email hiện tại của học viên) mà không nhân bản thông báo in-app. (mục tiêu nghiệp vụ — kế hoạch TOS-23)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Dòng ở trạng thái `failed` (nút chỉ render trên dòng failed); học viên trên dòng có `student.email` khác rỗng (nếu rỗng → skipped).
d. **Luồng chính (truy vết F3):**
   1. Bấm "Gửi lại" → POST `/api/notification-logs/:id/resend` body "{}" (FR-13).
   2. Server xác nhận dòng thuộc org và đang `failed`; reset nguyên tử: status=queued, retry_count=0, last_error=null, recipient_email = email hiện tại (correlated subquery), channels nâng cấp CASE (FR-13, BR-12, BR-05).
   3. Không INSERT dòng mới, không đổi idempotency_key/read_at — in-app không nhân bản (BR-01, BR-03).
   4. deliver lại tối đa 3 lượt qua background (F6) (FR-17).
   5. 200 `{requeued, skipped, remaining}` → toast theo formatResendToast + invalidate toàn bộ query màn (FR-15).
e. **Luồng thay thế:**
   - 2a. Id lạ / thuộc org khác → 404 `not_found` (E-06).
   - 2b. Không còn `failed` (hoặc thua race 2 người bấm) → 409 `not_failed` → toast "Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi." (E-07, E-13).
   - 2c. Học viên trống email → 200 với `skipped: [{id, reason: "no_email"}]` → toast lỗi "Bỏ qua 1 thông báo do học viên chưa có email." (E-14).
   - 2d. Thiếu Origin hợp lệ → 403; thiếu Content-Type JSON → 415 (E-08, E-09).
   - 4a. Gửi lại vẫn lỗi → đủ 3 lượt rồi quay lại `failed` kèm E-selfomy-alignment-010 (E-10).
f. **Hậu điều kiện:** Dòng chuyển `queued` rồi `sent`/`read`/`failed`; in-app của học viên vẫn đúng 1 mục; nhật ký làm mới.
g. **Quy tắc liên quan:** FR-13, FR-15, FR-17, FR-18, FR-19; BR-01, BR-03, BR-05, BR-12.
h. **Truy vết:** apps/server/src/routes/notification-logs.ts:50-69, apps/server/src/routes/notification-logs.ts:221-239; apps/server/src/lib/notifications/requeue.ts:61-142; apps/web/src/routes/_auth/notifications/index.tsx:206-231, apps/web/src/routes/_auth/notifications/index.tsx:523-539; test: apps/server/src/routes/notification-logs.test.ts:453-603, apps/server/src/routes/notification-logs.test.ts:741-802; E2E: apps/e2e/specs/notifications-ac-003.spec.ts:130-386.
