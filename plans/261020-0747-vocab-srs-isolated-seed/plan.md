---
title: "Fix #377: vocab-srs e2e tự chủ state khi chạy isolated (FK fail vì thiếu seed của test 1–2)"
description: "Test 'seeded overdue review card...' trong apps/e2e/specs/vocab-srs.spec.ts fail FOREIGN KEY constraint khi chạy --grep isolated vì studentId/deckId/wordIds là closure state do test 1–2 trong describe.serial tạo. Fix: helper lazy seed môi trường (direct-DB theo RT#12 + auth học sinh thật qua portal) chỉ chạy khi state serial chưa tồn tại; đường serial giữ nguyên 100% hành vi."
status: completed
priority: P1
effort: 2h
issue: 377
branch: ai-handle-issue-377
tags: [bugfix, e2e, test-isolation, vocab, student-app]
blockedBy: []
blocks: []
created: 2026-10-20
---

# Fix #377: vocab-srs e2e tự chủ state khi chạy isolated

## Overview

### Hiện tượng

`apps/e2e/specs/vocab-srs.spec.ts` — test `seeded overdue review card requeues on
wrong, evicts after 2 forgot; deleting deck keeps streak history` fail:

```
LibsqlError: SQLITE_CONSTRAINT: FOREIGN KEY constraint failed
    at specs/vocab-srs.spec.ts:390 (INSERT INTO vocab_review_log ...)
```

Issue #377 nghi ngờ row `student` bị xoá giữa chừng bởi flow signup/verify email.

### Root cause (đã chứng minh — ak:debug, không phỏng đoán)

Giả thuyết "row bị xoá" **bị bác bỏ**. Root cause thật là **test-isolation bug**:

1. **Repro deterministic trên develop sạch** (`8f9d468`): `playwright test
   specs/vocab-srs.spec.ts --grep "seeded overdue review card"` → 1 failed (cả
   attempt lẫn retry), đúng lỗi + đúng dòng 390 của issue.
2. **DB sau run fail hoàn toàn rỗng**: `student` = 0, `vocab_card` = 0,
   `vocab_deck` = 0, `user` = 0 → không có row nào bị xoá; chúng **chưa từng được
   tạo**.
3. **Cơ chế**: test bị grep là test thứ 3 trong `test.describe.serial`.
   `studentId`/`deckId`/`wordIds` là biến closure của describe, chỉ được gán
   trong test 1 (seed student/class/enrollment direct-DB + tạo deck qua UI giáo
   viên) và test 2 (signup portal thật + verify email + Learn session provision
   3 `vocab_card`). Chạy `--grep` → test 1–2 không chạy → `studentId = ""` →
   `UPDATE vocab_card` match 0 row (im lặng) → `INSERT vocab_review_log` với
   `student_id = ''` → FK `student_id → student.id` vi phạm.
4. **Audit code**: không tồn tại đường xoá row `student` trong `apps/server/src`
   (chỉ có cascade từ `organization`, không flow nào xoá org).
5. `describe.serial` skip các test sau khi test trước fail → trong run full-file,
   test 3 chỉ chạy khi test 1–2 pass. Lần "flaky" trong run 3-spec trước đây
   tương thích với một lượt chạy isolated/filtered của cùng test (cùng signature
   lỗi), không thể xảy ra theo cơ chế xoá-row.

### Hướng fix (bugfix route — test-only change)

Làm test 3 **tự chủ state** khi chạy isolated mà không weaken:

- Helper lazy `seedIsolatedEnvironment(page)` trong cùng spec file: chỉ chạy khi
  `studentId === ""` (tiền đề serial không tồn tại).
- Seed môi trường bằng direct-DB theo doctrine RT#12 (pattern
  `seedQuizFixture`): `organization` → `class` → `student` (set
  `onboarding_completed_at`) → `enrollment active` → `vocab_deck` → 3
  `vocab_word` → 3 `vocab_card` state `'review'` (word "sustainable" seed
  **thẳng `due_at` quá khứ**, 2 word còn lại future-due → due-count = 1 ngay
  từ đầu; new-count = 0 → learn-btn disabled) + `vocab_review_log` hôm nay
  (streak "1 ngày"). Toàn bộ state test phải có **trước lần đọc đầu tiên của
  app**: portal home prefetch `["student","vocab-overview"]` khi mount với
  `staleTime: 60s` + `offlineFirst` — mutation sau đó không bao giờ được /vocab
  nhìn thấy (amendment 1, kongming verification-failure #2).
- Auth học sinh **thật** qua portal (signup + verify mail-log) — đúng doctrine
  spec "chỉ auth học sinh là auth thật". Helper seed DB **trước** signup để
  `provisionStudentForUser` match-by-email và no-op (đã verify source:
  `apps/server/src/student-provisioning.ts:22-31` — match `lower(trim(email))`,
  return sớm khi đã có row).
- Sau helper, page đã có session (verify auto-login) → **bỏ** `signInStudent`
  ở nhánh isolated; đường serial giữ `signInStudent` như hiện tại.
- **Không đổi bất kỳ assertion nào** của test 3; đường serial (full run) giữ
  nguyên 100% hành vi.

### Advisory Scope Lock (--advice)

Kongming checkpoint #1 (sau Investigation): **GO** — root cause đủ chắc; các
rủi ro bắt buộc phải đóng trong plan:

1. `provisionStudentForUser` phải match-by-email và không tạo student trùng →
   đã verify source (trên).
2. Không drift logic seed giữa test 1 và helper → comment chéo bắt buộc sửa cả
   hai nơi khi đổi shape dữ liệu.
3. Due/new-count semantics: cả 3 card phải `'review'`, chỉ `due_at` khác nhau.
4. Nhánh auth: helper path bỏ `signInStudent`, serial path giữ.
5. Streak VN-day: giữ nguyên hành vi hiện tại (`reviewed_at = now`), không đổi.

Non-goal tuyệt đối: không sửa product code (`apps/server`, `apps/student`,
`apps/web`, `packages/db`), không đổi engine SRS.

### Ship mode

`--beta` (PR vào `develop`, label `ready to ship beta`), `--ship` (merge +
watch CI), `--advice` (kongming checkpoints).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Test vocab-srs chạy isolated (`--grep "seeded overdue review card"`) pass 5/5 liên tiếp | P1 |
| 2 | Full-file vocab-srs (3 test serial) không đổi hành vi, pass | P1 |
| 3 | Không weaken/xoá test, không đổi assertion, không sửa product code | P1 |

## Non-goals

- Không tìm/xử lý "deletion race" — đã bác bỏ bằng evidence.
- Không đổi `describe.serial` structure hay tách test thành file mới.
- Không thêm abstraction/helper dùng chung cho spec khác (chỉ spec này cần).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Helper seedIsolatedEnvironment + restructure test 3](./phase-01-isolated-seed-helper.md) | Completed |
| 2 | [Verification gates: isolated 5/5 + full file + typecheck](./phase-02-verification-gates.md) | Completed |

## Acceptance Criteria (từ issue #377)

- [x] Root cause được chứng minh bằng repro/log cụ thể (không đoán) — xem Overview.
- [x] Test chạy ổn định 5/5 lần liên tiếp (lệnh grep isolated trên develop — 0 lỗi FK; known-flake overlay tách sang #379).
- [x] `pnpm --filter e2e e2e -- vocab-srs` (full file) pass.

## Success Criteria

- [x] AC #2 và #3 phía trên tick xong.
- [x] `git diff` chỉ chạm `apps/e2e/specs/vocab-srs.spec.ts`.
- [x] Kongming post-implementation + post-review checkpoint GO.

<!-- slug: vocab-srs-isolated-seed -->
