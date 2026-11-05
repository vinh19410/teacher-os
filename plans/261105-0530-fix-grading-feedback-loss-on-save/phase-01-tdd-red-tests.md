---
phase: 1
title: "Phase 1: TDD Red Tests"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: TDD Red Tests

## Goal
Tạo các unit test kiểm chứng hành vi locking của `GradeForm` khi đang lưu (`saving={true}` hoặc `savingDraft={true}`), chứng minh test FAIL (Red) trước khi sửa code.

## Files to Create / Modify
- Modify: `apps/web/src/components/grading/grade-form.test.tsx`

## Tasks & Steps

### Task 1.1 — Thêm test case cho trạng thái saving
- **Goal:** Kiểm tra khi `saving={true}`, `#grade-feedback` có thuộc tính `disabled`, các `BandSlider` có thuộc tính `disabled`, và form có `aria-busy="true"`.
- **Target files and symbols:** `apps/web/src/components/grading/grade-form.test.tsx`.
- **Steps:**
  1. Render `GradeForm` với `saving={true}`, `skill="writing"`, `part="task2"`.
  2. Query textarea bằng `document.getElementById("grade-feedback") as HTMLTextAreaElement`.
  3. Query các slider bằng `sliderFor(key)`.
  4. Assert `expect(feedback.disabled).toBe(true)`.
  5. Assert tất cả slider có `disabled === true`.
  6. Assert `screen.getByTestId("grade-form").getAttribute("aria-busy") === "true"`.
- **Success criteria:** Test được thêm vào file test.
- **Verify:** `pnpm --filter web exec vitest run src/components/grading/grade-form.test.tsx` thất bại (exit code khác 0) do thuộc tính `disabled` và `data-testid="grade-form"` chưa có trong code hiện tại.

### Task 1.2 — Thêm test case cho trạng thái savingDraft
- **Goal:** Kiểm tra khi `savingDraft={true}`, `#grade-feedback` bị `disabled`, các `BandSlider` bị `disabled`, form có `aria-busy="true"`, và nút Chốt trả bài bị disabled ngay cả khi form đã complete.
- **Target files and symbols:** `apps/web/src/components/grading/grade-form.test.tsx`.
- **Steps:**
  1. Render `GradeForm` với:
     - `draftMode={true}`
     - `savingDraft={true}`
     - `saving={false}`
     - `canPublish={true}`
     - `initial={{ scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6 }, feedback: "Tốt", band: 6.5, gradedAt: "" }}` (đảm bảo `complete === true`)
  2. Assert `feedback.disabled === true`.
  3. Assert các slider có `disabled === true`.
  4. Assert publish button (`getByTestId("publish-grade")`) có `disabled === true`.
  5. Thử gọi `fireEvent.change(feedback, { target: { value: "Gõ thêm" } })` và assert `feedback.value` không đổi thành "Gõ thêm" (hoặc state không cập nhật).
- **Success criteria:** Test case savingDraft được ghi nhận trong suite và chứng minh fail.
- **Verify:** `pnpm --filter web exec vitest run src/components/grading/grade-form.test.tsx` thất bại (exit code khác 0).

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