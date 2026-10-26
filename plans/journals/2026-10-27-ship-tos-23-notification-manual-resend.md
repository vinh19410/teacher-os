---
title: Ship TOS-23 Nút Gửi lại / Gửi lại tất cả mục lỗi không nhân bản thông báo In-app
date: 2026-10-27
summary: "Ship issue #464: requeueSingleFailedNotification + requeueFailedNotifications, POST /api/notification-logs/:id/resend & /resend-failed, nút Gửi lại trên dòng failed + nút header Gửi lại tất cả mục lỗi (N) có Modal xác nhận trên /notifications, E2E AC-003; PR vào develop (beta)"
---

# Ship TOS-23 Nút Gửi lại / Gửi lại tất cả mục lỗi không nhân bản thông báo In-app

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #464 theo plan `plans/261027-0127-tos-23-notification-manual-resend/` trên worktree `ai-handle-issue-464`. Hoàn tất cả 3 phase:
1. **Phase 1 (`requeueFailedNotifications` + `POST /:id/resend` & `POST /resend-failed`):** Thêm `RESEND_BATCH_LIMIT = 50`, `resendFailedBodySchema`, `notificationResendResponseSchema` trong `@teacher-os/api/contracts`; tạo `apps/server/src/lib/notifications/requeue.ts` đặt lại nguyên tử bản ghi `failed` về `queued` (`retry_count = 0`, `last_error = null`, lấy lại `recipient_email` từ `student.email` hiện tại qua correlated subquery, đảm bảo `channels` có `'email'`, bảo toàn `idempotency_key` và `read_at`), tách riêng học viên trống email vào `skipped` (`no_email`) để không nghẽn hàng đợi và tính chính xác `remaining`; đăng ký `POST /api/notification-logs/:id/resend` (404 ngoài org, 409 nếu không ở `failed`) và `POST /api/notification-logs/resend-failed` kích hoạt `deliverNotifications` chạy nền qua `runInBackground`.
2. **Phase 2 (Nút `"Gửi lại"` & `"Gửi lại tất cả mục lỗi (N)"` trên `/notifications`):** Thêm `notificationLogsAllQueryKey`, `resendNotification(id)`, `resendFailedNotifications({ q, event })` trong `apps/web/src/lib/repos/notifications.ts`; hiển thị nút `"Gửi lại"` trên dòng `failed` và nút `"Gửi lại tất cả mục lỗi (N)"` ở `PageHead.action` (ẩn khi `counts.failed = 0`) mở hộp thoại xác nhận `Modal`, bắn toast qua `sonner` và invalidate toàn bộ query thông báo; sửa điều kiện `showGlobalEmptyState` để giữ nguyên thanh `ChipFilter` khi bộ lọc `?status=failed` về 0 dòng.
3. **Phase 3 (E2E AC-003):** Tạo `apps/e2e/specs/notifications-ac-003.spec.ts` kiểm chứng gửi lại đơn lẻ khi địa chỉ vẫn `@bounce.test` (thử lại thêm 3 lượt, không nhân bản In-app), cập nhật `student.email` sang địa chỉ hợp lệ rồi bấm `"Gửi lại tất cả mục lỗi (2)"` (gửi thành công tới địa chỉ mới, bảo toàn `read_at` chuyển sang `"Đã xem"`, chip `"Lỗi gửi"` về `0`, cổng học viên vẫn đúng 1 mục In-app), kèm kiểm chứng 3 viewport (`1440×900`, `768×1024`, `375×812`) và điều hướng bàn phím.

## Decision
- **Red-Team & Kongming Plan Gate (5 findings accepted):**
  1. Dùng correlated subquery từ bảng `student` trong `UPDATE notification_record` để cập nhật đúng `recipient_email` của từng học viên trong lô 50 bản ghi, đồng thời tách truy vấn `no_email` khỏi `LIMIT 50` và dùng `COUNT(*)` để chống head-of-line starvation và tính đúng `remaining`.
  2. Chỉ đối chiếu `student.email` trong `buildNotificationQFilter` khi `recipientEmail IS NOT NULL` (hoặc trong luồng `requeueFailedNotifications`) để không làm lệch kết quả lọc của bản ghi chỉ `in_app` trên `GET /api/notification-logs`.
  3. Dùng `Modal` (`apps/web/src/components/ui/modal.tsx`), `notificationLogsAllQueryKey`, và tách `showGlobalEmptyState` khỏi `rows.length === 0` để thanh `ChipFilter` không biến mất khi lọc `?status=failed` hết mục lỗi.
  4. Gửi tường minh `headers: { "content-type": "application/json" }` và `body: "{}"` trong `resendNotification(id)` để tuân thủ guard `415` của `kernelRoutes`.
  5. Trong E2E Phase 3, kiểm tra cả trường hợp gửi lại khi email vẫn lỗi (`@bounce.test`) lẫn sau khi cập nhật `student.email` sang địa chỉ hợp lệ (`@test.local`).

## Verification
- `server`: 3 files / 39 tests passed (`notification-logs.test.ts`, `notifications.test.ts`, `templates.test.ts`).
- `web`: 3 files / 24 tests passed (`repos/notifications.test.ts`, `routes/_auth/notifications/index.test.tsx`, `notification-error.test.ts`).
- `e2e`: 3/3 Playwright tests passed (`notifications-ac-001.spec.ts`, `notifications-ac-002.spec.ts`, `notifications-ac-003.spec.ts`), kèm screenshot 3 viewport tại `plans/261027-0127-tos-23-notification-manual-resend/screenshots/`.
- `pnpm check` & `pnpm check-types`: pass toàn bộ repo sau khi merge `origin/develop`.

## Open
- Không còn hạng mục mở trong phạm vi US-004 (TOS-21, TOS-22, TOS-23 đã hoàn tất).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
