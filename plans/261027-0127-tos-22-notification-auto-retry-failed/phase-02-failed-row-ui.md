---
phase: 2
title: "Nhãn Lỗi gửi + thông điệp E-010 trên màn Nhật ký thông báo [5]"
status: completed
priority: P0
effort: "2h"
dependencies: [1]
---

# Phase 2: UI dòng `failed` trên màn Nhật ký thông báo `[5]`

<!-- Updated: Validation & Red Team Session 1 - Handover decomposition + notification-detail-dialog.tsx + index.test.tsx -->

## Goal

Hiển thị dòng phụ thông báo lỗi màu đỏ (`text-destructive`) dưới thông tin người nhận cho các bản ghi `status === "failed"` theo định dạng `E-010: <nguyên nhân rút gọn> sau <retryCount> lần thử`, và hiển thị `"N/3 lần thử"` trong hộp thoại chi tiết `NotificationDetailDialog` đúng chuẩn `DESIGN.md`.

## Files to Create or Modify

- Create: `apps/web/src/lib/notification-error.ts`
- Create: `apps/web/src/lib/notification-error.test.ts`
- Modify: `apps/web/src/routes/_auth/notifications/index.tsx`
- Modify: `apps/web/src/components/notifications/notification-detail-dialog.tsx`
- Modify: `apps/web/src/routes/_auth/notifications/index.test.tsx`

## Tasks & Steps

### Task 2.1 — Tạo helper `formatDeliveryError` và unit test (TDD)
- **Goal:** Có hàm thuần `formatDeliveryError(lastError: string | null, retryCount: number)` định dạng thông điệp lỗi `E-010` ngắn gọn (cắt ~80 ký tự) và bản đầy đủ cho `title` tooltip.
- **Target files and symbols:**
  - `apps/web/src/lib/notification-error.ts` (`formatDeliveryError`)
  - `apps/web/src/lib/notification-error.test.ts`
- **Steps:**
  1. Tạo `apps/web/src/lib/notification-error.test.ts` kiểm tra các trường hợp:
     - `lastError` có tiền tố `"E-selfomy-alignment-010: mailbox unavailable"`, `retryCount = 3` → `shortText: "E-010: mailbox unavailable sau 3 lần thử"`, `fullText: "E-selfomy-alignment-010: mailbox unavailable"`.
     - `lastError` không có tiền tố (`"SMTP timeout"`), `retryCount = 2` → `shortText: "E-010: SMTP timeout sau 2 lần thử"`, `fullText: "SMTP timeout"`.
     - `lastError` là `null`, `""`, hoặc chỉ chứa `"E-selfomy-alignment-010:   "` → fallback nguyên nhân `"Không gửi được email"`, `shortText: "E-010: Không gửi được email sau 3 lần thử"`.
     - `lastError` có phần nguyên nhân dài hơn 80 ký tự → phần nguyên nhân trong `shortText` được cắt còn 80 ký tự kèm `"…"` ở cuối, trong khi `fullText` giữ nguyên toàn bộ chuỗi.
  2. Tạo `apps/web/src/lib/notification-error.ts` dùng `NOTIFICATION_ERROR_CODES` từ `@teacher-os/api/contracts` để pass toàn bộ test trên.
- **Success criteria:** `notification-error.test.ts` pass toàn bộ các ca kiểm thử biên.
- **Verify:** `pnpm --filter web test -- notification-error` exits `0`.

### Task 2.2 — Cập nhật bảng `/notifications` và `NotificationDetailDialog` kèm unit test
- **Goal:** Render dòng phụ `E-010: ... sau N lần thử` trong ô "Người nhận" khi `row.status === "failed"`, cập nhật trường `"Số lần thử lại"` trong `NotificationDetailDialog` thành `"N/3 lần thử"`, và bổ sung test vào `index.test.tsx`.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/notifications/index.tsx` (`NotificationsRoute`, ô `key="recipient"`)
  - `apps/web/src/components/notifications/notification-detail-dialog.tsx` (`NotificationDetailDialog`)
  - `apps/web/src/routes/_auth/notifications/index.test.tsx` (`NotificationsRoute (#454 phase 5)`)
- **Steps:**
  1. Trong `apps/web/src/routes/_auth/notifications/index.tsx`:
     - Import `formatDeliveryError` từ `@/lib/notification-error`.
     - Trong ô `key="recipient"` (dòng ~371), khi `row.status === "failed"`: gọi `const err = formatDeliveryError(row.lastError, row.retryCount);` và render:
       ```tsx
       <p
         className="mt-0.5 max-w-[260px] break-words text-destructive text-xs"
         title={err.fullText}
       >
         {err.shortText}
       </p>
       ```
  2. Trong `apps/web/src/components/notifications/notification-detail-dialog.tsx`:
     - Import `MAX_EMAIL_ATTEMPTS` từ `@teacher-os/api/contracts`.
     - Tại dòng ~79 (`<Field label="Số lần thử lại">`), đổi giá trị từ `{String(row.retryCount)}` sang `{`${row.retryCount}/${MAX_EMAIL_ATTEMPTS} lần thử`}` (ví dụ `"3/3 lần thử"`). Giữ nguyên nhãn `"Số lần thử lại"` và `"Lỗi gửi"`.
  3. Trong `apps/web/src/routes/_auth/notifications/index.test.tsx`:
     - Cập nhật / bổ sung test cho dòng `status: "failed"` (`retryCount: 3`, `lastError: "E-selfomy-alignment-010: mailbox unavailable"`): kiểm tra bảng hiển thị nhãn `"Lỗi gửi"` và dòng phụ `"E-010: mailbox unavailable sau 3 lần thử"`, và khi bấm nút eye mở dialog thì thấy `"3/3 lần thử"` cùng `"E-selfomy-alignment-010: mailbox unavailable"`.
- **Success criteria:** Unit test của trang `/notifications` và helper đều xanh; lint/typecheck sạch.
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
