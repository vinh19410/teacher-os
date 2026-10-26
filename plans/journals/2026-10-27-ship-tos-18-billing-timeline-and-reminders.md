---
title: Ship TOS-18 Dòng thời gian hóa đơn & giao dịch theo học viên và gửi nhắc học phí
date: 2026-10-27
summary: "Ship issue #452: GET /api/students/:id/billing-timeline + BillingTimelineDrawer mở từ nút (eye) trên /debts, cột checkbox chọn học viên đang nợ + POST /api/debt-reminders qua hàng đợi thông báo Email + In-app chống trùng theo ngày VN, E2E AC-004; PR vào develop (beta)"
---

# Ship TOS-18 Dòng thời gian hóa đơn & giao dịch theo học viên và gửi nhắc học phí

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #452 theo plan `plans/261026-2038-tos-18-billing-timeline-and-reminders/` trên worktree `ai-handle-issue-452`. Hoàn tất cả 4 phase:
1. **Phase 1 (`GET /api/students/:id/billing-timeline`):** Thêm `BillingTimelineEvent` (`invoice_issued` | `payment` có `id`, `at = createdAt.toISOString()`, `code = INV-${id.slice(-8).toUpperCase()}`) và `BillingTimelineResponse` trong `@teacher-os/api/contracts`; đăng ký `GET /api/students/:id/billing-timeline` trong `kernelRoutes` dưới `requireFinanceRole` (org-scoped, 404 nếu học viên không thuộc org, `INNER JOIN invoice` cho giao dịch `matched`, lọc `note = isManual ? tx.content : ""` để không lộ PII sao kê ngân hàng của `sepay_bankhub`, sắp xếp giảm dần theo `createdAt` với tie-break `payment` trước `invoice_issued` rồi theo `id`).
2. **Phase 2 (`BillingTimelineDrawer` & nút `(eye)` trên `/debts`):** Thêm `billingTimelineQueryOptions(studentId)` với `staleTime: 0` trong `apps/web/src/lib/repos/payments.ts`; tạo `BillingTimelineDrawer` hiển thị 3 chỉ số lũy kế (`totalDue`, `totalPaid`, `remaining`), nhóm sự kiện theo tháng (`Asia/Ho_Chi_Minh`), badge nguồn `"QR Bank-Hub"` / `"Thu thủ công · {method}"`, link `/tuition/$invoiceId`, focus vào `<h2 tabIndex={-1}>` khi mở và hoàn trả focus về nút `(eye)` khi đóng (`Escape`/nút đóng).
3. **Phase 3 (Chọn học viên đang nợ & `POST /api/debt-reminders`):** Chia chunk 50 cho `inArray(student.id, ...)` trong `enqueueNotifications` và `POST /api/debt-reminders` để tuân thủ trần 100 bind parameters của Cloudflare D1; đăng ký `POST /api/debt-reminders` dưới `requireFinanceRole` lọc hóa đơn còn nợ (`status <> 'paid' AND paid_amount < amount`, kèm `INNER JOIN enrollment` khi có `classId`), tính đúng số dư còn nợ `amount - min(paidAmount, amount)` truyền vào `tuitionReminderEvent(..., vietnamTodayISO())`, gọi trực tiếp `enqueueNotifications` + `deliverNotifications`, trả `{ queued, skipped }` theo đơn vị hóa đơn còn nợ; trên `/debts` thêm cột checkbox (disabled khi `remaining <= 0`, chặn `stopPropagation` cho click + Space/Enter), nút `"Gửi nhắc học phí (N)"` ở PageHead, hộp thoại xác nhận, invalidate `["kernel", "notification-logs"]` và toast kèm action điều hướng sang `/notifications`.
4. **Phase 4 (E2E AC-004):** Tạo `apps/e2e/specs/debt-timeline-and-reminders.spec.ts` kiểm chứng toàn trình timeline (hóa đơn + webhook IPN `/webhooks/sepay/bankhub/ipn` + phiếu thu tiền mặt) và gửi nhắc học phí (Email + In-app + chống trùng lần 2 cùng ngày + kiểm tra `/notifications?event=tuition`) kèm chụp ảnh 3 viewport (`1440×900`, `768×1024`, `375×812`).

## Decision
- **Red-Team & Kongming Plan Gate (8 findings accepted):**
  1. Gọi trực tiếp `enqueueNotifications` + `deliverNotifications` trong `POST /api/debt-reminders` thay vì `emitNotifications` (vốn trả `Promise<void>` và nuốt lỗi DB), chuẩn hóa `{ queued, skipped }` theo đơn vị hóa đơn còn nợ.
  2. Dùng thống nhất `createdAt.toISOString()` làm trường `at` và khóa sắp xếp cho cả `invoice_issued` lẫn `payment` (tránh đảo thứ tự trong ngày do `invoice.date` rỗng và `transactionDate` manual đóng cứng `00:00:00`), thêm `id` vào nhánh `payment`.
  3. Gắn tường minh `requireFinanceRole` cho cả 2 route mới và bổ sung vào `FINANCE_ENDPOINTS` trong `require-finance-role.test.ts`.
  4. Chỉ trả `note: tx.provider === "manual" ? tx.content : ""` để không lộ nội dung sao kê ngân hàng gốc của `sepay_bankhub` (#320 PII retention).
  5. Lọc hóa đơn còn nợ bằng `ne(invoice.status, "paid")` kết hợp `paid_amount < amount`, truyền số dư còn nợ thực tế vào `tuitionReminderEvent`, và hỗ trợ lọc theo `classId` (`search.lop`).
  6. Dùng `INNER JOIN invoice` ở timeline API và chia chunk 50 ở `debt-reminders` + `enqueueNotifications` để không vượt giới hạn 100 bind parameters của Cloudflare D1.
  7. Đặt `staleTime: 0` cho query timeline, chặn `stopPropagation` trên cột checkbox và focus heading `<h2>` (`tabIndex={-1}`) khi mở drawer.
  8. Trong E2E Phase 4, seed `org_bank_link` và gọi webhook `POST /webhooks/sepay/bankhub/ipn` kèm `payment_code` thật của hóa đơn.

## Verification
- `server`: 72 files / 973 tests passed (`billing-timeline.test.ts`, `debt-reminders.test.ts`, `require-finance-role.test.ts`, `notifications.test.ts`).
- `web`: 156 files / 1650 tests passed (`billing-timeline-drawer.test.tsx`, `debts/index.test.tsx`).
- `e2e`: 6/6 Playwright tests passed (`debt-timeline-and-reminders.spec.ts`, `debt-ledger-filters.spec.ts`, `debt-record-payment.spec.ts`, `debt-payment-validation-and-guard.spec.ts`, `notifications-ac-001.spec.ts`), kèm screenshot 3 viewport tại `plans/261026-2038-tos-18-billing-timeline-and-reminders/screenshots/`.
- `pnpm check` & `pnpm check-types`: 8/8 packages typecheck + build pass.

## Open
- Tự động thử lại 3 lần khi gửi email lỗi và nút `"Gửi lại"` trên màn Nhật ký thông báo thuộc TOS-22 / TOS-23.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
