---
title: "Phase 2: Invoice Polling & Notification Links"
status: done
---

# Phase 2: Invoice Polling & Notification Links

## Goal

Sửa màn hình chi tiết phiếu học phí học viên (`/student/tuition/$invoiceId`) để fetch sau `StudentPageGate`, hiển thị đúng light card + chuẩn hoá hóa đơn thu tay, poll 5s không nháy `"Đang tải…"`, giữ QR khi poll nền lỗi thoáng qua, heal cache `["student", "invoices"]` đúng lúc, có back link khi lỗi, và cập nhật `invoiceIssuedEvent` / `tuitionReminderEvent` trỏ thẳng `/tuition/<id>` theo quy trình TDD.

## Files to Create or Modify

- Create: `apps/student/src/lib/repos/payments-portal.test.ts`
- Create: `apps/student/src/routes/_auth/tuition/$invoiceId.test.tsx`
- Modify: `apps/student/vitest.config.ts`
- Modify: `apps/student/src/lib/repos/payments-portal.ts`
- Modify: `apps/student/src/lib/repos/student.ts`
- Modify: `apps/student/src/routes/_auth/tuition/$invoiceId.tsx`
- Modify: `apps/server/src/lib/notifications/templates.ts`
- Modify: `apps/server/src/lib/notifications/templates.test.ts`
- Modify: `apps/server/src/routes/debt-reminders.test.ts`
- Modify: `apps/server/src/kernel.test.ts`
- Modify: `apps/e2e/specs/notifications-ac-001.spec.ts`

## Tasks & Steps

### Task 2.1 — Thiết lập `VITE_SERVER_URL` cho Vitest `apps/student` & viết unit test TDD (Red)
- **Goal:** Đảm bảo Vitest `apps/student` chạy độc lập trên worktree sạch không cần `.env`, và tạo/cập nhật test thất bại trước khi sửa code.
- **Target files and symbols:**
  - `apps/student/vitest.config.ts`
  - `apps/student/src/lib/repos/payments-portal.test.ts` (`shouldPollPayment`)
  - `apps/student/src/routes/_auth/tuition/$invoiceId.test.tsx` (`StudentTuitionDetailView`)
  - `apps/server/src/lib/notifications/templates.test.ts` (`invoiceIssuedEvent`, `tuitionReminderEvent`)
  - `apps/server/src/routes/debt-reminders.test.ts`
  - `apps/server/src/kernel.test.ts`
- **Steps:**
  1. Thêm `process.env.VITE_SERVER_URL ??= "http://localhost:8000";` vào đầu `apps/student/vitest.config.ts` (giống `apps/web/vitest.config.ts:10`).
  2. Tạo `apps/student/src/lib/repos/payments-portal.test.ts` kiểm `shouldPollPayment` qua các nhánh: `panelOpen: false`, `payable: false`, `document.hidden === true`, trong cap `< POLL_CAP_MS`, và vượt cap `>= POLL_CAP_MS`.
  3. Tạo `apps/student/src/routes/_auth/tuition/$invoiceId.test.tsx` (`// @vitest-environment jsdom`), mock `@tanstack/react-router` (`createFileRoute`, `Link`) và `@/lib/repos/student` (`fetchStudentInvoicePayment`), render trực tiếp `StudentTuitionDetailView` (không dính `StudentPageGate` / `StudentShell` / `NotificationBell`) trong `QueryClientProvider` kiểm:
     - Hóa đơn chưa thanh toán (`amount: 1000`, `paidAmount: 0`, `amountDue: 1000`, `status: "unpaid"`, `reason: "NO_BANK_LINK"`): ô `"Còn lại"` dùng `bg-card`, `border`, số `1.000đ` màu `text-destructive` (`tabular-nums`), không chứa `"Chuyển khoản theo QR dưới đây"`, hiện `"Giáo viên chưa thiết lập nhận chuyển khoản"`.
     - Hóa đơn thu tay (`amount: 1000`, `paidAmount: 0`, `amountDue: 1000`, `status: "paid"`, `reason: "PAID"`): `"Đã đóng"` hiện `1.000đ`, `"Còn lại"` hiện `0đ` với `text-foreground` (không `text-destructive`), hiện `"Đã thanh toán đủ"`, không chứa `"Chuyển khoản theo QR dưới đây"`.
     - Error state ban đầu (chưa có `data`): hiện `"Không mở được phiếu học phí này."` và link `<a href="/tuition">← Học phí</a>`.
     - Transient poll error sau khi đã có QR (`payable: true`): lượt poll lỗi vẫn giữ QR trên màn hình (không xóa về màn lỗi) và dừng poll tiếp (`status === "error"`).
     - Polling với `vi.useFakeTimers()`: khi `payable: true`, tiến `POLL_INTERVAL_MS` gọi refetch mà không hiện lại `"Đang tải…"`; khi `paidAmount` hoặc `status` đổi thì invalidate `["student", "invoices"]`; khi cache `["student", "invoices"]` đã có dữ liệu cũ hơn lúc mount (`paidAmount`/`status` lệch), heal bằng invalidate ngay; không invalidate giả khi đổi `invoiceId` với cache khớp; dừng poll ngay khi `document.hidden = true` (qua `visibilitychange`) hoặc chạm cap 15 phút và tiếp tục khi `visibilitychange` về visible.
  4. Cập nhật `templates.test.ts` (`linkPath` sang `"/tuition/inv-1"`, thêm test `tuitionReminderEvent` cho ID thường, ID có ký tự đặc biệt cần encode, và ID rỗng / `.` / `..` fallback `"/tuition"`), `debt-reminders.test.ts` (`rows[0]?.linkPath` = `"/tuition/inv-1a"`), và `kernel.test.ts` (`linkPath: \`/tuition/${invoiceId}\``).
- **Success criteria:** Các test mới chạy và FAIL đúng trước khi sửa code (Red phase).
- **Verify:** `pnpm --filter student test src/lib/repos/payments-portal.test.ts src/routes/_auth/tuition/\$invoiceId.test.tsx` và `pnpm --filter server test src/lib/notifications/templates.test.ts src/routes/debt-reminders.test.ts` thoát khác 0.

### Task 2.2 — Refactor `payments-portal.ts`, `student.ts`, và `$invoiceId.tsx`
- **Goal:** Cô lập fetch payment vào `StudentTuitionDetailView` bên trong `StudentPageGate`, key theo `[orgId, invoiceId]`, sửa ô `"Còn lại"` + hóa đơn thu tay, bỏ nháy `"Đang tải…"` bằng `refetchInterval`, dừng poll khi ẩn/lỗi/quá cap, giữ QR khi poll lỗi thoáng qua, heal cache `["student", "invoices"]`, và bổ sung back link ở error state.
- **Target files and symbols:**
  - `apps/student/src/lib/repos/payments-portal.ts` (`shouldPollPayment`)
  - `apps/student/src/lib/repos/student.ts` (`fetchStudentInvoicePayment`, line 1094)
  - `apps/student/src/routes/_auth/tuition/$invoiceId.tsx` (`StudentTuitionDetailRoute`, `StudentTuitionDetailView`)
- **Steps:**
  1. Thêm `shouldPollPayment` vào `apps/student/src/lib/repos/payments-portal.ts` (giống hợp đồng của `apps/web/src/lib/repos/payments.ts`).
  2. Trong `fetchStudentInvoicePayment` (`apps/student/src/lib/repos/student.ts`), bọc `encodeURIComponent(invoiceId)` vào URL `/api/student/invoices/${encodeURIComponent(invoiceId)}/payment`.
  3. Trong `$invoiceId.tsx`:
     - `StudentTuitionDetailRoute` chỉ giữ `Route.useParams()` + `Route.useRouteContext()` và render `<StudentPageGate sessionEmail={sessionEmail}>{(me) => <StudentTuitionDetailView invoiceId={invoiceId} studentName={me.student.name} orgId={me.student.orgId} />}</StudentPageGate>`.
     - Export `StudentTuitionDetailView({ invoiceId, studentName, orgId })`:
       - Dùng `useQueryClient()`, `const [openedAt, setOpenedAt] = useState(() => Date.now())`, `const [isHidden, setIsHidden] = useState(() => typeof document !== "undefined" ? document.hidden : false)`.
       - Khi `invoiceId` hoặc `orgId` đổi, gọi `setOpenedAt(Date.now())`.
       - Lắng nghe `visibilitychange`: luôn cập nhật `setIsHidden(document.hidden)` và khi `!document.hidden` gọi `setOpenedAt(Date.now())`.
       - Dùng `useQuery` với `queryKey: ["student", "invoice-payment", orgId, invoiceId]`, `staleTime: 0`, và:
         ```ts
         refetchInterval: (query) => {
           if (isHidden || query.state.status === "error") return false;
           const current = query.state.data;
           if (!current) return false;
           return shouldPollPayment({
             panelOpen: true,
             payable: current.payable,
             openedAt,
             now: Date.now(),
           })
             ? POLL_INTERVAL_MS
             : false;
         },
         ```
       - Dùng `seenRef = useRef<{ key: string; paidAmount: number; status: string } | null>(null)` với `const seenKey = \`${orgId}:${invoiceId}\`;` trong `useEffect`:
         - Khi `payment.data === undefined`, return.
         - Nếu `seenRef.current === null || seenRef.current.key !== seenKey`: lưu `seenRef.current = { key: seenKey, paidAmount: payment.data.paidAmount, status: payment.data.status }`; kiểm tra `queryClient.getQueryData<StudentInvoiceItem[]>(["student", "invoices"])` xem có item `id === invoiceId` mà `paidAmount !== payment.data.paidAmount || status !== payment.data.status` không — nếu có, gọi `void queryClient.invalidateQueries({ queryKey: ["student", "invoices"] })`.
         - Ngược lại (cùng `seenKey`), nếu `paidAmount` hoặc `status` đổi, cập nhật `seenRef.current` và gọi `void queryClient.invalidateQueries({ queryKey: ["student", "invoices"] })`.
       - Thứ tự guard render: `if (payment.isLoading && !payment.data)` → `"Đang tải…"`; `if (!payment.data)` → `<div className="mx-auto flex w-full max-w-md flex-col gap-3 p-6"><Link to="/tuition" ...>← Học phí</Link><p className="text-muted-foreground text-sm">Không mở được phiếu học phí này.</p></div>`. (Nếu đã có `payment.data` mà poll nền lỗi, vẫn giữ hiển thị hóa đơn & QR.)
       - Chuẩn hoá `isSettled = data.status === "paid" || data.reason === "PAID" || data.amountDue <= 0`, `displayPaid = isSettled ? data.amount : data.paidAmount`, `displayDue = isSettled ? 0 : data.amountDue`; cả 2 tile dùng `rounded-xl border bg-card p-4 text-card-foreground shadow-sm`, giá trị `displayDue > 0 ? "text-destructive" : "text-foreground"` kèm `tabular-nums`.
- **Success criteria:** Toàn bộ test `payments-portal.test.ts` và `$invoiceId.test.tsx` pass.
- **Verify:** `pnpm --filter student test src/lib/repos/payments-portal.test.ts src/routes/_auth/tuition/\$invoiceId.test.tsx` exits 0.

### Task 2.3 — Cập nhật `linkPath` trong `templates.ts` và đồng bộ E2E `notifications-ac-001.spec.ts`
- **Goal:** Đưa link thông báo hóa đơn và nhắc học phí về `/tuition/<id>` an toàn (chặn rỗng & dot-segment `.`/`..`).
- **Target files and symbols:**
  - `apps/server/src/lib/notifications/templates.ts` (`invoiceTuitionLinkPath`, `tuitionReminderEvent`, `invoiceIssuedEvent`)
  - `apps/e2e/specs/notifications-ac-001.spec.ts` (lines 305-308)
- **Steps:**
  1. Thêm helper `invoiceTuitionLinkPath(invoiceId: string)` trả `` (!trimmed || trimmed === "." || trimmed === "..") ? "/tuition" : `/tuition/${encodeURIComponent(trimmed)}` `` và dùng cho `tuitionReminderEvent` lẫn `invoiceIssuedEvent`.
  2. Grep lại `apps/server/src/` và `apps/e2e/specs/` để chắc chắn không còn assertion nào pin `linkPath: "/tuition"` cho 2 event này.
  3. Cập nhật `apps/e2e/specs/notifications-ac-001.spec.ts` kiểm tra URL khớp `new RegExp(\`^${STUDENT_BASE_URL}/tuition/[^/]+$\`)`, giữ kiểm `"500.000đ"`, đồng thời kiểm ẩn `"Chuyển khoản theo QR dưới đây"` và hiện `"Giáo viên chưa thiết lập nhận chuyển khoản"`.
- **Success criteria:** Tất cả test server về notification templates, debt reminders và kernel đều pass.
- **Verify:** `pnpm --filter server test src/lib/notifications/templates.test.ts src/routes/debt-reminders.test.ts src/kernel.test.ts` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
