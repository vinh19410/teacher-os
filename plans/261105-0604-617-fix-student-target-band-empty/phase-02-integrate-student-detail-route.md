---
phase: 2
title: "Phase 2: Integrate Student Detail Route"
status: completed
priority: P1
effort: "20m"
dependencies: [1]
---

# Phase 2: Integrate Student Detail Route

## Goal
Tích hợp helper `formatStudentTarget` vào component `StudentDetailRoute` tại `apps/web/src/routes/_auth/students/$studentId.tsx` và bổ sung integration test trong `$studentId.test.tsx`.

## Files to Create / Modify
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx`
- Modify: `apps/web/src/routes/_auth/students/$studentId.test.tsx`

## Tasks & Steps

### Task 2.1 — Viết test case cho route $studentId kiểm tra hiển thị mục tiêu
- **Goal:** Kiểm tra học viên từ kernel snapshot (chưa đặt mục tiêu) hiển thị dòng `"Chưa đặt mục tiêu"` và không chứa `"Band — ()"`.
- **Target files and symbols:** `apps/web/src/routes/_auth/students/$studentId.test.tsx`.
- **Steps:**
  1. Thêm test case `it("renders 'Chưa đặt mục tiêu' when student has no targetBand or skills", ...)`:
     - Render `<StudentDetail />` với `studentId: "st-1"`.
     - Assert `screen.getByText("Chưa đặt mục tiêu")` tồn tại trong document.
     - Assert `screen.queryByText(/Band —/)` là null.
     - Assert `screen.queryByText(/\(\)/)` là null.
  2. Thêm test case cho học viên có mục tiêu nếu cần.
- **Success criteria:** Test case được bổ sung vào file `$studentId.test.tsx`.
- **Verify:** Chạy `pnpm --filter web exec vitest run src/routes/_auth/students/\$studentId.test.tsx` thất bại (exit code khác 0) do `$studentId.tsx` hiện tại vẫn render `"Mục tiêu: Band — ()"`.

### Task 2.2 — Thay thế render tĩnh bằng formatStudentTarget trong $studentId.tsx
- **Goal:** Dùng `formatStudentTarget` để render mục tiêu học viên.
- **Target files and symbols:** `apps/web/src/routes/_auth/students/$studentId.tsx`.
- **Steps:**
  1. Import `formatStudentTarget` từ `@/lib/format-student-target`.
  2. Tại dòng 176-178, thay thế:
     ```tsx
     <span>
       Mục tiêu: Band {student.targetBand} ({student.skills.join(", ")})
     </span>
     ```
     bằng:
     ```tsx
     <span>{formatStudentTarget(student)}</span>
     ```
- **Success criteria:** JSX trong kicker gọi hàm helper; không còn template string cứng.
- **Verify:** Chạy `pnpm --filter web exec vitest run src/routes/_auth/students/\$studentId.test.tsx` thoát với exit code 0 và pass tất cả test cases.

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
