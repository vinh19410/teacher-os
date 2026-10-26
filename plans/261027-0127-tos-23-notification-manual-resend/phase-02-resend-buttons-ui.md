---
phase: 2
title: "Nút Gửi lại trên dòng failed và nút Gửi lại tất cả mục lỗi (N)"
status: completed
priority: P0
effort: "3h"
dependencies: [1]
---

# Phase 2: UI Gửi lại trên màn Nhật ký thông báo `[5]`

<!-- Updated: Validation & Red Team Session 1 - Handover decomposition + Modal confirm + notificationLogsAllQueryKey + Content-Type JSON + empty-state filter fix -->

## Goal

Bổ sung hàm client `resendNotification(id)` và `resendFailedNotifications({ q, event })` (kèm prefix key `notificationLogsAllQueryKey`), hiển thị nút `"Gửi lại"` trên từng dòng `status === "failed"` và nút header `"Gửi lại tất cả mục lỗi (N)"` (khi `counts.failed > 0`) mở hộp thoại xác nhận `Modal`, thông báo kết quả qua `toast` (`sonner`) và làm mới danh sách đúng chuẩn `DESIGN.md`.

## Files to Create or Modify

- Modify: `apps/web/src/lib/repos/notifications.ts`
- Modify: `apps/web/src/lib/repos/notifications.test.ts`
- Modify: `apps/web/src/routes/_auth/notifications/index.tsx`
- Modify: `apps/web/src/routes/_auth/notifications/index.test.tsx`

## Tasks & Steps

### Task 2.1 — Thêm `resendNotification`, `resendFailedNotifications` và unit test trong `repos/notifications` (TDD)
- **Goal:** Cung cấp 2 hàm gọi API `POST /api/notification-logs/:id/resend` và `POST /api/notification-logs/resend-failed` luôn gửi `Content-Type: application/json` + `credentials: "include"`, parse bằng `notificationResendResponseSchema`, và export `notificationLogsAllQueryKey`.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/notifications.ts` (`notificationLogsAllQueryKey`, `resendNotification`, `resendFailedNotifications`)
  - `apps/web/src/lib/repos/notifications.test.ts`
- **Steps:**
  1. Trong `apps/web/src/lib/repos/notifications.test.ts`, thêm `describe("resendNotification & resendFailedNotifications (#464)")` kiểm tra:
     - `resendNotification("nt-4", BASE)` gọi `POST http://api/api/notification-logs/nt-4/resend` với `credentials: "include"`, `headers: { "content-type": "application/json" }`, `body: "{}"`, và trả về `{ requeued: 1, skipped: [], remaining: 0 }`.
     - Khi server trả `409`, `resendNotification` ném `HttpError` với `status === 409`.
     - `resendFailedNotifications({ q: "  minh ", event: "tuition" }, BASE)` gọi `POST http://api/api/notification-logs/resend-failed` với body `JSON.stringify({ q: "minh", event: "tuition" })` và parse kết quả qua `notificationResendResponseSchema`.
  2. Trong `apps/web/src/lib/repos/notifications.ts`:
     - Export `export const notificationLogsAllQueryKey = ["kernel", "notification-logs"] as const;`.
     - Cập nhật `notificationLogsQueryKey` dùng `notificationLogsAllQueryKey`: `export const notificationLogsQueryKey = (params: NotificationLogQuery) => [...notificationLogsAllQueryKey, params] as const;`.
     - Cài đặt `resendNotification(id: string, baseUrl: string = getApiBaseUrl())`: gửi `POST ${baseUrl}/api/notification-logs/${encodeURIComponent(id)}/resend` với `credentials: "include"`, `headers: { "content-type": "application/json" }`, `body: "{}"`; nếu `!res.ok` ném `new HttpError(res.status, ...)`; parse response bằng `notificationResendResponseSchema.parse(await res.json())`.
     - Cài đặt `resendFailedNotifications(params: ResendFailedBody, baseUrl: string = getApiBaseUrl())`: chuẩn hóa `{ ...(params.q?.trim() ? { q: params.q.trim() } : {}), ...(params.event ? { event: params.event } : {}) }`, gửi `POST ${baseUrl}/api/notification-logs/resend-failed` với `credentials: "include"`, `headers: { "content-type": "application/json" }`, `body: JSON.stringify(payload)`; nếu `!res.ok` ném `new HttpError(res.status, ...)`; parse bằng `notificationResendResponseSchema.parse(await res.json())`.
- **Success criteria:** Unit test trong `apps/web/src/lib/repos/notifications.test.ts` pass toàn bộ.
- **Verify:** `pnpm --filter web test -- src/lib/repos/notifications.test.ts` exits `0`.

### Task 2.2 — Thêm nút "Gửi lại" trên dòng `failed`, nút header "Gửi lại tất cả mục lỗi (N)" + `Modal` xác nhận + toast vào màn `[5]` kèm unit test
- **Goal:** Hiển thị nút `"Gửi lại"` chỉ trên dòng `failed`, nút `"Gửi lại tất cả mục lỗi (N)"` ở `PageHead.action` khi `counts.failed > 0` kèm `Modal` xác nhận, hiển thị toast kết quả và làm mới cache thông báo.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/notifications/index.tsx` (`NotificationsRoute`, `formatResendToast`)
  - `apps/web/src/routes/_auth/notifications/index.test.tsx`
- **Steps:**
  1. Trong `apps/web/src/routes/_auth/notifications/index.tsx`:
     - Import `useMutation, useQueryClient` từ `@tanstack/react-query`, `RotateCcw` từ `lucide-react`, `toast` từ `"sonner"`, `Modal` từ `@/components/ui/modal`, và `notificationLogsAllQueryKey, resendFailedNotifications, resendNotification` từ `@/lib/repos/notifications`.
     - Viết helper `formatResendToast(res: NotificationResendResponse)`:
       - Nếu `res.requeued === 0 && res.skipped.length > 0`: trả về `{ kind: "warning" as const, message: `Bỏ qua ${res.skipped.length} thông báo do học viên chưa có email.` }`.
       - Ngược lại ghép chuỗi: `Đã đưa ${res.requeued} thông báo về hàng đợi để gửi lại.` + (nếu `res.skipped.length > 0` thêm ` Bỏ qua ${res.skipped.length} mục thiếu email.`) + (nếu `res.remaining > 0` thêm ` Còn ${res.remaining} mục lỗi, bấm lại để gửi tiếp.`), trả `{ kind: "success" as const, message }`.
     - Tạo `singleResendMutation` (`useMutation`): gọi `resendNotification(id)`, `onSuccess`: bắn toast theo `formatResendToast` và `await queryClient.invalidateQueries({ queryKey: notificationLogsAllQueryKey })`; `onError`: nếu `isHttpError(err) && err.status === 409` thì `toast.error("Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi.")` và invalidate query, ngược lại `toast.error("Không thể gửi lại thông báo. Vui lòng thử lại.")`.
     - Tạo `bulkResendMutation` (`useMutation`): gọi `resendFailedNotifications({ q: searchParams.q, event: eventFilter !== "all" ? eventFilter : undefined })`, `onSuccess`: đóng `Modal` xác nhận (`setConfirmBulkOpen(false)`), bắn toast theo `formatResendToast`, và `await queryClient.invalidateQueries({ queryKey: notificationLogsAllQueryKey })`; `onError`: `toast.error("Không thể gửi lại các thông báo lỗi. Vui lòng thử lại.")`.
     - Trên `PageHead`, truyền prop `action`: khi `failedCount > 0` (`const failedCount = data?.counts.failed ?? 0;`), hiển thị `<Button variant="secondary" size="sm" disabled={bulkResendMutation.isPending || singleResendMutation.isPending} onClick={() => setConfirmBulkOpen(true)}> <RotateCcw aria-hidden="true" className="size-4" /> {`Gửi lại tất cả mục lỗi (${failedCount})`} </Button>`.
     - Sửa điều kiện empty state ở dòng ~266: chỉ hiển thị `data-testid="notifications-empty-state"` khi `(data?.counts.all ?? 0) === 0 && !searchParams.q && eventFilter === "all" && statusFilter === "all"`. Nhờ đó, khi người dùng lọc `?status=failed` và gửi lại hết mục lỗi (`rows.length === 0` nhưng `counts.all > 0`), thanh `ChipFilter` vẫn hiển thị cùng thông báo `"Không có thông báo nào phù hợp với bộ lọc."`.
     - Trong cột Thao tác của `DataTable` (ô thứ 6): bọc trong `<div key="action" className="flex items-center justify-end gap-1.5 whitespace-nowrap">`:
       - Nếu `row.status === "failed"`, render trước nút eye:
         ```tsx
         <Button
           variant="outline"
           size="sm"
           disabled={singleResendMutation.isPending || bulkResendMutation.isPending}
           aria-label={`Gửi lại thông báo cho ${row.recipientName}`}
           onClick={() => singleResendMutation.mutate(row.id)}
         >
           <RotateCcw aria-hidden="true" className="size-3.5" />
           <span>Gửi lại</span>
         </Button>
         ```
       - Giữ nguyên nút eye (`Xem chi tiết thông báo cho ${row.recipientName}`).
     - Thêm `<Modal open={confirmBulkOpen} onClose={() => !bulkResendMutation.isPending && setConfirmBulkOpen(false)} title="Gửi lại tất cả thông báo lỗi?">` với nội dung xác nhận `"Đưa ${failedCount} thông báo lỗi trong bộ lọc hiện tại về hàng đợi để gửi lại Email. Thông báo In-app trên cổng học viên không bị gửi trùng."` và 2 nút ở chân hộp thoại: `"Hủy"` (`variant="secondary"`) và `"Xác nhận gửi lại"` (`variant="primary"`, `disabled={bulkResendMutation.isPending}`, `onClick={() => bulkResendMutation.mutate()}`).
  2. Trong `apps/web/src/routes/_auth/notifications/index.test.tsx`:
     - Mock `sonner` (`vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }))`).
     - Bổ sung các test:
       - Dòng `failed` có nút `"Gửi lại thông báo cho ..."` cạnh nút eye; dòng `read`/`sent`/`queued` **không** có nút `"Gửi lại"`.
       - Bấm nút `"Gửi lại thông báo cho Minh Tran"` trên dòng `failed` → gửi `POST /api/notification-logs/nt-1/resend`, hiện toast `"Đã đưa 1 thông báo về hàng đợi để gửi lại."`, và refetch danh sách.
       - Nút header `"Gửi lại tất cả mục lỗi (4)"` hiện khi `counts.failed = 4` và ẩn khi `counts.failed = 0`.
       - Bấm `"Gửi lại tất cả mục lỗi (4)"` → mở dialog xác nhận `"Gửi lại tất cả thông báo lỗi?"` → bấm `"Xác nhận gửi lại"` → gửi `POST /api/notification-logs/resend-failed` kèm bộ lọc `q + event` hiện tại, hiện toast kèm thông tin `skipped` / `remaining` nếu có, đóng dialog và refetch danh sách.
       - Khi đang lọc `?status=failed` mà danh sách trả về `rows: [], total: 0` nhưng `counts.all > 0` → vẫn giữ thanh `ChipFilter` và hiện `"Không có thông báo nào phù hợp với bộ lọc."`.
- **Success criteria:** Toàn bộ unit test trong `index.test.tsx` và `notifications.test.ts` đều pass; `pnpm check` và `pnpm check-types` sạch lỗi.
- **Verify:** `pnpm --filter web test -- notification && pnpm check && pnpm check-types` exits `0`.

## Verification

- `pnpm --filter web test -- notification` exits `0`.
- `pnpm check && pnpm check-types` exits `0`.

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
