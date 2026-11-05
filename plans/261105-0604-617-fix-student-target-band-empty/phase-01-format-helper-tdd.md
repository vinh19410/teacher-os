---
phase: 1
title: "Phase 1: Format Helper TDD"
status: completed
priority: P1
effort: "20m"
dependencies: []
---

# Phase 1: Format Helper TDD

## Goal
Tạo helper thuần `formatStudentTarget` và kiểm chứng bằng bộ unit test TDD toàn diện theo quy trình Red-Green.

## Files to Create / Modify
- Create: `apps/web/src/lib/format-student-target.test.ts`
- Create: `apps/web/src/lib/format-student-target.ts`

## Tasks & Steps

### Task 1.1 — Viết test cases kiểm chứng các quy tắc định dạng mục tiêu học viên (Red phase)
- **Goal:** Viết các test case cho `formatStudentTarget` trước khi hiện thực code, chứng minh test FAIL khi chưa có implementation.
- **Target files and symbols:** `apps/web/src/lib/format-student-target.test.ts`.
- **Steps:**
  1. Tạo `apps/web/src/lib/format-student-target.test.ts` với các ca kiểm thử:
     - `targetBand: "6.5"`, `skills: ["Writing", "Speaking"]` -> trả về `"Mục tiêu: Band 6.5 (Writing, Speaking)"`.
     - `targetBand: "7.0"`, `skills: []` -> trả về `"Mục tiêu: Band 7.0"` (bỏ ngoặc rỗng).
     - `targetBand: "7.0"`, `skills: ["", "  "]` -> trả về `"Mục tiêu: Band 7.0"` (lọc bỏ phần tử rỗng).
     - `targetBand: ""`, `skills: ["Reading", "Listening"]` -> trả về `"Mục tiêu: Reading, Listening"`.
     - `targetBand: "—"`, `skills: ["Writing"]` -> trả về `"Mục tiêu: Writing"`.
     - `targetBand: "—"`, `skills: []` -> trả về `"Chưa đặt mục tiêu"`.
     - `targetBand: ""`, `skills: []` -> trả về `"Chưa đặt mục tiêu"`.
     - `targetBand: "   "`, `skills: []` -> trả về `"Chưa đặt mục tiêu"`.
     - `targetBand: undefined`, `skills: undefined` -> trả về `"Chưa đặt mục tiêu"`.
  2. Import `formatStudentTarget` từ `./format-student-target`.
- **Success criteria:** File test được tạo và mô tả đầy đủ các biên dữ liệu.
- **Verify:** Chạy `pnpm --filter web exec vitest run src/lib/format-student-target.test.ts` thất bại (exit code khác 0, lỗi module not found hoặc function not found).

### Task 1.2 — Hiện thực hàm formatStudentTarget (Green phase)
- **Goal:** Viết hàm `formatStudentTarget` thỏa mãn toàn bộ các test cases đã tạo.
- **Target files and symbols:** `apps/web/src/lib/format-student-target.ts`.
- **Steps:**
  1. Khai báo kiểu tham số:
     ```ts
     export interface StudentTargetInput {
       targetBand?: string | null;
       skills?: string[] | null;
     }
     ```
  2. Xử lý chuẩn hóa band:
     - Lấy `rawBand = student?.targetBand?.trim() ?? ""`.
     - Nếu `rawBand === "" || rawBand === "—"`, coi là không có band (`band = null`), ngược lại `band = rawBand`.
  3. Xử lý chuẩn hóa skills:
     - Lọc các phần tử: `const validSkills = (student?.skills ?? []).map(s => s.trim()).filter(Boolean);`.
  4. Trả về kết quả:
     - Nếu `band && validSkills.length > 0`: `return "Mục tiêu: Band " + band + " (" + validSkills.join(", ") + ")";`
     - Nếu `band && validSkills.length === 0`: `return "Mục tiêu: Band " + band;`
     - Nếu `!band && validSkills.length > 0`: `return "Mục tiêu: " + validSkills.join(", ");`
     - Nếu `!band && validSkills.length === 0`: `return "Chưa đặt mục tiêu";`
- **Success criteria:** Toàn bộ test case trong `format-student-target.test.ts` pass.
- **Verify:** Chạy `pnpm --filter web exec vitest run src/lib/format-student-target.test.ts` thoát với exit code 0 và in `passed`.

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
