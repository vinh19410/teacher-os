---
phase: 2
title: "Phase 2: DatePickerInput, TimeInput24h & đồng bộ hạn nộp Web/Student"
status: done
priority: P1
effort: "1.75h"
dependencies: [1]
---

# Phase 2: DatePickerInput, TimeInput24h & đồng bộ hạn nộp Web/Student

<!-- Updated: Red Team RT-1, RT-2, RT-3, RT-5, RT-6, RT-7, RT-9 -->

## Goal

Xây dựng bộ đôi `DatePickerInput` (`dd/mm/yyyy` không nhảy con trỏ + popover lịch tháng `T2..CN`) và `TimeInput24h` (`HH:mm` 24 giờ + chip chọn nhanh) trong `@teacher-os/ui`, nối luồng `dueAt` / `dueTime` qua store & helper trạng thái của `apps/web` và `apps/student` với `nowMs` đồng nhất trên từng lượt render, và nâng cấp form giao bài `ClassAssignmentsTab` kèm dòng xác nhận tiếng Việt theo quy trình TDD.

## Files to Create / Modify

- Create:
  - `packages/ui/src/components/date-picker-input.tsx`
  - `packages/ui/src/components/date-picker-input.test.tsx`
  - `apps/web/src/components/ui/date-picker-input.tsx`
- Modify:
  - `apps/web/src/lib/mock-data.ts`
  - `apps/web/src/lib/repos/class-assignments.ts`
  - `apps/web/src/lib/repos/class-assignments.test.ts`
  - `apps/web/src/lib/repos/student-assignments.ts`
  - `apps/web/src/lib/repos/student-assignments.test.ts`
  - `apps/web/src/lib/data-actions.ts`
  - `apps/web/src/lib/repos/kernel.ts`
  - `apps/web/src/components/assignments/assignment-status.ts`
  - `apps/web/src/components/assignments/assignment-status.test.ts`
  - `apps/web/src/routes/_auth/students/$studentId.tsx`
  - `apps/web/src/components/classes/class-assignments-tab.tsx`
  - `apps/web/src/components/classes/class-assignments-tab.test.tsx`
  - `apps/student/src/lib/assignment-status.ts`
  - `apps/student/src/routes/_auth/index.tsx`
  - `apps/student/src/components/overview/assignment-list.tsx`
  - `apps/student/src/components/overview/assignment-row.tsx`
  - `apps/student/src/components/overview/class-card.tsx`
  - `apps/student/src/components/class/class-detail-view.tsx`
  - `apps/student/src/components/class/class-assignment-table.tsx`
  - `apps/student/test/assignment-status.test.ts`
  - `apps/student/test/class-detail.test.tsx`

## Tasks & Steps

### Task 2.1 — Viết test TDD (Red) cho `DatePickerInput` và `TimeInput24h` trong `@teacher-os/ui`
- **Goal:** Tạo bộ unit test kiểm chứng hành vi gõ ngày không nhảy con trỏ (`06/11/2026`, `6/11/2026`, `09112026`), xóa trắng ô phát `onChange("")`, báo `onInvalidChange(true)` ngay khi gõ dở/sai (`06/11`, `31/02/2026`), mở/chọn/đóng lịch tháng (`@base-ui/react/popover` `modal={true}`, `z-[110]`, đồng bộ tháng theo năm đang gõ, chặn nổi bọt `Escape`, `focus-visible:shadow-[var(--focus-ring)]`, không lồng `<form>`), và nhập giờ 24h (`HH:mm` + nhóm chip chọn nhanh `role="group"`).
- **Target files and symbols:**
  - `packages/ui/src/components/date-picker-input.test.tsx` (tạo mới)
- **Steps:** <!-- Updated: Red Team RT-1, RT-2, RT-7 -->
  1. Tạo `packages/ui/src/components/date-picker-input.test.tsx` dùng `@testing-library/react` và `vitest` (stub `globalThis.ResizeObserver` nếu chưa có trong `jsdom` và gọi `afterEach(cleanup)`).
  2. Viết các test cho `DatePickerInput`:
     - Hiển thị giá trị ban đầu `value="2026-11-06"` thành `"06/11/2026"` trên `<input type="text">` (`input.type === "text"`, `input.inputMode === "numeric"`, có `border-input`, chuyển tiếp `id`, `data-testid` và `ref`).
     - Chống nhảy con trỏ & chống dội ngược prop: trong một wrapper stateful giữ `const [val, setVal] = useState("2026-11-01")`, khi focus vào input và gõ `"6/11/2027"` hoặc `"09112027"`, `onChange` phát ngay `"2027-11-06"` / `"2027-11-09"` nhưng `input.value` khi đang focus vẫn giữ nguyên `"6/11/2027"` / `"09112027"` (không tự biến thành `"06/11/2027"` giữa lúc gõ!), và chỉ chuẩn hóa thành `"06/11/2027"` / `"09/11/2027"` khi `blur`.
     - Xóa trắng ô (`fireEvent.change(input, { target: { value: "" } })` rồi `blur`): gọi `onChange("")`, `onInvalidChange(false)`, và giữ nguyên `input.value === ""` (không hồi sinh ngày cũ).
     - Gõ chuỗi dở dang `"06/11"` hoặc ngày sai `"31/02/2026"` ngay khi đang focus gọi `onInvalidChange(true)` ngay lập tức (để parent ẩn dòng `"Đã hiểu:"`), và khi `blur` bật `aria-invalid="true"`.
     - Sau khi gõ `"09112027"`, bấm nút `aria-label="Chọn ngày"` mở popover ngay tại `"Tháng 11, 2027"` (đồng bộ `viewYm`), có 7 cột `"T2"`..`"CN"`, nút `aria-label="Đóng lịch"`, khóa các ngày `< minDateISO`, `Popover.Positioner` có class `z-[110]`, không chứa `<form>`, mọi nút đều có `focus-visible:shadow-[var(--focus-ring)]`, và nhấn `Escape` trên popup gọi `stopPropagation()` (không rò rỉ `Escape` lên listener ngoài).
  3. Viết các test cho `TimeInput24h`:
     - Trong wrapper stateful, khi focus và gõ `"9:05"`, `onChange("09:05")` và `onInvalidChange(false)` được gọi ngay (giữ `"9:05"` khi đang focus, chuẩn hóa `"09:05"` khi `blur`); xóa trắng gọi `onChange("")`; gõ `"25:00"` gọi `onInvalidChange(true)` và `aria-invalid="true"`.
     - Nhóm chip chọn nhanh bọc trong `role="group"` với `aria-label="Mốc giờ gợi ý"`, mỗi nút có `aria-pressed` và `focus-visible:shadow-[var(--focus-ring)]`; khi truyền `minTimeHHMM="17:00"`, chip `"17:00"` bị ẩn (`preset <= minTimeHHMM`), trong khi chip `"21:00"` và `"23:59"` vẫn hiển thị (`"23:59"` luôn hiển thị ngay cả khi `minTimeHHMM="23:59"`).
- **Success criteria:** File test mới chạy và báo lỗi vì `packages/ui/src/components/date-picker-input.tsx` chưa tồn tại.
- **Verify:** `pnpm --filter @teacher-os/ui test` exits non-zero with module-not-found/assertion failure; passing test is a failure.

### Task 2.2 — Cài đặt `DatePickerInput` và `TimeInput24h` trong `@teacher-os/ui` + re-export ở `apps/web` (Green)
- **Goal:** Xây dựng component `DatePickerInput` và `TimeInput24h` tuân thủ chặt chẽ `DESIGN.md`, `REVIEW.md` và toàn bộ ràng buộc state machine RT-1/RT-2/RT-7.
- **Target files and symbols:**
  - `packages/ui/src/components/date-picker-input.tsx` (tạo mới: `DatePickerInput`, `TimeInput24h`)
  - `apps/web/src/components/ui/date-picker-input.tsx` (tạo mới: re-export)
- **Steps:** <!-- Updated: Red Team RT-1, RT-2, RT-7 -->
  1. Tạo `packages/ui/src/components/date-picker-input.tsx`:
     - Import `{ Popover } from "@base-ui/react/popover"`, `{ Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react"`, `{ addDaysISO, addMonthsISO, formatViDateDisplay, mondayOfISO, parseTimeHHMM, parseViDateInput, vietnamTodayISO } from "@teacher-os/api/vietnam-date"`, `inputCls` từ `./web-kit/field`, và `cn` từ `@teacher-os/ui/lib/utils`.
     - Cài đặt `DatePickerInput`:
       - Giữ `isFocused`, `draftText`, `internalInvalid`, và `lastEmittedIsoRef = useRef<string>(value)`.
       - Đồng bộ khi `value` prop thay đổi từ bên ngoài (`value !== lastEmittedIsoRef.current`): cập nhật `lastEmittedIsoRef.current = value`, `setDraftText(value ? formatViDateDisplay(value) : "")`, `setInternalInvalid(false)`.
       - Trong `handleInputChange`: cập nhật `setDraftText(nextRaw)`. Nếu `nextRaw.trim() === ""` → `setInternalInvalid(false)`, `onInvalidChange?.(false)`, `lastEmittedIsoRef.current = ""`, `onChange("")`. Ngược lại gọi `parsed = parseViDateInput(nextRaw)`: nếu `parsed !== null` → `setInternalInvalid(false)`, `onInvalidChange?.(false)`, `lastEmittedIsoRef.current = parsed`, `onChange(parsed)` (giữ nguyên `draftText` khi đang focus); nếu `parsed === null` → `setInternalInvalid(true)`, `onInvalidChange?.(true)`.
       - Trong `handleBlur` (và khi nhấn `Enter` trên input — gọi `e.preventDefault()` nếu `internalInvalid` để chặn submit nhầm): đặt `setIsFocused(false)`; nếu `draftText.trim() === ""` → giữ `draftText = ""`; nếu `parseViDateInput(draftText)` trả về `iso` → chuẩn hóa `setDraftText(formatViDateDisplay(iso))`, `setInternalInvalid(false)`, `onInvalidChange?.(false)`; ngược lại → `setInternalInvalid(true)`, `onInvalidChange?.(true)`.
       - Cấu hình `<Popover.Root open={open} onOpenChange={handleOpenChange} modal={true}>`: khi `nextOpen === true`, đồng bộ `setViewYm((value || minDateISO || todayISO).slice(0, 7))`.
       - Nút `<Popover.Trigger type="button" aria-label="Chọn ngày">` đặt bên phải ô nhập (`pr-9`), có `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`.
       - Trong `<Popover.Portal><Popover.Positioner align="start" sideOffset={6} className="z-[110]"><Popover.Popup onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }} ...>` (không chứa `<form>`): vẽ thanh tiêu đề `"Tháng M, YYYY"`, nút `"Tháng trước"`, `"Tháng sau"`, `<Popover.Close aria-label="Đóng lịch">`, hàng thứ `["T2", "T3", "T4", "T5", "T6", "T7", "CN"]`, và lưới 42 ngày bắt đầu từ `mondayOfISO(\`${viewYm}-01\`)` (mọi button đều có `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`). Chọn ngày hợp lệ sẽ gán `lastEmittedIsoRef.current = dayIso`, `setDraftText(formatViDateDisplay(dayIso))`, `setInternalInvalid(false)`, `onInvalidChange?.(false)`, `onChange(dayIso)` và `setOpen(false)`.
     - Cài đặt `TimeInput24h`:
       - Dùng `<input type="text" inputMode="numeric" autoComplete="off" placeholder="HH:mm">` với `inputCls` + `tabular-nums`, cùng cơ chế `lastEmittedTimeRef` + `draftText`: xóa trắng gọi `onChange("")` & `onInvalidChange?.(false)`; gõ hợp lệ `parseTimeHHMM(nextRaw)` (kể cả `"9:05"`) gọi `onInvalidChange?.(false)` & `onChange(parsed)` ngay mà không đổi `draftText` cho tới khi `blur` chuẩn hóa thành `"09:05"`; gõ chưa hợp lệ gọi `onInvalidChange?.(true)` ngay.
       - Render nhóm chip gợi ý `<div role="group" aria-label="Mốc giờ gợi ý" className="flex flex-wrap gap-1">` cho `presets` (mặc định `["17:00", "21:00", "23:59"]`), lọc bỏ các chip có `minTimeHHMM !== undefined && preset !== "23:59" && preset <= minTimeHHMM`; mỗi nút có `type="button"`, `aria-pressed={value === preset && !internalInvalid}`, và `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`.
  2. Tạo `apps/web/src/components/ui/date-picker-input.tsx` với nội dung `export * from "@teacher-os/ui/components/date-picker-input";`.
- **Success criteria:** Toàn bộ unit test và typecheck của `@teacher-os/ui` pass.
- **Verify:** `pnpm --filter @teacher-os/ui test && pnpm --filter @teacher-os/ui check-types` exits `0`.

### Task 2.3 — Viết test TDD (Red) cho trạng thái hạn nộp theo giờ VN trên `apps/web` & `apps/student` và giao diện `ClassAssignmentsTab`
- **Goal:** Bổ sung unit test ở `class-assignments.test.ts`, `assignment-status.test.ts`, `student-assignments.test.ts`, `class-assignments-tab.test.tsx` (`apps/web`) và `assignment-status.test.ts`, `class-detail.test.tsx` (`apps/student`) trước khi sửa code ứng dụng.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/class-assignments.test.ts`
  - `apps/web/src/components/assignments/assignment-status.test.ts`
  - `apps/web/src/lib/repos/student-assignments.test.ts`
  - `apps/web/src/components/classes/class-assignments-tab.test.tsx`
  - `apps/student/test/assignment-status.test.ts`
  - `apps/student/test/class-detail.test.tsx`
- **Steps:** <!-- Updated: Red Team RT-2, RT-3, RT-5, RT-6, RT-9 -->
  1. Trong `apps/web/src/lib/repos/class-assignments.test.ts`:
     - Cập nhật `.toEqual([...])` hiện hữu thêm `dueAt: null`, và bổ sung test khẳng định khi `snapshot.classAssignments` có `dueAt: "2026-09-25T10:30:00.000Z"` thì `mapClassAssignments` giữ nguyên `dueAt`.
  2. Trong `apps/web/src/components/assignments/assignment-status.test.ts`:
     - Import thêm `fmtDueDisplay` từ `./assignment-status`.
     - Thêm test cho `fmtDueDisplay(due, dueAt)`: khi `dueAt` là `"2026-11-06T10:30:00.000Z"` (`17:30` giờ VN ngày `06/11/2026`), trả `"17:30 06/11/2026"` ngay cả khi tham số `due` lệch (`"2027-01-01"`, chứng minh ngày lấy từ `dueAt` — RT-6); khi `dueAt` là `null`/`undefined` trả `"06/11/2026"`.
     - Thêm test biên mili-giây cho `rollupStatus` và `studentSubmissionStatus` với `dueAt = "2026-11-06T10:00:00.000Z"` (`dueAtMs = Date.parse(dueAt)`): chưa nộp lúc `dueAtMs - 1` → `"Đang mở"` / `"Chưa nộp"`, lúc `dueAtMs` → `"Quá hạn"` / `"Chưa nộp · quá hạn"`; đã nộp lúc `dueAtMs` → `"Đã nộp"`, lúc `dueAtMs + 1` → `"Đã nộp · trễ hạn"`.
  3. Trong `apps/web/src/lib/repos/student-assignments.test.ts`:
     - Thêm test khẳng định `studentAssignmentRows` giữ trường `dueAt` và khi cùng ngày `due = "2026-11-06"`, dòng có `dueAt` lúc `09:00` VN xếp trước dòng `17:00` VN (dù viết ở dạng `+07:00` hay `Z`), và cả hai xếp trước dòng legacy `dueAt: null` (`+Infinity` — RT-9).
  4. Trong `apps/web/src/components/classes/class-assignments-tab.test.tsx`:
     - Thêm dòng đầu tiên `// @vitest-environment jsdom`, stub `ResizeObserver` nếu thiếu, và đăng ký `afterEach(cleanup)` từ `@testing-library/react` (RT-3).
     - Thêm test render `<ClassAssignmentsTab ... view="assign" />`: khẳng định `#assignment-due-input` có `type="text"`, `#assignment-due-time-input` mặc định `"23:59"`, có `data-testid="assignment-due-preview"`, và danh sách `view="list"` hiển thị `"HH:mm dd/mm/yyyy"` khi `dueAt` khác null.
     - Thêm test tương tác `render` + `fireEvent` trên `view="assign"`: gõ `"06/11/2030"` và `"9:05"` → dòng xác nhận cập nhật ngay `"Đã hiểu: Thứ Tư, 06/11/2030 lúc 09:05 (giờ Việt Nam)"`; khi gõ dở `"31/02/2030"`, dòng `"Đã hiểu:"` biến mất ngay và hiện thông báo lỗi ngày không hợp lệ mà không cần bấm submit; khi chọn ngày hôm nay kèm giờ đã qua, thông báo lỗi giờ quá khứ hiển thị ngay lập tức.
  5. Trong `apps/student/test/assignment-status.test.ts` (giữ thuần `.ts`) và `apps/student/test/class-detail.test.tsx` (đã có `// @vitest-environment jsdom`):
     - Trong `apps/student/test/assignment-status.test.ts`: thêm test khẳng định dòng legacy `dueAt: null` nộp sau ngày `due` vẫn giữ `isLate: false` (`"Đã nộp"` / `"Điểm: ..."` không bị đổi thành `"Nộp trễ"` — RT-5), và khi `dueAt` hợp lệ thì ngày hiển thị lấy từ `dueAt` theo giờ VN (RT-6).
     - Trong `apps/student/test/class-detail.test.tsx`: thêm test render `<ClassAssignmentTable assignments={[...]} todayISO="2026-11-06" nowMs={Date.parse("2026-11-06T18:00:00+07:00")} />` với bài tập có `dueAt = "2026-11-06T17:00:00+07:00"` → hiển thị `"Quá hạn"`, còn với `nowMs={Date.parse("2026-11-06T16:00:00+07:00")}` → hiển thị `"Sắp đến hạn"`.
- **Success criteria:** Các bài test mới ở cả `web` và `student` chạy và fail đúng ở các assertion chức năng mới (không lỗi thiếu `document` hay JSX trong `.ts`).
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/class-assignments.test.ts src/components/assignments/assignment-status.test.ts src/lib/repos/student-assignments.test.ts src/components/classes/class-assignments-tab.test.tsx && pnpm --filter student exec vitest run test/assignment-status.test.ts test/class-detail.test.tsx` exits non-zero with assertion/import failure; passing test is a failure.

### Task 2.4 — Nối luồng `dueAt` / `dueTime` và nâng cấp `ClassAssignmentsTab` + `apps/student` (Green)
- **Goal:** Cài đặt đầy đủ luồng dữ liệu `dueAt`/`dueTime`, dùng chung `evaluateAssignmentDeadline`, truyền `nowMs` đồng nhất trên cả `apps/web` lẫn `apps/student`, và tích hợp `DatePickerInput` + `TimeInput24h` + xử lý lỗi trên `ClassAssignmentsTab`.
- **Target files and symbols:**
  - `apps/web/src/lib/mock-data.ts` (`ClassAssignment`)
  - `apps/web/src/lib/repos/class-assignments.ts` (`mapClassAssignments`)
  - `apps/web/src/lib/repos/student-assignments.ts` (`StudentAssignmentRow`, `studentAssignmentRows`)
  - `apps/web/src/lib/data-actions.ts` (`assign-class-prompt`)
  - `apps/web/src/lib/repos/kernel.ts` (`assign-class-prompt` body)
  - `apps/web/src/components/assignments/assignment-status.ts` (`fmtDueDisplay`, `rollupStatus`, `studentSubmissionStatus`)
  - `apps/web/src/routes/_auth/students/$studentId.tsx` (`assignmentRowCells`, `StudentDetailRoute`)
  - `apps/web/src/components/classes/class-assignments-tab.tsx` (`ClassAssignmentsTab`)
  - `apps/student/src/lib/assignment-status.ts` (`deriveAssignmentStatus`)
  - `apps/student/src/routes/_auth/index.tsx` (`StudentOverviewPage`)
  - `apps/student/src/components/overview/assignment-list.tsx` (`AssignmentList`)
  - `apps/student/src/components/overview/assignment-row.tsx` (`AssignmentRow`)
  - `apps/student/src/components/overview/class-card.tsx` (`ClassCard`)
  - `apps/student/src/components/class/class-detail-view.tsx` (`TodoBanner`, `ClassDetailView`)
  - `apps/student/src/components/class/class-assignment-table.tsx` (`ClassAssignmentTable`)
- **Steps:** <!-- Updated: Red Team RT-1, RT-2, RT-5, RT-6, RT-7, RT-9 -->
  1. Cập nhật tầng dữ liệu của `apps/web`:
     - `apps/web/src/lib/mock-data.ts`: thêm `dueAt?: string | null;` vào `ClassAssignment`.
     - `apps/web/src/lib/repos/class-assignments.ts`: map `dueAt: row.dueAt ?? null` trong `mapClassAssignments`.
     - `apps/web/src/lib/repos/student-assignments.ts`: thêm `dueAt: string | null;` vào `StudentAssignmentRow` (`ca.dueAt ?? null` cho `class` row, `null` cho `grading` row); khi sort hai dòng có cùng `dx === dy`, tính `tx = x.dueAt ? Date.parse(x.dueAt) : Number.POSITIVE_INFINITY` (nếu `Number.isNaN(tx)` gán `Number.POSITIVE_INFINITY`) và tương tự cho `ty`, so sánh `tx - ty` trước khi tie-break bằng `key`.
     - `apps/web/src/lib/data-actions.ts`: thêm `dueTime?: string;` vào payload của `assign-class-prompt`.
     - `apps/web/src/lib/repos/kernel.ts`: đính kèm `...(action.payload.dueTime ? { dueTime: action.payload.dueTime } : {})` vào body của `POST /api/classes/${action.payload.classId}/assignments`.
  2. Cập nhật `apps/web/src/components/assignments/assignment-status.ts` và `apps/web/src/routes/_auth/students/$studentId.tsx`:
     - Thêm `fmtDueDisplay(due: string, dueAt?: string | null): string`: nếu `dueAt` hợp lệ (`Number.isFinite(Date.parse(dueAt))`), lấy cả giờ và ngày VN từ `dueAt` (`${formatVietnamTimeHHMM(dueAtMs)} ${fmtDue(vietnamDateKeyOf(new Date(dueAtMs)))}`); ngược lại trả `fmtDue(due)`.
     - Cập nhật `rollupStatus(assignment: { due: string; dueAt?: string | null; targets: Array<{ submittedAt: string | null }> }, todayISO: string, nowMs?: number)` gọi `evaluateAssignmentDeadline({ due: assignment.due, dueAt: assignment.dueAt, submittedAt: null, todayISO, nowMs })`.
     - Cập nhật `studentSubmissionStatus(target: { submittedAt: string | null }, due: string, todayISO: string, options?: { dueAt?: string | null; nowMs?: number })` gọi `evaluateAssignmentDeadline({ due, dueAt: options?.dueAt, submittedAt: target.submittedAt, todayISO, nowMs: options?.nowMs, legacyDateLate: true })`.
     - Trong `apps/web/src/routes/_auth/students/$studentId.tsx`: lấy một mốc `const nowMs = Date.now(); const todayVN = vietnamTodayISO(new Date(nowMs));` trong `StudentDetailRoute`, truyền `nowMs` + `dueAt: row.dueAt` vào `assignmentRowCells` -> `studentSubmissionStatus`, và render `fmtDueDisplay(row.due, row.dueAt)`.
  3. Cập nhật `apps/student`:
     - Trong `apps/student/src/lib/assignment-status.ts`: dùng `evaluateAssignmentDeadline({ due: assignment.due, dueAt: assignment.dueAt, submittedAt: assignment.submittedAt, todayISO, nowMs, legacyDateLate: false })` để lấy `hasDueAt`, `dueAtMs`, `dueDateISO`, `isLate`, `isOverdue`.
     - Truyền cùng `todayISO` và `nowMs` trên một lượt render từ `StudentOverviewPage` (`apps/student/src/routes/_auth/index.tsx`: `const nowMs = Date.now(); const todayISO = vietnamTodayISO(new Date(nowMs));`) xuống `AssignmentList` -> `AssignmentRow` (hoặc truyền thẳng `derived` đã tính sẵn) và `ClassCard`, đồng thời truyền `nowMs={now.getTime()}` từ `ClassDetailView` xuống `TodoBanner` và `ClassAssignmentTable`.
  4. Nâng cấp `apps/web/src/components/classes/class-assignments-tab.tsx`:
     - Lấy `const [validationNowMs, setValidationNowMs] = useState(() => Date.now());` (cập nhật khi đổi `due`/`dueTime` và ngay đầu `handleSubmit`), kèm `const renderNowMs = Date.now(); const effectiveNowMs = Math.max(renderNowMs, validationNowMs); const todayVN = vietnamTodayISO(new Date(effectiveNowMs));`.
     - Thêm state `dueTime` (mặc định `"23:59"`), `dueDateInvalid` (`false`), `dueTimeInvalid` (`false`), và `formResetKey` (`0`); cập nhật `lastAssigned` lưu thêm `dueAt: string`. Trong `handleResetToAssign`, gọi `submit.reset()`, `setDue(addDaysISO(todayVN, 7))`, `setDueTime("23:59")`, `setDueDateInvalid(false)`, `setDueTimeInvalid(false)`, `setFormResetKey((k) => k + 1)`. Khi người dùng sửa `due` hoặc `dueTime`, xóa `submit.error` bằng `if (submit.error) submit.reset()`.
     - Tính hợp lệ:
       - `dueValidDate = !dueDateInvalid && Boolean(due && parseStartDateStrict(due) !== null)`.
       - `dueTimeValid = !dueTimeInvalid && Boolean(dueTime && parseTimeHHMM(dueTime) !== null)`.
       - `dueAtMs = dueValidDate && dueTimeValid ? vietnamDateTimeMs(due, dueTime) : Number.NaN`.
       - `dueDateNotPast = dueValidDate && due >= todayVN`.
       - `dueTimeNotPast = dueDateNotPast && (due > todayVN || dueTime === "23:59" || (Number.isFinite(dueAtMs) && dueAtMs > effectiveNowMs))`.
       - `dueOk = dueValidDate && dueTimeValid && dueDateNotPast && dueTimeNotPast`.
     - Render cụm ngày + giờ (`grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]`):
       - `DatePickerInput` (`key={\`date-${formResetKey}\`}`, `id="assignment-due-input"`, `minDateISO={todayVN}`, `aria-describedby="assignment-due-feedback"`).
       - `TimeInput24h` (`key={\`time-${formResetKey}\`}`, `id="assignment-due-time-input"`, `minTimeHHMM={due === todayVN ? formatVietnamTimeHHMM(effectiveNowMs) : undefined}`, `aria-describedby="assignment-due-feedback"`).
     - Hiển thị thông báo bên dưới (`id="assignment-due-feedback"`, không đặt `aria-live` trùng lặp với `KernelSubmitNotice` — RT-7):
       - Hiển thị lỗi ngay lập tức (không đợi `hasAttemptedSubmit` khi người dùng đã nhập sai hoặc chọn ngày/giờ quá khứ — RT-2): nếu `dueDateInvalid || (hasAttemptedSubmit && !due)` → `"Ngày không hợp lệ — nhập theo định dạng dd/mm/yyyy (ví dụ 06/11/2026)."`; nếu `dueTimeInvalid || (hasAttemptedSubmit && !dueTime)` → `"Giờ không hợp lệ — nhập theo định dạng 24h HH:mm (ví dụ 23:59)."`; nếu `dueValidDate && !dueDateNotPast` → `"Chọn hạn nộp từ hôm nay trở đi."`; nếu `dueDateNotPast && dueTimeValid && !dueTimeNotPast` → `"Giờ hạn nộp hôm nay phải sau thời điểm hiện tại."`.
       - Ngược lại khi `dueOk`: render `<p id="assignment-due-feedback" data-testid="assignment-due-preview" className="text-muted-foreground text-xs">Đã hiểu: <strong className="font-medium text-foreground">{formatViWeekdayDate(due)} lúc {dueTime}</strong> (giờ Việt Nam)</p>`.
     - Trong `handleSubmit`: lấy `const clickNowMs = Date.now(); setValidationNowMs(clickNowMs);`, kiểm tra lại `dueOk` theo `clickNowMs` trước khi gọi `submit.run(...)`. Trong thanh tác vụ dưới, cập nhật `actionState` phân biệt lỗi giờ đã qua với thiếu/sai ngày, và render `{submit.error && <p role="alert" className="font-medium text-destructive text-xs">{submit.error}</p>}`.
     - Đổi className của `<textarea id="assignment-note-input">` sang dùng `border-input bg-transparent shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30`.
     - Dùng `fmtDueDisplay` trên toàn bộ điểm hiển thị hạn nộp và truyền cùng `effectiveNowMs` vào cả `rollupStatus(ca, todayVN, effectiveNowMs)` lẫn `studentSubmissionStatus(target, ca.due, todayVN, { dueAt: ca.dueAt, nowMs: effectiveNowMs })`.
- **Success criteria:** Toàn bộ unit test và kiểm tra kiểu của `@teacher-os/ui`, `web`, và `student` đều pass.
- **Verify:** `pnpm --filter @teacher-os/ui test && pnpm --filter web test && pnpm --filter student test && pnpm check-types` exits `0`.

## Verification

- `pnpm --filter @teacher-os/ui test` exits `0`.
- `pnpm --filter web test` exits `0`.
- `pnpm --filter student test` exits `0`.
- `pnpm check-types` exits `0`.

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
