---
phase: 3
title: "Chọn học viên đang nợ và Gửi nhắc học phí qua hàng đợi thông báo"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-02", "TOS-21 #454"]
---

# Phase 3: Nhắc học phí

<!-- Updated: Validation & Red-Team Session 1 — TOS-21 (#454) đã merge; dùng trực tiếp enqueueNotifications + deliverNotifications, chunk 50 cho D1, truyền số còn nợ vào tuitionReminderEvent, lọc kèm classId -->

## Goal

Cho phép giáo viên tích chọn các học viên đang nợ trên `/debts`, bấm `"Gửi nhắc học phí (N)"` ở PageHead, xác nhận hộp thoại và gọi `POST /api/debt-reminders` để phát thông báo `tuition_reminder` (Email + In-app) qua hạ tầng hàng đợi thông báo của TOS-21 (`#454`), chống gửi trùng trong cùng ngày VN và ghi nhận vào màn Nhật ký thông báo `/notifications` (`[5]`).

## Files to Create or Modify

- Modify: `packages/api/src/contracts.ts` — thêm `debtReminderCreateSchema`, `DebtReminderCreate`, `debtReminderResponseSchema`, `DebtReminderResponse`.
- Modify: `apps/server/src/lib/notifications/enqueue.ts` — chia chunk `D1_IN_ARRAY_CHUNK = 50` khi query `inArray(student.id, studentIds)` để không chạm trần 100 biến SQL của D1.
- Modify: `apps/server/src/routes/kernel.ts` — thêm handler `kernel.post("/debt-reminders", requireFinanceRole, ...)`.
- Modify: `apps/server/src/lib/require-finance-role.test.ts` — thêm `POST /api/debt-reminders` vào `FINANCE_ENDPOINTS`.
- Create: `apps/server/src/routes/debt-reminders.test.ts` — unit/integration test cho `POST /api/debt-reminders`.
- Modify: `apps/web/src/lib/repos/payments.ts` — thêm `sendDebtReminders(input, baseUrl)`.
- Modify: `apps/web/src/routes/_auth/debts/index.tsx` — thêm cột checkbox (disabled ở dòng `remaining === 0`, chặn `stopPropagation`), checkbox chọn tất cả các dòng đang nợ hiển thị, nút `"Gửi nhắc học phí (N)"` ở PageHead, hộp thoại xác nhận và toast kết quả có action/link sang `/notifications`.
- Modify: `apps/web/src/routes/_auth/debts/index.test.tsx` — thêm unit test cho chọn checkbox, hộp thoại xác nhận, gửi nhắc học phí và toast kết quả.

## Luồng server (`POST /api/debt-reminders`)

1. Validate body theo `debtReminderCreateSchema`:
   ```ts
   export const debtReminderCreateSchema = z
     .object({
       studentIds: z
         .array(z.string().trim().min(1).max(64))
         .min(1)
         .max(100)
         .refine((ids) => new Set(ids).size === ids.length, {
           message: "Duplicate studentIds are not allowed",
         }),
       classId: z.string().trim().min(1).max(64).optional(),
     })
     .strict();
   ```
2. Chia `studentIds` thành từng chunk 50 phần tử (`D1_IN_ARRAY_CHUNK = 50`) để query các hóa đơn còn nợ thuộc `ctx.orgId`:
   - Điều kiện hóa đơn còn nợ: `and(eq(invoice.orgId, ctx.orgId), inArray(invoice.studentId, chunk), ne(invoice.status, "paid"), sql`${invoice.paidAmount} < ${invoice.amount}`)`.
   - Nếu `body.data.classId` có truyền: `innerJoin(enrollment, and(eq(enrollment.id, invoice.enrollmentId), eq(enrollment.orgId, ctx.orgId), eq(enrollment.classId, body.data.classId)))` để khớp chính xác tập hóa đơn `openInvoiceIds` đang lọc trên `/debts`.
3. Với mỗi hóa đơn còn nợ tìm được, tính số tiền còn nợ thực tế `remainingAmount = inv.amount - Math.min(inv.paidAmount, inv.amount)` và dựng sự kiện bằng `tuitionReminderEvent({ id: inv.id, studentId: inv.studentId, amount: remainingAmount, due: inv.due }, vietnamTodayISO())` (`idempotencyKey = tuition_reminder:<invoiceId>:<YYYY-MM-DD VN>`).
4. Gọi trực tiếp `const { createdIds } = await enqueueNotifications(db, ctx.orgId, events)` (không qua `emitNotifications` để không nuốt lỗi DB và lấy được `createdIds`), sau đó kích hoạt `deliverNotifications(notifDeps.db, notifDeps.mailer, createdIds, notifDeps.studentOrigin)` qua `notifDeps.runInBackground` (hoặc `await` khi vắng mặt, dùng `notificationDepsFrom(deps)`).
5. Trả `c.json({ queued: createdIds.length, skipped: events.length - createdIds.length } satisfies DebtReminderResponse)` (cả `queued` và `skipped` đều tính theo đơn vị **hóa đơn còn nợ**; học viên đã thu đủ hoặc thuộc org khác không có hóa đơn còn nợ hợp lệ nên tạo 0 event).

## Tasks & Steps

### Task 3.1 — Thêm contract `debtReminderCreateSchema` và `DebtReminderResponse`
- **Goal:** Khai báo schema request/response cho `POST /api/debt-reminders` trong `@teacher-os/api/contracts`.
- **Target files and symbols:** `packages/api/src/contracts.ts` (`debtReminderCreateSchema`, `DebtReminderCreate`, `debtReminderResponseSchema`, `DebtReminderResponse`).
- **Steps:**
  1. Thêm `debtReminderCreateSchema` và `debtReminderResponseSchema = z.object({ queued: z.number().int().min(0), skipped: z.number().int().min(0) }).strict()` vào `packages/api/src/contracts.ts`.
  2. Export các type tương ứng.
- **Success criteria:** `packages/api` biên dịch không lỗi.
- **Verify:** `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 3.2 — Viết test đỏ cho `POST /api/debt-reminders` trên server
- **Goal:** Tạo bộ test kiểm tra toàn bộ luồng nhắc phí, chống trùng trong ngày, lọc theo `classId`, hóa đơn `mark-paid` và phân quyền `requireFinanceRole`.
- **Target files and symbols:** `apps/server/src/routes/debt-reminders.test.ts`, `apps/server/src/lib/require-finance-role.test.ts`.
- **Steps:**
  1. Tạo `apps/server/src/routes/debt-reminders.test.ts` kiểm tra:
     - 2 học viên đang nợ (tổng 3 hóa đơn còn nợ, trong đó 1 hóa đơn đã thu một phần 4.5M - 2M = còn nợ 2.5M) → trả `{ queued: 3, skipped: 0 }`; bản ghi `notification_record` có `event_type = "tuition_reminder"`, nội dung chứa số tiền còn nợ `2.500.000đ` (không phải 4.500.000đ gốc).
     - Gọi lại lần 2 trong cùng ngày VN → trả `{ queued: 0, skipped: 3 }`, không tạo thêm dòng `notification_record` và không gửi thêm email.
     - Hóa đơn đã `mark-paid` (`status = "paid"`, `paidAmount = 0`) hoặc đã đóng đủ (`paidAmount = amount`) → không được enqueue.
     - Truyền `classId` → chỉ nhắc hóa đơn thuộc lớp đó.
     - Học viên thuộc org khác → bị bỏ qua (`queued = 0, skipped = 0`).
     - Role `ta` / `class_teacher` → 403 `finance-forbidden`; chưa đăng nhập → 401.
  2. Trong `apps/server/src/lib/require-finance-role.test.ts`, thêm `{ method: "POST", path: () => "/api/debt-reminders", body: () => ({ studentIds: ["stu-1"] }) }` vào `FINANCE_ENDPOINTS`.
- **Success criteria:** Chạy test thất bại (red phase) vì route `POST /api/debt-reminders` chưa tồn tại.
- **Verify:** `pnpm --filter server test -- debt-reminders` exits non-zero; passing before implementation is a failure.

### Task 3.3 — Cài đặt `POST /api/debt-reminders` và chunk `enqueueNotifications`
- **Goal:** Hoàn thiện route `POST /api/debt-reminders` trong `kernel.ts` và bảo vệ `enqueueNotifications` trước giới hạn biến SQL của D1.
- **Target files and symbols:** `apps/server/src/lib/notifications/enqueue.ts` (`enqueueNotifications`), `apps/server/src/routes/kernel.ts` (`kernelRoutes`).
- **Steps:**
  1. Trong `apps/server/src/lib/notifications/enqueue.ts`, chia chunk `studentIds` theo `INSERT_CHUNK = 50` khi query bảng `student` (thay vì truyền mảng 100 phần tử vào 1 câu `inArray`).
  2. Trong `apps/server/src/routes/kernel.ts`, đăng ký `kernel.post("/debt-reminders", requireFinanceRole, async (c) => ...)` theo đúng 5 bước ở mục "Luồng server".
- **Success criteria:** Toàn bộ test trong `debt-reminders.test.ts`, `notifications.test.ts`, và `require-finance-role.test.ts` đều xanh.
- **Verify:** `pnpm --filter server test -- debt-reminders notifications require-finance-role` exits 0.

### Task 3.4 — Viết test đỏ & cài đặt UI chọn học viên + nút `"Gửi nhắc học phí"` trên `/debts`
- **Goal:** Cho phép tích chọn học viên đang nợ, xác nhận gửi nhắc phí, gọi API `POST /api/debt-reminders`, invalidate cache nhật ký thông báo và hiển thị toast kèm link sang `/notifications`.
- **Target files and symbols:** `apps/web/src/lib/repos/payments.ts` (`sendDebtReminders`), `apps/web/src/routes/_auth/debts/index.tsx` (`DebtsRoute`), `apps/web/src/routes/_auth/debts/index.test.tsx`.
- **Steps:**
  1. Trong `apps/web/src/lib/repos/payments.ts`, thêm `sendDebtReminders(input: DebtReminderCreate, baseUrl)` gọi `POST /api/debt-reminders`.
  2. Trong `apps/web/src/routes/_auth/debts/index.test.tsx`, thêm các test:
     - Dòng học viên đã thu đủ (`Lê Thu Hà`, `status === "clear"`) có checkbox `disabled`; dòng còn nợ có checkbox bật; click checkbox không điều hướng sang `/students/$studentId`.
     - Tích chọn 2 học viên đang nợ → nút ở PageHead hiển thị `"Gửi nhắc học phí (2)"` và được bật.
     - Bấm `"Gửi nhắc học phí (2)"` → mở modal xác nhận hiển thị số học viên và tổng số hóa đơn còn nợ; xác nhận → gọi `POST /api/debt-reminders`, hiển thị toast thành công kèm nút/link `"Xem nhật ký thông báo"` điều hướng sang `/notifications`; khi gọi lại trả `{ queued: 0, skipped: 2 }` → hiển thị toast báo đã gửi nhắc học phí trong hôm nay.
  3. Trong `apps/web/src/routes/_auth/debts/index.tsx`, cài đặt cột checkbox (bọc wrapper chặn `onClick` và `onKeyDown` Space/Enter nổi bọt lên `<tr>`), dẫn xuất `effectiveSelectedIds` bằng cách giao với các dòng đang hiển thị có `remaining > 0`, thêm nút `"Gửi nhắc học phí"` (`data-testid="send-debt-reminders"`) ở PageHead, hộp thoại xác nhận `Modal`, gọi `sendDebtReminders({ studentIds: effectiveSelectedIds, classId: search.lop })`, gọi `queryClient.invalidateQueries({ queryKey: ["kernel", "notification-logs"] })`, xóa selection và hiển thị toast kèm action điều hướng tới `/notifications`.
- **Success criteria:** Toàn bộ unit test của `apps/web` và `apps/server` xanh.
- **Verify:** `pnpm --filter web test -- debts/index` exits 0 and `pnpm check && pnpm check-types` exits 0.

## Verification

- `pnpm --filter server test -- debt-reminders require-finance-role`
- `pnpm --filter web test -- debts`
- `pnpm check`, `pnpm check-types`

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
