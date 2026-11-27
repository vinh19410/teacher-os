---
title: "Phase 1: TDD Unit Tests & Checkbox / Tri-State Select All Fix"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: TDD Unit Tests & Checkbox / Tri-State Select All Fix

## Goal
Viết test TDD chứng minh lỗi `sr-only` / tên truy cập / thiếu checkbox «Chọn tất cả» 3 trạng thái, sau đó sửa `AssignClassPromptModal` (`apps/web/src/components/classes/assign-class-prompt-modal.tsx`) để mọi checkbox bấm trực tiếp được, có accessible name sạch và có header checkbox «Chọn tất cả» 3 trạng thái kèm badge phạm vi.

## Files to Create / Modify
- Modify: `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx` (lines `855-858`, plus new test case at end of `describe("AssignClassPromptModal", ...)`)
- Modify: `apps/web/src/components/classes/assign-class-prompt-modal.tsx` (imports lines `17-49`, state/handlers lines `290-360`, student selection UI lines `869-975`)

## Tasks & Steps

### Task 1.1 — Cập nhật & bổ sung unit tests TDD (Red Phase)
<!-- Updated: Red-Team Session 1 - chọn đề ready trước khi khẳng định footer "Chưa chọn học viên" và nút disabled do thiếu học viên -->
- Goal: Tạo các kiểm thử thất bại trước khi sửa code nhằm khóa hành vi checkbox trực tiếp, accessible name không dính avatar và checkbox «Chọn tất cả» 3 trạng thái + badge phạm vi.
- Target files and symbols: `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx` (test 105 học viên tại dòng `825-878` và `describe("AssignClassPromptModal")` kết thúc tại dòng `1014`).
- Steps:
  1. Tại dòng `855-858` trong test lớp 105 học viên: thay `fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn tất cả" }))` và `fireEvent.click(screen.getByRole("button", { name: "Chọn tất cả" }))` bằng `const selectAll = screen.getByRole("checkbox", { name: "Chọn tất cả" }) as HTMLInputElement;` và `fireEvent.click(selectAll)` hai lần; đồng thời khẳng định `screen.getByTestId("assign-students-scope-badge").textContent` lần lượt là `"Chọn lọc"` lúc `(100/105)` (không phải `"Cả lớp"`), `"Chưa chọn"` lúc `(0/105)`, và `"Chọn lọc"` lúc `(100/105)`.
  2. Thêm test mới cuối `describe("AssignClassPromptModal")` mang tên `it("hiển thị checkbox học viên trực tiếp không sr-only/span che, tên truy cập sạch không dính avatar và Chọn tất cả 3 trạng thái (#982)", () => { ... })`:
     - Render `<AssignClassPromptModal open onClose={vi.fn()} classGroup={testClass} />`.
     - Kiểm tra `const st1 = screen.getByRole("checkbox", { name: "Nguyễn Văn A", exact: true }) as HTMLInputElement;`, `const st2 = screen.getByRole("checkbox", { name: "Trần Thị B", exact: true }) as HTMLInputElement;`, `const selectAll = screen.getByRole("checkbox", { name: "Chọn tất cả", exact: true }) as HTMLInputElement;`.
     - Khẳng định `st1.className`, `st2.className`, `selectAll.className` đều không chứa `"sr-only"`; mọi `<svg>` trong cùng wrapper `span` của checkbox đều có `aria-hidden="true"` và class chứa `"pointer-events-none"`.
     - Kiểm tra trạng thái ban đầu (chưa chọn đề): `selectAll.checked === true`, `selectAll.indeterminate === false`, `selectAll.getAttribute("aria-checked") === null`, `screen.getByTestId("assign-students-scope-badge").textContent === "Cả lớp"`, `screen.getByText("(2/2)")`, footer hiển thị `"Chưa chọn đề"`.
     - Chọn một đề sẵn sàng (`fireEvent.click(screen.getByRole("button", { name: /Reading — True\/False/ }))`) để `promptOk === true`, xác nhận footer hiển thị `"Giao cho 2 học viên"` và nút `"Giao bài tập"` không bị `disabled`.
     - `fireEvent.click(st2)` → `st2.checked === false`, `selectAll.checked === false`, `selectAll.indeterminate === true`, `selectAll.getAttribute("aria-checked") === "mixed"`, badge `"Chọn lọc"`, `"(1/2)"`, footer `"Giao cho 1 học viên"`.
     - `fireEvent.click(selectAll)` từ trạng thái `indeterminate` → chọn hết (`st2.checked === true`, `selectAll.checked === true`, `selectAll.indeterminate === false`, `selectAll.getAttribute("aria-checked") === null`, badge `"Cả lớp"`, `"(2/2)"`, footer `"Giao cho 2 học viên"`).
     - `fireEvent.click(selectAll)` từ trạng thái đã chọn hết → bỏ chọn hết (`st1.checked === false`, `st2.checked === false`, `selectAll.checked === false`, `selectAll.indeterminate === false`, badge `"Chưa chọn"`, `"(0/2)"`, footer có `"Chưa chọn học viên"`, nút `"Giao bài tập"` có `.disabled === true`, và không còn `<svg>` tick/minus nào render trong các wrapper checkbox).
     - `fireEvent.click(st1)` → `(1/2)` + `indeterminate` + `"Chọn lọc"` + `"Giao bài tập"` hết `disabled`; `fireEvent.click(st2)` → `(2/2)` + `checked` + `"Cả lớp"`.
     - Rerender `open={false}` rồi `open={true}` → reset về chọn tất cả `(2/2)`, badge `"Cả lớp"`, và `"Chưa chọn đề"`.
- Success criteria: File test biên dịch được và thất bại trên mã nguồn hiện tại vì thiếu checkbox `"Chọn tất cả"`, thiếu `assign-students-scope-badge`, checkbox học viên vẫn mang `sr-only`, và tên truy cập dính chữ viết tắt Avatar.
- Verify: `pnpm --filter web exec vitest run src/components/classes/assign-class-prompt-modal.test.tsx` — phải thoát với mã khác 0 do assertion fail ở các case mới/cập nhật (trạng thái Red mong đợi).

### Task 1.2 — Sửa checkbox, ẩn Avatar và nâng cấp Chọn tất cả 3 trạng thái trong AssignClassPromptModal (Green Phase)
<!-- Updated: Red-Team Session 1 - bọc wrapper span.relative cho selectAllRef, giữ guard render icon có điều kiện và tô nền/viền border-primary bg-primary khi indeterminate -->
- Goal: Thay `peer sr-only` + decorative `span` bằng native `<input type="checkbox">` hiển thị trực tiếp, bọc `<Avatar>` trong `aria-hidden="true"`, và thêm header bar checkbox `"Chọn tất cả"` 3 trạng thái kèm badge phạm vi.
- Target files and symbols: `apps/web/src/components/classes/assign-class-prompt-modal.tsx` (`AssignClassPromptModal`).
- Steps:
  1. Ở dòng `17`, thêm `Minus` vào import từ `lucide-react`: `import { Check, ChevronDown, Minus, Search, X } from "lucide-react";`. Thêm `import { Badge } from "@/components/ui/badge";` gần các import `@/components/ui/*`.
  2. Ngay sau `allSelectableSelected` (gần dòng `295`), khai báo:
     ```ts
     const isPartiallySelected =
     	visibleSelectedStudentIds.length > 0 && !allSelectableSelected;
     const selectAllRef = useRef<HTMLInputElement>(null);
     useEffect(() => {
     	if (selectAllRef.current) {
     		selectAllRef.current.indeterminate = isPartiallySelected;
     	}
     }, [isPartiallySelected]);
     ```
  3. Giữ nguyên hàm `handleToggleAllStudents` (dòng `349-357`, không đọc `e.target.checked`) và giữ nguyên `actionState.title` (`` `Giao cho ${visibleSelectedStudentIds.length} học viên` ``).
  4. Tại khối danh sách học viên (dòng `869-975`):
     - Đổi thẻ bọc ngoài thành `<fieldset aria-labelledby="assignment-students-heading" className="flex min-w-0 flex-col gap-2 border-0 p-0">`.
     - Hàng tiêu đề: dùng `<h4 id="assignment-students-heading" ...>Học viên nhận bài</h4>` kèm một vùng `<div aria-live="polite" aria-atomic="true" className="flex flex-wrap items-center gap-1.5">` chứa `<span className="text-muted-foreground text-xs tabular-nums">({visibleSelectedStudentIds.length}/{enrolledStudents.length})</span>` và (khi `enrolledStudents.length > 0`) `<Badge data-testid="assign-students-scope-badge" variant={willAssignWholeClass ? "default" : visibleSelectedStudentIds.length === 0 ? "warn" : "outline"}>{willAssignWholeClass ? "Cả lớp" : visibleSelectedStudentIds.length === 0 ? "Chưa chọn" : "Chọn lọc"}</Badge>`. Xoá `<button>` text cũ ở dòng `880-888`.
     - Giữ nguyên thông báo `MAX_STUDENTS_PER_ASSIGN`, `assign-modal-invited-notice` và khối empty state `enrolledStudents.length === 0`.
     - Khi `enrolledStudents.length > 0`, bọc trong `<div className="overflow-hidden rounded-lg border border-border bg-card">`:
       - Header cố định (không cuộn): `<div className="flex flex-wrap items-center justify-between gap-2 border-border border-b bg-muted/40 px-3 py-2.5">` chứa `<label className="flex cursor-pointer select-none items-center gap-3 font-medium text-foreground text-sm">` bọc wrapper `<span className="relative inline-flex size-4 shrink-0 items-center justify-center">` (KHÔNG `overflow-hidden`) bên trong có `<input ref={selectAllRef} type="checkbox" checked={allSelectableSelected} aria-checked={isPartiallySelected ? "mixed" : undefined} onChange={handleToggleAllStudents} className={cn("size-4 shrink-0 cursor-pointer appearance-none rounded-sm border transition-colors outline-none focus-visible:shadow-[var(--focus-ring)] forced-colors:appearance-auto", allSelectableSelected || isPartiallySelected ? "border-primary bg-primary" : "border-input bg-background dark:bg-input/30")} />` và icon có điều kiện `{allSelectableSelected ? <Check aria-hidden="true" className="pointer-events-none absolute size-3 text-primary-foreground forced-colors:hidden" /> : isPartiallySelected ? <Minus aria-hidden="true" className="pointer-events-none absolute size-3 text-primary-foreground forced-colors:hidden" /> : null}`, theo sau bởi nhãn cố định `<span>Chọn tất cả</span>`; bên ngoài `<label>` là dòng gợi ý `<span className="text-muted-foreground text-xs">{allSelectableSelected ? "Bấm để bỏ chọn hết" : "Bấm để chọn tất cả"}</span>`.
       - Danh sách cuộn `<div className="flex max-h-52 flex-col divide-y divide-border overflow-y-auto">`: thay `peer sr-only` + decorative `<span>` bằng wrapper `<span className="relative inline-flex size-4 shrink-0 items-center justify-center">` (KHÔNG `overflow-hidden`) chứa `<input type="checkbox" checked={isChecked} disabled={isDisabled} onChange={(e) => handleStudentToggle(s.id, e.target.checked)} className={cn("size-4 shrink-0 appearance-none rounded-sm border transition-colors outline-none focus-visible:shadow-[var(--focus-ring)] forced-colors:appearance-auto", isDisabled ? "cursor-not-allowed" : "cursor-pointer", isChecked ? "border-primary bg-primary" : "border-input bg-background dark:bg-input/30")} />` và icon có điều kiện `{isChecked && <Check aria-hidden="true" className="pointer-events-none absolute size-3 text-primary-foreground forced-colors:hidden" />}`; bọc `<Avatar text={s.avatar} size="sm" />` trong `<span aria-hidden="true" className="shrink-0">`. Giữ `opacity-50` trên `<label>` khi `isDisabled`, không nhân đôi `opacity-50` lên `<input>`.
- Success criteria: Toàn bộ unit test trong `assign-class-prompt-modal.test.tsx` và `$classId.test.tsx` đều xanh.
- Verify: `pnpm --filter web exec vitest run src/components/classes/assign-class-prompt-modal.test.tsx 'src/routes/_auth/classes/$classId.test.tsx'` — thoát `0`, tất cả test pass.

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

## Todo
- [x] Task 1.1: Cập nhật test 105 HV và bổ sung test TDD (Red) cho checkbox trực tiếp, Avatar `aria-hidden` và «Chọn tất cả» 3 trạng thái
- [x] Task 1.2: Sửa `AssignClassPromptModal` và xác nhận unit tests (Green)

## Success Criteria
- Toàn bộ unit test `assign-class-prompt-modal.test.tsx` và `$classId.test.tsx` pass với bằng chứng trước/sau TDD rõ ràng.
