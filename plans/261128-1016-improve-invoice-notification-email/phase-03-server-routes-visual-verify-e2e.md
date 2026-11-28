---
title: "Phase 3: Server Routes, Visual Verify & E2E"
status: todo
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Server Routes, Visual Verify & E2E

## Goal
Nối đầy đủ dữ liệu hóa đơn, học viên, lớp, tổ chức và ngân hàng vào `POST /invoices` và `POST /debt-reminders` (không N+1, giữ hóa đơn legacy), kiểm chứng bằng integration test, chụp ảnh POT trực quan và chạy spec E2E `notifications-ac-001.spec.ts`.

## Files to Create / Modify
- Modify: `apps/server/src/routes/kernel.ts`
- Modify: `apps/server/src/kernel.test.ts`
- Modify: `apps/server/src/routes/debt-reminders.test.ts`
- Modify: `apps/e2e/specs/notifications-ac-001.spec.ts`
- Create (POT evidence): `plans/reports/<issue>-invoice-*.png`

## Tasks & Steps

### Task 3.1 — Nối ngữ cảnh đầy đủ trong `POST /invoices` và `POST /debt-reminders`
- Goal: Cung cấp tên học viên, tên lớp, tên tổ chức, `orgBankLink`, `paymentCode`, `payToken`, `studentOrigin`, `appOrigin` cho cả hai endpoint mà không phát sinh query N+1 và không làm rơi hóa đơn legacy.
- Target files and symbols: `apps/server/src/routes/kernel.ts` (`kernelRoutes` deps `appOrigin?`, `POST /invoices`, `POST /debt-reminders`).
- Steps:
  1. Thêm `appOrigin?: string;` vào `kernelRoutes(deps)` trong `apps/server/src/routes/kernel.ts`.
  2. Trong `POST /invoices`: mở rộng query `enrollment` với `leftJoin(classTable, ...)` để lấy `className`, query `student` lấy `name`, lưu biến `paymentCode` và `payToken` khi insert, sau đó `Promise.all` 2 query 1 dòng (`organization.name` và `orgBankLink` với `try/catch` fail-open) và truyền đầy đủ vào `invoiceIssuedEvent`.
  3. Trong `POST /debt-reminders`: đọc `organization.name` và `orgBankLink` 1 lần trước vòng chunk; trong vòng chunk mở rộng select lấy `note`, `paymentCode`, `payToken`, `studentName`, `className` dùng `innerJoin(student)` + **`leftJoin(enrollment)`** + `leftJoin(classTable)` khi không có `classId` (giữ `innerJoin(enrollment)` khi lọc `classId`), rồi dựng `tuitionReminderEvent` với `amount: amountDue` và `totalAmount: inv.amount`.
- Success criteria: Không có query N+1, hóa đơn legacy `enrollmentId: ""` hoặc `paymentCode: null` vẫn tạo thông báo nhắc nợ bình thường.
- Verify: `no verification needed` (kiểm chứng trực tiếp tại Task 3.2).

### Task 3.2 — Integration tests cho `POST /invoices` và `POST /debt-reminders`
- Goal: Chứng minh end-to-end tầng API sinh email HTML + text giàu thông tin, có VietQR khi liên kết bank, an toàn khi chưa liên kết hoặc thiếu `paymentCode`/`enrollmentId`.
- Target files and symbols: `apps/server/src/kernel.test.ts`, `apps/server/src/routes/debt-reminders.test.ts`.
- Steps:
  1. Thêm test trong `apps/server/src/kernel.test.ts` xác nhận `POST /api/invoices` gửi HTML/text có tên học viên, tên lớp, mã `INV-`, ngày VN `dd/mm/yyyy`, ghi chú, VietQR + memo khi đã liên kết ngân hàng, link `/pay/<payToken>`, và bỏ khối ngân hàng gọn khi chưa liên kết.
  2. Mở rộng `apps/server/src/routes/debt-reminders.test.ts` kiểm tra email HTML/text nhắc nợ (bao gồm thanh toán một phần, `body` vẫn chỉ chứa `2.500.000đ` không chứa `4.500.000đ`) và kịch bản hóa đơn legacy `enrollmentId: ""`, `paymentCode: null`, `payToken: null`.
  3. Chạy Vitest cho 2 file test.
- Success criteria: Toàn bộ test trong `kernel.test.ts` và `debt-reminders.test.ts` pass.
- Verify: `pnpm --filter server exec vitest run src/kernel.test.ts src/routes/debt-reminders.test.ts` exits 0 and prints `passed`.

### Task 3.3 — Cập nhật và chạy E2E `notifications-ac-001.spec.ts` + tạo ảnh POT
- Goal: Cập nhật assertion subject ở `notifications-ac-001.spec.ts`, chạy pass E2E lẻ, và render ảnh chụp email ở viewport desktop (light/dark) + mobile (375px) + trường hợp reminder/no-bank làm bằng chứng POT.
- Target files and symbols: `apps/e2e/specs/notifications-ac-001.spec.ts`, `plans/reports/<issue>-*.png`.
- Steps:
  1. Đổi `e.subject === "Hóa đơn học phí"` thành `e.subject.startsWith("Hóa đơn học phí")` tại dòng 248 và 252 của `apps/e2e/specs/notifications-ac-001.spec.ts`.
  2. Chạy E2E lẻ với port override: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e notifications-ac-001.spec.ts`.
  3. Dùng Playwright (qua script tạm trong scratch dir, không để lại trong repo) render HTML từ `renderInvoiceEmail` và chụp các ảnh POT vào `plans/reports/`, kiểm tra trực quan từng ảnh qua `read_file`.
  4. Chạy full local gate: `pnpm exec biome check . && pnpm check-types && pnpm test`.
- Success criteria: E2E lẻ pass, toàn bộ ảnh POT hiển thị rõ đẹp (QR nền trắng rõ ở dark mode, mobile không tràn ngang), full biome/typecheck/unit test xanh.
- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e notifications-ac-001.spec.ts && pnpm exec biome check . && pnpm check-types && pnpm test` exits 0.

## Todo
- [x] Task 3.1: Nối dữ liệu `POST /invoices` và `POST /debt-reminders` trong `kernel.ts`
- [x] Task 3.2: Integration tests `kernel.test.ts` và `debt-reminders.test.ts`
- [x] Task 3.3: E2E `notifications-ac-001.spec.ts`, ảnh POT trực quan và full local gates

## Success Criteria
- `notifications-ac-001.spec.ts`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` đều pass 100%, kèm đủ ảnh POT trong `plans/reports/`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
