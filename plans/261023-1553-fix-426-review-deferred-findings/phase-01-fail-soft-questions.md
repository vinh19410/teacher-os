---
phase: 1
title: "Fail-soft parse questions — hết 500 khi JSON corrupt"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Fail-soft parse questions

## Goal

PATCH ready (và các flow publish) với cột `questions` JSON corrupt trong DB trả 400 `NOT_READY` kèm issues có cấu trúc thay vì 500 TypeError.

## Files to Create / Modify

- Modify: `apps/server/src/routes/admin-library.ts` (thêm `parseQuestions`, sửa `toPartInput`)
- Modify: `apps/server/src/routes/admin-library.test.ts` (regression test)

## Tasks & Steps

### Task 1.1 — Regression test viết TRƯỚC (red)
- Goal: chứng minh bug — corrupt questions hiện tại gây 500.
- Target files: `apps/server/src/routes/admin-library.test.ts`.
- Steps:
  1. Đọc test sẵn có của PATCH ready trong file để copy fixture/harness (tìm test nào assert `NOT_READY` hoặc publish flow).
  2. Thêm test: insert trực tiếp row part với `questions` là JSON array sai schema (vd `'[{"stem":123}]'` — stem phải là string) vào DB test, gọi PATCH ready → expect status 400 và body có `code: "NOT_READY"` + `issues` chứa message "at least one question".
  3. Chạy đúng test này.
- Success criteria: test chạy ra THẤT BẠI vì nhận 500 thay vì 400.
- Verify: `pnpm --filter @teacher-os/server test -- admin-library` (hoặc lệnh test tương ứng file) — test mới phải fail với assertion 400 ≠ 500. Fail vì lý do khác (import/lỗi cú pháp) là thất bại của task, không phải red phase.

### Task 1.2 — Implement parseQuestions fail-soft
- Goal: `toPartInput` parse `questions` qua schema, hỏng → `[]` (part vẫn render; ready chặn bằng "at least one question").
- Target files: `apps/server/src/routes/admin-library.ts` (hàm `toPartInput` :139-157, khu `parseGroups` :133-139).
- Steps:
  1. Thêm import `assignmentQuestionSchema` từ `@teacher-os/api/contracts` (nó đã export — `packages/api/src/contracts.ts` dùng cho `libraryPartUpsertSchema`).
  2. Thêm hàm cạnh `parseGroups`:
     ```ts
     /** Cột `questions` → câu đã validate schema; JSON hỏng/phần tử sai shape → []
      * (fail-soft như `groups` — ready validation chặn "at least one question"
      * thay vì crash 500). */
     function parseQuestions(raw: string): LibraryPartInput["questions"] {
       const parsed = assignmentQuestionSchema
         .array()
         .max(40)
         .safeParse(parseJsonArray(raw));
       return parsed.success ? parsed.data : [];
     }
     ```
  3. Sửa `toPartInput`: `questions: parseQuestions(row.questions)` (bỏ cast mù).
  4. KHÔNG đụng `toPartDto` (DTO trả `z.array(z.unknown())` — render thô, không crash).
- Success criteria: test Task 1.1 chuyển xanh; toàn bộ suite `admin-library.test.ts` xanh.
- Verify: chạy lại lệnh test ở Task 1.1 — exit 0, test mới pass, không test nào cũ fail.

### Task 1.3 — Kiểm tra không còn điểm cast mù khác
- Goal: đảm bảo không còn đường 500 tương tự từ cột JSON khác trong route này.
- Target files: `apps/server/src/routes/admin-library.ts`.
- Steps: grep `as LibraryPartInput` và `as ` trong file — mọi cast trên dữ liệu DB JSON phải đi qua safeParse. `band as LibraryPartInput["band"]` giữ nguyên (cột enum DB, không phải JSON tự do).
- Success criteria: không còn cast mù trên JSON column.
- Verify: `grep -n "as Library" apps/server/src/routes/admin-library.ts` chỉ còn cast `band`.

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
