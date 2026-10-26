---
title: Ship TOS-22 Tự động thử gửi Email 3 lần và trạng thái Lỗi gửi (failed) kèm E-selfomy-alignment-010
date: 2026-10-27
summary: "Ship issue #463: vòng thử lại tự động 3 lượt trong deliverNotifications, chuyển trạng thái failed kèm mã E-selfomy-alignment-010 và sanitizeDeliveryError, hiển thị dòng phụ E-010 trên màn [5] /notifications và '3/3 lần thử' trong NotificationDetailDialog, giữ nguyên thông báo In-app của học viên, E2E AC-002 kèm screenshot 3 viewport; PR vào develop (beta)"
---

# Ship TOS-22 Tự động thử gửi Email 3 lần và trạng thái Lỗi gửi (failed) kèm E-selfomy-alignment-010

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #463 theo plan `plans/261027-0127-tos-22-notification-auto-retry-failed/` trên worktree `ai-handle-issue-463`. Hoàn tất cả 3 phase:
1. **Phase 1 (Backend Retry Loop & `E-selfomy-alignment-010`):** Thêm `MAX_EMAIL_ATTEMPTS = 3` và `NOTIFICATION_ERROR_CODES = { DELIVERY_FAILED: "E-selfomy-alignment-010" }` vào `@teacher-os/api/contracts`; nâng cấp `deliverNotifications` chạy tối đa 3 lượt với khoảng chờ inject được (`retryDelaysMs`, mặc định `[2000, 5000]`), re-select từ DB đầu mỗi lượt (`status = 'queued' AND retry_count < 3`), cập nhật nguyên tử `status = 'failed'` và `last_error` có tiền tố `E-selfomy-alignment-010:` (qua `sanitizeDeliveryError` che `Bearer` / `re_...`, cắt `≤ 500` ký tự) khi chạm lượt lỗi thứ 3, và xóa `last_error = null` nếu thành công ở lượt thử lại; nối DI `notificationRetryDelaysMs` qua `emit.ts`, `app.ts`, 4 route factory (`kernel.ts`, `grading.ts`, `holidays.ts`, `assignments/index.ts`) và `apps/e2e/src/boot.ts`.
2. **Phase 2 (Frontend Màn `[5]` `/notifications`):** Tạo helper `formatDeliveryError(lastError, retryCount)` bóc tiền tố `E-selfomy-alignment-010:`, cắt nguyên nhân `≤ 80` ký tự và fallback `"Không gửi được email"`; hiển thị dòng phụ màu đỏ `E-010: <nguyên nhân> sau <retryCount> lần thử` dưới thông tin người nhận cho dòng `failed` và hiển thị `"N/3 lần thử"` trong `NotificationDetailDialog`.
3. **Phase 3 (E2E AC-002):** Cập nhật `recordingMailer` trong `apps/e2e/src/boot.ts` giả lập lỗi `mailbox unavailable` cho thư thông báo nghiệp vụ gửi tới `@bounce.test` (bảo toàn thư xác thực Better-Auth) và viết `apps/e2e/specs/notifications-ac-002.spec.ts` kiểm chứng đủ 3 lần thử, giao diện 3 viewport (`1440×900`, `768×1024`, `375×812`) + keyboard focus và giữ nguyên In-app trên cổng học viên.

## Decision
- **Red-Team & Kongming Plan Gate (4 findings accepted):**
  1. Chỉ giả lập lỗi `@bounce.test` trong `recordingMailer` khi `!verifyMatch && !resetMatch` để không làm hỏng bước xác thực tài khoản học viên `verifyStudentEmailFromMailLog` ở Bước 4 E2E.
  2. Re-select các bản ghi `status = 'queued' AND retry_count < 3` đầu mỗi lượt retry và đặt cả `status` lẫn `last_error` trong cùng biểu thức SQL `CASE WHEN retry_count + 1 >= 3` để tránh lệch trạng thái giữa RAM và SQLite/D1; đồng thời đặt `lastError: null` khi gửi thành công ở lượt 2/3.
  3. Giữ nguyên nhãn `"Số lần thử lại"` (hiển thị `"N/3 lần thử"`) và `"Lỗi gửi"` trong `NotificationDetailDialog` để đồng nhất tài liệu và tương thích unit test hiện có.
  4. Truyền `notificationRetryDelaysMs` xuyên suốt 4 route factory (`kernelRoutes`, `gradingRoutes`, `holidayRoutes`, `assignmentRoutes`) và `notificationDepsFrom`.

## Verification
- `server`: 3 files / 33 notification & student-inbox tests passed (`notifications.test.ts`, `student-inbox.test.ts`, `notification-logs.test.ts`).
- `web`: 3 files / 22 notification tests passed (`notification-error.test.ts`, `notifications/index.test.tsx`, `repos/notifications.test.ts`).
- `e2e`: 2/2 Playwright specs passed (`notifications-ac-001.spec.ts`, `notifications-ac-002.spec.ts`), kèm screenshot 3 viewport tại `plans/261027-0127-tos-22-notification-auto-retry-failed/screenshots/`.
- `pnpm check` & `pnpm check-types`: 8/8 packages typecheck + build pass.

## Open
- Hành động bấm nút "Gửi lại" và "Gửi lại tất cả mục lỗi" (reset `failed → queued`, `retry_count = 0`) thuộc phạm vi TOS-23 (#464, unblocked ngay sau khi PR này merge vào `develop`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
