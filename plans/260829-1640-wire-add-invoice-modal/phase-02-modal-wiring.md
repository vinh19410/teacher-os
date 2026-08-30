---
phase: 2
title: "Wire AddInvoiceModal + validation + contract tests"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Wire AddInvoiceModal + validation + contract tests

## Overview

Rewrite `AddInvoiceModal` từ no-op thành kernel write modal đúng chuẩn repo: `useKernelFormSubmit` + `KernelSubmitNotice`, picker enrollment, validation inline tiếng Việt, xóa fake chrome. Cập nhật contract test đang chặn modal write.

## Requirements

- Functional: submit gọi dispatch `add-invoice`; chỉ đóng modal khi `result.kind === "refreshed"`; lỗi field hiển thị đỏ dưới input (`Field error` prop); form-level error qua `setError`.
- Non-functional: không gọi `fetch` trực tiếp trong modal; double-click được chặn bởi `saving` + bus; label tiếng Việt hardcode (không i18n).

## Related Code Files

- Modify: `apps/web/src/components/modals/add-invoice-modal.tsx` (rewrite)
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (thay test close-only, thêm modal vào `KERNEL_WRITE_MODALS`, sửa expected keys `emptyKernelData`)
- Modify: `apps/web/src/lib/date-input.ts` (export helper mới `isRealDateInputValue` — roundtrip check của `parseDateInput` private hiện có)
- Reuse: `apps/web/src/components/ui/field.tsx` (Field/Input/Select/Textarea), `components/modals/kernel-submit-notice.tsx`, `lib/use-kernel-form-submit.ts`

## Implementation Steps (TDD — contract test trước)

1. **Test trước — flip contract test:** trong `kernel-runtime.contract.test.ts`:
   - Thêm `"add-invoice-modal.tsx"` vào `KERNEL_WRITE_MODALS` (kế thừa các assert dùng chung).
   - Xóa test `"AddInvoiceModal remains close-only..."` (~366-374), thay bằng test mới assert: source modal match `useKernelFormSubmit`, dispatch/kind `"add-invoice"`, match `KernelSubmitNotice`, KHÔNG match trực tiếp `/fetch\(/` (transport phải qua bus); cộng thêm assert reset-on-open (mirror test "grade-modal resets scores and error on every open" ~435-442) và assert `onReconcile` đi qua handler reconcile-and-finish (reconcile thành công → resetFields + onClose).
   - Cập nhật expected keys của `emptyKernelData` (~485-497) thêm `"enrollments"`.
2. **Modal rewrite** (pattern `add-student-modal.tsx` — lifecycle spec đầy đủ):
   - State: `enrollmentId` (default `data.enrollments[0]?.id ?? ""`), `amount` (string), `due` (string, prefill `formatDateInputValue(new Date())`), `note` (string), field errors `enrollmentError/amountError/dueError/noteError`.
   - **Reset-on-open (bắt buộc):** `useEffect` khi `open` chuyển true → reset toàn bộ field values (recompute enrollmentId từ `data.enrollments[0]?.id`, due prefill lại hôm nay), clear field errors, gọi `reset()` của hook (clear notice/error) — mirror `add-student-modal.tsx:56-64`. Modal host mount thường trực nên initializer `useState` chỉ chạy 1 lần.
   - **Saving gate (bắt buộc):** `<Modal ... onClose={saving ? () => undefined : onClose}>` — chặn Escape/overlay/X khi POST đang bay (POST non-idempotent, đóng giữa chừng = mồi duplicate); nút submit `disabled={saving || submitBlocked}`.
   - **Submit shape (assert chung đòi):** `async function submit` + `const result = await run({ type: "add-invoice", ... })`; `result?.kind === "refreshed"` → `resetFields(); onClose()`.
   - **Reconcile-and-finish (bắt buộc):** `async function reconcileAndFinish() { if (await reconcile()) { resetFields(); onClose(); } }` — pass `onReconcile={reconcileAndFinish}` vào `<KernelSubmitNotice>` (bare `reconcile` sẽ để modal mở sau khi reconcile thành công → user resubmit tạo trùng).
   - Picker: Select "Học viên" — mỗi option label `` `${studentName} · ${className}` `` (join qua `Map` từ `data.students`/`data.classes`); khi `data.enrollments` rỗng → help text "Chưa có học viên nào đang theo lớp." và không submit được.
   - Validation submit: enrollmentId rỗng → "Vui lòng chọn học viên."; amount trim rỗng → "Vui lòng nhập số tiền."; `!/^\d{1,12}$/` hoặc `Number(amount) < 1` → "Số tiền phải là số nguyên dương." (cap 12 chữ số chặn integer overflow SQLite → 500 → outcome-unknown sai sự thật); due không qua được `isRealDateInputValue` → "Vui lòng chọn ngày đến hạn hợp lệ." (due = hôm nay HỢP LỆ); `note.trim().length > 500` → "Ghi chú tối đa 500 ký tự.". Mọi lỗi set field error, KHÔNG gọi dispatch.
   - Xóa hẳn Select "Loại" và Select "Phương thức" (fake chrome — contract `.strict()` không nhận).
   - Helper mới trong `date-input.ts`: `export function isRealDateInputValue(value: string): boolean` — re-export logic roundtrip của `parseDateInput` (parse xong format lại phải khớp chuỗi gốc); KHÔNG dùng `isFutureDateInputValue`.
3. Chạy `pnpm vitest run kernel-runtime.contract.test.ts` → xanh toàn bộ.
4. `pnpm check` (biome --write) + `pnpm check-types` toàn workspace.

## Success Criteria

- [x] Contract test mới xanh (modal là write modal đúng chuẩn).
- [x] Không còn `function submit` no-op trong modal; không còn fields Loại/Phương thức.
- [x] `pnpm check-types` + `pnpm test` web xanh.

## Risk Assessment

- **Assert dùng chung của `KERNEL_WRITE_MODALS`** — 4 pattern cứng đã được liệt kê tường minh trong step 2 (`async function submit`, `const result = await run(`, `onClose={saving ? () => undefined : onClose}`, `disabled={saving || submitBlocked` — kernel-runtime.contract.test.ts:105-115, :131-134); nếu vẫn còn assert khác đỏ, điều chỉnh modal theo pattern của các write modal khác, không nới lỏng assert.
- **Server errors không map field** — enrollment lạ/đã xóa → 404; due roundtrip fail → 400; cả hai rơi vào form-level error chung của hook — hành vi chấp nhận được, không xử lý thêm.
