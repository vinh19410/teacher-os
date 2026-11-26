---
phase: 3
title: "Phase 3: Web Overwrite Confirmation UX & E2E"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Web Overwrite Confirmation UX & E2E

## Goal

Nối metadata lỗi xung đột (`conflictingDates`, `otherManualDates`, `manualSessionCount`, `overwriteHash`, `completedDates`) từ server qua tầng kernel repo vào `ImportSyllabusModal`, hiển thị thông báo chi tiết các buổi thủ công trùng ngày định dạng `Thứ ..., dd/mm/yyyy` với luồng xác nhận "Đồng ý ghi đè" tuân thủ `DESIGN.md`/`REVIEW.md` và an toàn trước mọi trạng thái race/RBAC/submitBlocked, đồng thời kiểm chứng bằng unit test, spec E2E lẻ và ảnh chụp 3 viewport Light/Dark cho POT.

## Files to Create / Modify

- Modify: `apps/web/src/lib/kernel-load-state.ts` (mở rộng `HttpErrorOptions` & `HttpError` với `conflictingDates`, `otherManualDates`, `manualSessionCount`, `overwriteHash`, `completedDates`)
- Modify: `apps/web/src/lib/data-actions.ts` (thêm `overwriteManualSessions?: boolean` và `overwriteHash?: string` vào action `import-curriculum`)
- Modify: `apps/web/src/lib/repos/kernel.ts` (bọc `encodeURIComponent(action.classId)` và truyền `overwriteManualSessions` + `overwriteHash` khi có trong `kernelCommand`; parse defensive các trường conflict trong `parseErrorOptions`)
- Modify: `apps/web/src/components/modals/import-syllabus-modal.tsx` (UX thông báo trùng ngày & bước xác nhận ghi đè, RBAC `canManageClassStatus`, format ngày `Thứ ..., dd/mm/yyyy`, khóa `templateId`/`submitBlocked`/`Enter`, toast sau `committed` reconcile)
- Modify: `apps/web/src/components/modals/import-syllabus-modal.test.tsx` (test unit đầy đủ cho luồng cảnh báo, xác nhận ghi đè, Race B cập nhật danh sách mới, hủy/đổi template, chặn buổi đã điểm danh, `ta` role, `submitBlocked`/Enter, fallback deploy skew)
- Modify: `apps/web/src/lib/repos/kernel.test.ts` (test serialization của `import-curriculum` với/không có overwrite fields + `encodeURIComponent`, và parse `HttpError` conflict fields)
- Modify: `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (thêm test E2E xác minh end-to-end luồng nhập giáo trình đè buổi thủ công trùng ngày + chụp screenshot POT 3 viewport Light/Dark)

## Tests Before (TDD)

1. Trong `apps/web/src/lib/repos/kernel.test.ts`:
   - `kernelCommand({ type: "import-curriculum", classId: "c1", templateId: "t1" })` giữ nguyên body `{ templateId: "t1" }` và encode `classId` đặc biệt (<!-- Red Team RT-11 -->).
   - `kernelCommand({ type: "import-curriculum", classId: "c1", templateId: "t1", overwriteManualSessions: true, overwriteHash: "h1" })` gửi body `{ templateId: "t1", overwriteManualSessions: true, overwriteHash: "h1" }` và pass `importSyllabusSchema` (`.strict()`).
   - `postKernelCommand` nhận 409 JSON kèm `conflictingDates`, `otherManualDates`, `manualSessionCount`, `overwriteHash` / `completedDates` → `HttpError` mang đúng các trường đó (và bỏ qua giá trị không đúng kiểu an toàn).
2. Trong `apps/web/src/components/modals/import-syllabus-modal.test.tsx`:
   - Khi server trả `409 MANUAL_SESSIONS_EXIST` kèm `conflictingDates: ["2026-11-10"]`, `otherManualDates: ["2026-11-11"]`, `manualSessionCount: 2`, `overwriteHash: "hash-1"`:
     - Modal hiển thị vùng thông báo cảnh báo liệt kê ngày trùng kèm năm (`Thứ Ba, 10/11/2026`) và nhắc rõ buổi thủ công khác ngày (`Thứ Tư, 11/11/2026`) cũng sẽ bị thay thế, nêu rõ link Zoom cùng ngày được giữ lại (<!-- Red Team RT-10 -->).
     - Hiện nút **"Quay lại"** và nút **"Đồng ý ghi đè"** (`variant="danger"`).
     - Bấm **"Đồng ý ghi đè"** gửi request thứ 2 tới `/api/classes/cl-1/curriculum/import` với body `{ templateId: "sy-a", overwriteManualSessions: true, overwriteHash: "hash-1" }`, phát toast thành công và đóng modal khi `refreshed`.
   - **Race B (<!-- Red Team RT-9 -->):** Khi bấm **"Đồng ý ghi đè"** mà server trả lại `409 MANUAL_SESSIONS_EXIST` với `overwriteHash: "hash-2"` và danh sách ngày mới (có thêm `2026-11-12`): modal cập nhật ngay khối cảnh báo sang danh sách ngày mới kèm lưu ý dữ liệu vừa thay đổi, lần bấm tiếp theo gửi `overwriteHash: "hash-2"`.
   - **Chặn phím Enter & khóa `submitBlocked` (<!-- Red Team RT-9 -->):** Khi đang ở bước xác nhận, submit form (Enter) không gửi lại request bước 1; khi `confirmOverwrite()` rơi vào `committed` (refresh 503), ẩn/khóa bước xác nhận cùng `<TemplatePicker>` và nút bấm theo `submitBlocked`, sau khi bấm reconcile thì đóng modal + phát toast thành công.
   - Bấm **"Quay lại"** hoặc đổi template trong `<select>` xóa trạng thái xác nhận ghi đè và quay về nút **"Nhập giáo trình"**. Nếu template đang xác nhận biến mất khỏi snapshot, bước xác nhận tự vô hiệu (`pendingOverwrite.templateId !== templateId`) để không bao giờ ghi đè nhầm template khác (<!-- Red Team RT-9 -->).
   - Khi server trả `409 MANUAL_SESSIONS_EXIST` chỉ có `otherManualDates` (`conflictingDates: []`, `manualSessionCount: 1`, `overwriteHash: "h-other"`): hiển thị thông báo thay thế các buổi thủ công hiện có và vẫn cho phép xác nhận ghi đè.
   - Khi server trả `409 MANUAL_SESSIONS_EXIST` **không kèm** `overwriteHash` / `manualSessionCount` (deploy skew server cũ): giữ hiển thị alert lỗi hướng dẫn xóa buổi thủ công trước, không hiện nút ghi đè.
   - Khi viewer có `role = "ta"` nhận `409 MANUAL_SESSIONS_EXIST` (<!-- Red Team RT-1 -->): hiển thị cảnh báo cho biết chỉ giáo viên phụ trách hoặc quản trị viên mới có quyền ghi đè buổi thủ công, không hiện nút **"Đồng ý ghi đè"**; nếu gặp `403 FORBIDDEN` hiển thị alert quyền rõ ràng.
   - Khi server trả `409 MANUAL_SESSIONS_COMPLETED` kèm `completedDates: ["2026-11-10"]`: hiển thị `role="alert"` nêu rõ buổi đã điểm danh/hoàn thành (`Thứ Ba, 10/11/2026`) không thể ghi đè, **không** hiển thị nút "Đồng ý ghi đè".
   - Khi server trả `422 CURRICULUM_INVALID_CLASS_SCHEDULE`, `422 CURRICULUM_HOLIDAY_SCAN_CAP`, hoặc `409 CLASS_STATE_CHANGED`: hiển thị `role="alert"` tiếng Việt rõ hành động tiếp theo.
   - Đóng rồi mở lại modal xóa cả `error` lẫn trạng thái xác nhận ghi đè, nhưng giữ nguyên `notice`/`submitBlocked`.

## Refactor / Implementation

1. `apps/web/src/lib/kernel-load-state.ts`:
   - Mở rộng `HttpErrorOptions` và `HttpError` với:
     - `conflictingDates?: string[]`
     - `otherManualDates?: string[]`
     - `manualSessionCount?: number`
     - `overwriteHash?: string`
     - `completedDates?: string[]`
2. `apps/web/src/lib/data-actions.ts` & `apps/web/src/lib/repos/kernel.ts` (<!-- Red Team RT-3, RT-11 -->):
   - Thêm `overwriteManualSessions?: boolean` và `overwriteHash?: string` vào action `import-curriculum`.
   - Trong `kernelCommand`: dùng `encodeURIComponent(action.classId)`; chỉ thêm `overwriteManualSessions: true` và `overwriteHash` khi `action.overwriteManualSessions === true` (giữ payload thường `{ templateId }` y hệt cũ).
   - Trong `parseErrorOptions`: parse defensive `conflictingDates`, `otherManualDates`, `completedDates` (string arrays), `manualSessionCount` (finite non-negative integer), và `overwriteHash` (non-empty string).
3. `apps/web/src/components/modals/import-syllabus-modal.tsx` (<!-- Red Team RT-1, RT-3, RT-9, RT-10 -->):
   - Helper an toàn `formatConflictDate(dateISO: string): string`: kiểm tra `^\d{4}-\d{2}-\d{2}$` + roundtrip UTC hợp lệ rồi format `"Thứ ..., dd/mm/yyyy"` (ghép thứ `vi-VN` UTC với `fmtDue(dateISO)`); chuỗi không hợp lệ fallback nguyên chuỗi (không bao giờ throw `RangeError`).
   - State `pendingOverwrite`: `{ templateId: string; conflictingDates: string[]; otherManualDates: string[]; manualSessionCount: number; overwriteHash: string; refreshedByRace?: boolean } | null`.
   - Derive `activeOverwrite = pendingOverwrite !== null && pendingOverwrite.templateId === templateId && !notice ? pendingOverwrite : null` — tự vô hiệu nếu snapshot đổi mất template đang chọn hoặc khi modal đang ở trạng thái `committed`/`outcome-unknown` (`notice !== undefined`).
   - Dùng `canManageClassStatus(data.viewer?.role ?? "teacher")` để biết người dùng hiện tại có quyền ghi đè hay không.
   - Dùng chung một hàm `handleImportResult(result, submittedTemplateId, isOverwriteAttempt)`:
     - `refreshed`: nếu `isOverwriteAttempt` → `toast.success("Đã ghi đè buổi thủ công và nhập giáo trình.")`; đóng modal.
     - `committed`: nếu `isOverwriteAttempt` → lưu message vào `committedToastRef.current`; xóa `pendingOverwrite` để hiển thị sạch `<KernelSubmitNotice>`.
     - `definite-failure` với `isHttpError`:
       - `MANUAL_SESSIONS_EXIST`: nếu có `overwriteHash` và `manualSessionCount !== undefined && manualSessionCount > 0`:
         - Nếu `canOverwrite`: set `pendingOverwrite` (kèm `refreshedByRace: isOverwriteAttempt`) và `setError(undefined)`.
         - Nếu `!canOverwrite` (vai trò `ta`): không set `pendingOverwrite`, hiển thị `setError("Lớp đã có buổi học thủ công. Chỉ giáo viên phụ trách hoặc quản trị viên mới có quyền ghi đè buổi thủ công bằng giáo trình.")`.
         - Ngược lại (deploy skew server cũ thiếu metadata): giữ `setError(importCurriculumErrorMessage("MANUAL_SESSIONS_EXIST"))`.
       - `MANUAL_SESSIONS_COMPLETED`: xóa `pendingOverwrite`, hiển thị lỗi kèm danh sách `completedDates` đã format (nếu có).
       - `FORBIDDEN`, `CURRICULUM_INVALID_CLASS_SCHEDULE`, `CURRICULUM_HOLIDAY_SCAN_CAP`, `CLASS_STATE_CHANGED`, và các mã lỗi cũ: xóa `pendingOverwrite`, map sang thông báo tiếng Việt rõ ràng.
   - Trong `submit(e)`: chặn sớm `if (saving || submitBlocked || activeOverwrite !== null) return;` để phím `Enter` không bao giờ bắn lại request bước 1 lúc đang ở bước xác nhận.
   - Trong `confirmOverwrite()`: gọi `run({ type: "import-curriculum", classId, templateId: activeOverwrite.templateId, overwriteManualSessions: true, overwriteHash: activeOverwrite.overwriteHash })` rồi đưa vào `handleImportResult(..., true)`.
   - UI bước xác nhận (`activeOverwrite !== null`):
     - Khối cảnh báo `role="alert"` dùng token `rounded-md border border-warn/50 bg-warn-soft p-3 text-sm` (`DESIGN.md` — tương phản chuẩn Light & Dark, không hard-code hex).
     - Nếu `refreshedByRace`: thêm 1 dòng lưu ý nhỏ `"Danh sách buổi học thủ công vừa thay đổi — vui lòng kiểm tra lại trước khi xác nhận."`.
     - Hiển thị tối đa 6 ngày trùng (`conflictingDates`) dạng `Thứ ..., dd/mm/yyyy` + `+N ngày khác` nếu nhiều hơn; tương tự với `otherManualDates` (tối đa 4 ngày + `+N ngày khác`) để không tràn chiều cao trên mobile 375×812.
     - Ghi chú hệ quả minh bạch: chủ đề, giờ học và tài liệu gắn riêng của buổi thủ công sẽ bị xóa để chuyển sang lịch giáo trình; link Zoom cùng ngày (nếu có) được giữ lại. Hành động này không thể hoàn tác.
     - Vô hiệu hóa `<TemplatePicker>` khi `saving || submitBlocked`.
     - Footer bước xác nhận: nút **"Quay lại"** (`variant="secondary"`, `disabled={saving || submitBlocked}`) và nút **"Đồng ý ghi đè"** (`variant="danger"`, `type="button"`, `disabled={saving || submitBlocked || templates.length === 0}`).
   - Bật `scrollableBody` trên `<Modal>` để đảm bảo trên màn hình nhỏ 375×812 các nút footer luôn nhìn thấy và bấm được.
4. E2E & Kiểm thử giao diện:
   - Thêm test case vào `apps/e2e/specs/syllabus-class-curriculum.spec.ts` kiểm tra: tạo lớp manual + thêm buổi thủ công trùng ngày khai giảng + 1 buổi ngày khác → vào tab Giáo trình → "Nhập từ template" → bấm "Nhập giáo trình" → thấy cảnh báo liệt kê đúng ngày trùng (`dd/mm/yyyy`) → bấm "Đồng ý ghi đè" → modal đóng, tab Buổi học chiếu đủ buổi theo giáo trình và chủ đề buổi thủ công cũ bị thay thế bởi bài giáo trình.
   - Chạy spec E2E lẻ `pnpm --filter e2e e2e syllabus-class-curriculum` với port override (`8100/8101/8103/8104/8105`), kiểm tra 3 viewport (1440×900, 768×1024, 375×812) Light/Dark và chụp screenshot POT lưu vào `plans/reports/`.

## Tests After

- `pnpm --filter @teacher-os/api test`
- `pnpm --filter server test`
- `pnpm --filter web test`
- `pnpm exec biome check .`
- `pnpm check-types`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e syllabus-class-curriculum`

## Todo

- [x] Viết trước unit test ở `apps/web/src/lib/repos/kernel.test.ts` và `apps/web/src/components/modals/import-syllabus-modal.test.tsx` (red)
- [x] Mở rộng `HttpError` (`kernel-load-state.ts`), `KernelAction` (`data-actions.ts`), và `kernel.ts`
- [x] Cập nhật `ImportSyllabusModal` theo `DESIGN.md` & `REVIEW.md` (green)
- [x] Thêm kịch bản E2E trong `apps/e2e/specs/syllabus-class-curriculum.spec.ts` và chạy spec E2E lẻ
- [x] Chụp screenshot POT 3 viewport Light/Dark và kiểm tra chất lượng hiển thị (không tràn ngang, tương phản rõ, keyboard focus)

## Regression Gate & Verification

```bash
pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test && pnpm exec biome check . && pnpm check-types
```

## Risk & Rollback

- **Risk 1 (Deploy skew):** Web mới chạy trên server cũ sẽ nhận 409 `MANUAL_SESSIONS_EXIST` không có `overwriteHash`/`manualSessionCount`.
  - **Mitigation:** Chỉ mở bước xác nhận ghi đè khi server trả đủ `overwriteHash` và `manualSessionCount > 0`; nếu thiếu thì giữ nguyên alert hướng dẫn xóa tay.
- **Risk 2 (Modal chiều cao trên mobile 375×812):** Danh sách nhiều ngày trùng có thể đẩy nút bấm khỏi màn hình nhỏ.
  - **Mitigation:** Giới hạn hiển thị tối đa 6 ngày trùng / 4 ngày khác + `+N ngày khác` kết hợp `scrollableBody` trên `Modal`, kiểm chứng trực tiếp trên 375×812 Light/Dark.
- **Rollback:** Revert các file web/test đã sửa.
