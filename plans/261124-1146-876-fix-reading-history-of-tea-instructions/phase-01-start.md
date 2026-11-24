---
phase: 1
title: "Phase 1: DB Migration 0087 Backfill assignment_prompt.groups"
status: completed
priority: P1
effort: "35m"
dependencies: []
---

# Phase 1: DB Migration 0087 Backfill `assignment_prompt.groups`

<!-- Updated: Red-Team Review 2026-11-24 - Added ready status, INF-03 guards, json_each group validation, SUBSTR prefix, COALESCE NOT NULL safety, and '[ ]' handling -->

## Goal
Backfill cột `assignment_prompt.groups` một cách an toàn và idempotent từ `library_test_part.groups` cho mọi bản sao đồng bộ trước migration `0085` còn khớp với đề thư viện `ready`, đồng thời bảo toàn tính liên tục của Drizzle snapshot chain (`0086` → `0087`).

## Files to Create / Modify
- Create: `packages/db/src/migrations/0087_backfill_assignment_prompt_groups.sql`
- Create: `packages/db/src/migrations/meta/0087_snapshot.json`
- Modify: `packages/db/src/migrations/meta/_journal.json`
- Create: `apps/server/src/assignment-prompt-groups-backfill-migration.test.ts`

## Tasks & Steps

### Task 1.1 — Viết TDD migration test trước (Red phase)
- **Goal:** Tạo test chứng minh trước khi có migration `0087`, các dòng `assignment_prompt` pre-0085 có `library_ref = 'library_test_part:<id>'` bị giữ `groups = '[]'`, đồng thời định nghĩa đầy đủ các ca bảo vệ biên và bảo mật (INF-03, `draft`, corrupt JSON/shape, wildcard `_`, `'[ ]'`, idempotency).
- **Target files and symbols:** `apps/server/src/assignment-prompt-groups-backfill-migration.test.ts`
- **Steps:**
  1. Dựng helper apply migrations tuần tự tới `0086_class_opening_email.sql` trên libsql in-memory (`file::memory:`), theo mẫu `apps/server/src/user-role-backfill-migration.test.ts`.
  2. Viết test cases kiểm tra migration `0087_backfill_assignment_prompt_groups.sql`:
     - Backfill thành công dòng `assignment_prompt` pre-0085 với `groups = '[]'`, `groups = ''`, và `groups = '[ ]'` mô phỏng đề **The History of Tea** (2 nhóm `sent` 7 câu + `tfng` 6 câu, tổng 13 câu khớp `library_test_part.questions`, `library_test.status = 'ready'`).
     - Không ghi đè dòng `assignment_prompt` đã có `groups` không rỗng.
     - Bỏ qua dòng mà `library_test.status = 'draft'` (chống lộ nội dung nháp).
     - Bỏ qua dòng có số câu khác nhau, HOẶC tổng số câu bằng nhau nhưng `passage` bị giáo viên sửa, HOẶC `question.type` đã drift so với `group.type` của `library_test_part` (bảo vệ INF-03).
     - Bỏ qua dòng có `library_ref` trỏ `library_exercise:...`, `NULL`, hoặc giả mạo wildcard `'libraryXtestYpart:<id>'`.
     - Bỏ qua mà KHÔNG throw `malformed JSON` khi tồn tại dòng `library_test_part.groups` / `questions` / `assignment_prompt.questions` bị JSON hỏng (`'{corrupt'`), non-array (`'{}'`), corrupt shape (`'[{"bad":1}]'`), over-cap (`> 20` nhóm), hoặc tổng `count` không khớp số câu.
     - Idempotent khi chạy lại SQL `0087` lần 2 và `PRAGMA foreign_key_check` trả 0 dòng.
- **Success criteria:** File test tồn tại và chạy thất bại (Red) vì file migration `0087` chưa tồn tại.
- **Verify:** `pnpm --filter server exec vitest run src/assignment-prompt-groups-backfill-migration.test.ts` exits non-zero with failure locating `0087_backfill_assignment_prompt_groups.sql` (passing test is a failure).

### Task 1.2 — Tạo migration `0087`, snapshot `0087` và cập nhật `_journal.json` (Green phase)
- **Goal:** Sinh migration SQL an toàn tuyệt đối với SQLite/D1 và cập nhật đủ Drizzle metadata để `study-pack-migration.test.ts` và test migration mới cùng pass.
- **Target files and symbols:**
  - `packages/db/src/migrations/0087_backfill_assignment_prompt_groups.sql`
  - `packages/db/src/migrations/meta/0087_snapshot.json`
  - `packages/db/src/migrations/meta/_journal.json`
- **Steps:**
  1. Đọc `packages/db/src/migrations/meta/0086_snapshot.json` để lấy chính xác giá trị `"id"` hiện tại (`8abc5b85-833f-4888-bbe7-3388b1444447`).
  2. Chạy `pnpm --filter @teacher-os/db db:generate -- --custom --name=backfill_assignment_prompt_groups` (nếu Drizzle không tạo `meta/0087_snapshot.json` cho `--custom`, sao chép `0086_snapshot.json` thành `0087_snapshot.json`, đổi `"id"` thành UUID v4 mới và đặt `"prevId"` bằng `"id"` của `0086_snapshot.json`).
  3. Ghi nội dung SQL vào `packages/db/src/migrations/0087_backfill_assignment_prompt_groups.sql`:
     - Dùng `SET groups = COALESCE((SELECT ltp.groups FROM library_test_part ltp WHERE assignment_prompt.library_ref = 'library_test_part:' || ltp.id), assignment_prompt.groups)` để tuyệt đối không vi phạm `NOT NULL`.
     - Điều kiện `WHERE` kiểm tra:
       - `TRIM(assignment_prompt.groups) = '' OR (CASE WHEN json_valid(assignment_prompt.groups) = 1 AND json_type(assignment_prompt.groups) = 'array' THEN json_array_length(assignment_prompt.groups) ELSE -1 END) = 0`
       - `SUBSTR(assignment_prompt.library_ref, 1, 18) = 'library_test_part:'` (không dùng `LIKE`).
       - `EXISTS (SELECT 1 FROM library_test_part ltp INNER JOIN library_test lt ON lt.id = ltp.test_id WHERE ...)`:
         - `assignment_prompt.library_ref = 'library_test_part:' || ltp.id`
         - `lt.status = 'ready'`
         - `assignment_prompt.skill = lt.skill AND assignment_prompt.part = ltp.part AND assignment_prompt.passage = ltp.passage`
         - `CASE WHEN json_valid(ltp.groups) = 1 AND json_type(ltp.groups) = 'array' THEN json_array_length(ltp.groups) ELSE 0 END BETWEEN 1 AND 20`
         - `CASE WHEN json_valid(ltp.questions) = 1 AND json_type(ltp.questions) = 'array' THEN json_array_length(ltp.questions) ELSE -2 END = CASE WHEN json_valid(assignment_prompt.questions) = 1 AND json_type(assignment_prompt.questions) = 'array' THEN json_array_length(assignment_prompt.questions) ELSE -1 END`
         - `CASE WHEN json_valid(assignment_prompt.questions) = 1 AND json_type(assignment_prompt.questions) = 'array' THEN json_array_length(assignment_prompt.questions) ELSE 0 END > 0`
         - Mọi phần tử trong `json_each(ltp.groups)` là object có `type` string không rỗng, `startIndex >= 0`, `count >= 1`, `SUM(count) = json_array_length(assignment_prompt.questions)`, `MIN(startIndex) = 0`, `MAX(startIndex + count) = json_array_length(assignment_prompt.questions)`, và không có phần tử nào trong `json_each(assignment_prompt.questions)` (có `$.type` khác rỗng) lệch với `$.type` của nhóm bao phủ nó.
  4. Kiểm tra `packages/db/src/migrations/meta/_journal.json` có đúng entry `idx: 87`, `tag: "0087_backfill_assignment_prompt_groups"`, `breakpoints: true`.
- **Success criteria:** Cả migration test mới lẫn `study-pack-migration.test.ts` (kiểm tra snapshot chain `#554`) đều pass.
- **Verify:** `pnpm --filter server exec vitest run src/assignment-prompt-groups-backfill-migration.test.ts src/study-pack-migration.test.ts` exits 0 and reports all tests passed.

## Verification
- `pnpm --filter server exec vitest run src/assignment-prompt-groups-backfill-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice-library-sync.test.ts`

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
