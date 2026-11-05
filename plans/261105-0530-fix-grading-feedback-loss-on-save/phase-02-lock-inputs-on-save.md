---
phase: 2
title: "Phase 2: Lock Inputs on Save"
status: completed
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: Lock Inputs on Save

## Goal
Triển khai logic khóa ô nhận xét và các thanh trượt khi đang lưu điểm hoặc đang lưu bản nháp, kèm các guard defense-in-depth, thỏa mãn các test case ở Phase 1 (TDD Green).

## Files to Create / Modify
- Modify: `apps/web/src/components/grading/band-slider.tsx`
- Modify: `apps/web/src/components/grading/grade-form.tsx`

## Tasks & Steps

### Task 2.1 — Bổ sung prop disabled và guard onChange cho BandSlider
- **Goal:** `BandSlider` nhận `disabled?: boolean`, truyền xuống phần tử `<input type="range">`, ngăn thao tác trượt và chặn sự kiện `onChange` khi disabled.
- **Target files and symbols:** `apps/web/src/components/grading/band-slider.tsx` (component `BandSlider`).
- **Steps:**
  1. Thêm `disabled?: boolean` vào interface props của `BandSlider`.
  2. Truyền `disabled={disabled}` vào thẻ `<input type="range" ... />`.
  3. Thêm class styling khi disabled: `disabled && "cursor-not-allowed opacity-50"`.
  4. Bổ sung guard trong `onChange`: `onChange={(event) => { if (!disabled) onChange(Number(event.currentTarget.value)); }}`.
  5. Bổ sung guard trong `onPointerUp`: `if (value === null && !disabled) onChange(Number(event.currentTarget.value));`.
- **Success criteria:** `BandSlider` hỗ trợ disable trực tiếp qua prop `disabled` và chặn mọi thay đổi giá trị khi disabled.
- **Verify:** `pnpm --filter web exec vitest run src/components/grading/grade-form.test.tsx` (chưa pass hết vì GradeForm chưa được sửa).

### Task 2.2 — Khóa inputs và cập nhật submit guards trong GradeForm
- **Goal:** `GradeForm` tính `isSaving = saving || Boolean(savingDraft)` và áp dụng lên form, `#grade-feedback`, `BandSlider`, cùng các nút bấm và state handlers.
- **Target files and symbols:** `apps/web/src/components/grading/grade-form.tsx` (component `GradeForm`).
- **Steps:**
  1. Khai báo `const isSaving = saving || Boolean(savingDraft);`.
  2. Thêm `data-testid="grade-form"` và `aria-busy={isSaving}` vào thẻ `<form>`.
  3. Trong `keys.map`, truyền `disabled={isSaving}` vào mỗi `<BandSlider>` và thêm guard `if (!isSaving)` trong `onChange`.
  4. Trong `<Textarea id="grade-feedback">`, truyền `disabled={isSaving}` và thêm guard `if (!isSaving)` trong `onChange`.
  5. Trong `onSubmit`, mở rộng guard: `if (!complete || isSaving || !canPublish) return;`.
  6. Trong nút "Chốt trả bài" / "Lưu điểm": `disabled={!complete || isSaving || !canPublish}`.
  7. Trong nút "Lưu bản nháp": `disabled={!complete || isSaving}` và guard đồng bộ trong `onClick`: `if (!complete || isSaving) return;`.
- **Success criteria:** Khi `saving` hoặc `savingDraft`, inputs bị khóa (`disabled`) và không thể nhập thêm chữ hay đổi điểm.
- **Verify:** `pnpm --filter web exec vitest run src/components/grading/grade-form.test.tsx` exits 0 (tất cả các test bao gồm test mới đều pass).

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