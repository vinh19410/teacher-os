---
title: "882-fix-library-shares-duplicated-title"
description: "Fix duplicated Reading test title for Investment in shares across source dataset JSON, _index.json, and D1 database tables (migration 0091) with dataset integrity, Turbo input tracking, and migration regression tests"
status: completed
priority: P1
effort: "1h"
tags: [library, reading, migration, dataset]
created: 2026-11-25
---

# Plan #882 — Sửa lỗi tiêu đề đề Reading "Investment in shares..." bị lặp đôi trên thẻ học viên và thư viện admin

- **Issue:** [#882](https://github.com/vinh19410/teacher-os/issues/882)
- **Branch:** `vinh19410/fix-library-ti-u-investment-in-shares.-b-l-p-i-t` → PR vào `develop` (`--ship --beta --advice`)
- **Route:** Bugfix (`/ak-fix --auto --advice`)
- **Handover-ready:** Có — mỗi phase được phân rã thành các task tự chứa với `Goal`, `Target files and symbols`, `Steps`, `Success criteria`, lệnh `Verify` cơ học (ghi rõ điều kiện Red/Green cho `--tdd`) và khối `## Failure Protocol` nguyên văn buộc dừng khi verify thất bại.

## Overview

Khắc phục triệt để nguyên nhân gốc rễ khiến tiêu đề bài Reading `b8927676-3e2d-441d-97a7-12199ef4f2ba` hiển thị lặp đôi trên cả trang học viên (`/student/practice/reading`) lẫn thư viện đề admin (`/admin/library/tests`):

1. **Nguyên nhân ở dữ liệu nguồn (`docs/reading-ielts/reading-practice/`):**
   - File `Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json` (dòng 4) và `_index.json` (dòng 4012–4014) lưu chuỗi tiêu đề 167 ký tự lặp đôi cụm 81 ký tự đầu trước `"gain?"`:
     `"Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?"`
   - Kiểm tra mã nguồn UI/API (`apps/student/src/components/practice/skill-catalog.tsx:91`, `apps/admin/src/components/library/test-table.tsx:63`, `apps/server/src/routes/student-practice.ts:654`, `apps/server/src/routes/admin-library.ts:336,372`) xác nhận không có lỗi nối chuỗi ở UI/API; dấu `…` trong báo cáo QA đến từ `line-clamp-2` trên thẻ học viên.
   - Quét toàn bộ 351 bài Reading (`docs/reading-ielts/reading-practice/`) và 498 bài Listening (`docs/listening_ielts/`) xác nhận chỉ có duy nhất bài `b8927676-3e2d-441d-97a7-12199ef4f2ba` bị lỗi lặp tiêu đề.
2. **Nguyên nhân dữ liệu đã lưu trên D1 và bất biến INF-03:**
   - Đề Reading được import vào D1 với `id` sinh bằng `crypto.randomUUID()` (`apps/server/src/routes/admin-library.ts:710`), không có seed script chạy định kỳ trên deploy.
   - `syncLibraryTestsToOrg` (`apps/server/src/lib/library-test-sync.ts:38-40,117-136`) cố tình giữ invariant INF-03: không ghi đè bản sao `assignment_test` đã clone cho org sau khi sửa `library_test`. Đồng thời `formatLibraryPartTitle` (`apps/server/src/lib/study-pack-clone.ts:176-184`, không `.trim()` trên `testTitle`) có thể đã materialize `assignment_prompt.title` theo dạng `${OLD_TITLE}` hoặc `${OLD_TITLE}<ws>— P1/P2/P3` (em-dash `\u2014`), và các bản import part có thể gắn tiền tố `Passage 1..3: ` / `Reading Passage 1..3: `.
   - Ngoài ra, `PATCH /api/assignments/tests/:id` (`apps/server/src/routes/assignments/tests.ts:108-128`) và `PATCH /api/assignments/prompts/:id` (`apps/server/src/routes/assignments/index.ts:500-561`) giữ nguyên `library_ref` sau khi giáo viên sửa bản sao; đồng thời `library_ref` không có FK nên bản sao của đề đã bị xoá vẫn hiển thị tiêu đề ở lịch sử tự luyện (`apps/server/src/routes/student-history.ts:254-260`).
   - Do đó cần đồng bộ sửa dataset nguồn (kèm `git mv` sang slug sạch + khai báo cross-package Turbo cache input tại `packages/db/turbo.json`) và tạo Drizzle migration `0091` (tương thích `packages/infra/src/flat-migrations.ts` và Drizzle `migrate()`) để làm sạch 4 bảng `library_test`, `assignment_test`, `library_test_part`, `assignment_prompt` một cách idempotent, an toàn `NOT NULL` (`ELSE title`), bảo toàn INF-03 và RT#3.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - **Dataset nguồn Reading & CI cache input (`docs/reading-ielts/reading-practice/`, `packages/db/turbo.json`):**
    - Đổi tên file bằng `git mv` từ `Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json` sang `Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json`.
    - Sửa `"title"` tại dòng 4 file JSON và `"file"` + `"title"` tại `docs/reading-ielts/reading-practice/_index.json:4012-4014` sang `"Investment in shares versus investment in other assets - which gives the greater gain?"` (86 ký tự); giữ nguyên `passage.title` (`"Investment in shares versus investment in other assets"`), `id`, `url`, `passage_number`, `paragraphs`, `question_groups` và đáp án.
    - Bổ sung test toàn vẹn dataset `packages/db/src/seed/reading-library-dataset.test.ts` kiểm tra 351/351 entry trong `_index.json` khớp file/id/title, kiểm tra toàn vẹn cấu trúc bài `b8927676-3e2d-441d-97a7-12199ef4f2ba`, và thuật toán phát hiện lặp tiền tố/4-từ (có unit test khẳng định bắt `OLD_TITLE` và chấp nhận `NEW_TITLE`).
    - Thêm `packages/db/turbo.json` (kế thừa `"extends": ["//"]`, khai báo `tasks.test.inputs` bao gồm `../../docs/reading-ielts/reading-practice/**` và `../../docs/listening_ielts/**`) cùng kiểm chứng trong `scripts/ci-workflow.test.mjs` để CI không bỏ qua test dataset do Turbo cache hit.
  - **Drizzle Migration `0091` + metadata + tests:**
    - Tạo `packages/db/src/migrations/0091_fix_reading_shares_duplicated_title.sql`, `packages/db/src/migrations/meta/0091_snapshot.json` (nối `prevId` từ `0090_snapshot.json` `id = "4bcf36e4-8fca-4892-8977-32e72f366b67"`), và cập nhật `packages/db/src/migrations/meta/_journal.json` (`idx: 91`, `when > 1795583597884`, `breakpoints: true`).
    - 4 statement SQL ngăn bởi `--> statement-breakpoint`, đều kết thúc `;`, dùng `TRIM(..., ' ' || CHAR(9) || CHAR(10) || CHAR(13))` (xử lý đủ space/tab/CR/LF), tuyệt đối không dùng `LIKE`, mọi `CASE` bắt buộc có `ELSE title END` trên cột `NOT NULL`:
      1. `library_test`: cập nhật `title` và `updated_at` cho `skill = 'reading'` khớp `OLD_TITLE` (áp dụng cả `draft` lẫn `ready`).
      2. `assignment_test`: cập nhật `title` và `updated_at` cho `library_ref IS NOT NULL AND TRIM(library_ref, ...) <> ''`, `skill = 'reading'`, `TRIM(title, ...) = OLD_TITLE`, và bảo vệ provenance/orphan: `(EXISTS library_test lt WHERE lt.id = library_ref AND lt.skill = 'reading' AND TRIM(lt.title, ...) IN (OLD_TITLE, NEW_TITLE)) OR (NOT EXISTS library_test lt WHERE lt.id = library_ref)`.
      3. `library_test_part`: cập nhật `title` (khớp exact `OLD_TITLE`, mẫu `formatLibraryPartTitle` `<OLD_TITLE><ws> — P1/P2/P3` khớp đúng `UPPER(part)` khi `part IN ('p1','p2','p3')`, và tiền tố `Passage 1..3: ` / `Reading Passage 1..3: `) + `updated_at` với `EXISTS` tới `library_test` có `lt.skill = 'reading' AND TRIM(lt.title, ...) IN (OLD_TITLE, NEW_TITLE)`.
      4. `assignment_prompt`: cập nhật `title` (**không** chạm `updated_at` vì bảng không có cột này) với cùng bộ mẫu khớp chính xác theo `UPPER(assignment_prompt.part)`, `SUBSTR(library_ref, 1, 18) = 'library_test_part:'`, `TRIM(SUBSTR(library_ref, 19), ...) <> ''`, `skill = 'reading'`, và bảo vệ INF-03/orphan: `(EXISTS library_test_part ltp INNER JOIN library_test lt ... WHERE lt.skill = 'reading' AND TRIM(lt.title, ...) IN (OLD_TITLE, NEW_TITLE) AND assignment_prompt.part = ltp.part AND assignment_prompt.passage = ltp.passage) OR (NOT EXISTS library_test_part ltp WHERE ltp.id = SUBSTR(library_ref, 19))`.
    - Bổ sung `apps/server/src/reading-shares-title-migration.test.ts` kiểm chứng happy path đủ 4 bảng + đủ biến thể `P1/P2/P3` + `Passage 2:` + khoảng trắng `\t\r\n` + đường `materializePrompts` từ `library_test` có khoảng trắng đuôi, INF-03 isolation (kể cả `library_ref` trỏ đề Reading khác, `assignment_prompt` đã bị giáo viên sửa `passage`, và bản sao mồ côi `library_test` đã xóa), idempotency với mốc `updated_at` cố định, `PRAGMA foreign_key_check`, Drizzle `migrate()`, và HTTP API E2E (`GET /api/admin/library/tests?skill=reading`, `GET /api/admin/library/tests/:id`, `GET /api/student/practice?skill=reading`, `GET /api/student/practice/:testId/quiz`) trên org đã clone đủ đồ thị pre-migration lẫn org mới sync.
- **Explicit Non-Goals:**
  - Không sửa UI/API (`skill-catalog.tsx`, `test-table.tsx`, `student-practice.ts`, `admin-library.ts`) vì không gây lặp tiêu đề; không đổi `line-clamp-2` và không rút ngắn tiêu đề xuống 54 ký tự.
  - Không sửa `study_pack_exercise`, `class_assignment`, `assignment`, hay `quiz_attempt.questions_snapshot` (bảo toàn snapshot giao lớp & RT#3).
  - Không thêm logic ghi đè `assignment_test.title` trong `syncLibraryTestsToOrg` (tuyệt đối giữ INF-03).
  - Không tạo CLI import Reading mới và không chạy full E2E suite ở local (`AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Làm sạch tiêu đề và tên file của bài Reading `b8927676-3e2d-441d-97a7-12199ef4f2ba` trong `docs/reading-ielts/reading-practice/`, khóa kiểm chứng tự động cho 351 bài Reading và khai báo Turbo input để CI luôn chạy lại khi dataset đổi | P1 |
| 2 | Triển khai Drizzle migration `0091` an toàn cho SQLite/D1 để làm sạch `library_test`, `assignment_test`, `library_test_part` và `assignment_prompt` (idempotent, `NOT NULL`-safe, bảo toàn INF-03 & RT#3) kèm regression tests đầy đủ | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Reading Dataset Fix, Turbo Inputs & Integrity Tests](./phase-01-start.md) | Completed |
| 2 | [Phase 2: DB Migration 0091 & Full Verification Gates](./phase-02-db-migration-and-verification.md) | Completed |

## Acceptance Criteria

- [x] File `docs/reading-ielts/reading-practice/Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json` tồn tại (file tên lặp cũ đã xóa qua `git mv`), `"title"` = `"Investment in shares versus investment in other assets - which gives the greater gain?"` (86 ký tự), `"passage.title"` giữ nguyên `"Investment in shares versus investment in other assets"`, và toàn bộ nội dung `paragraphs` (11 phần tử chứa đủ nhãn `A.`..`G.`) + `question_groups` (3 nhóm, 13 câu) nguyên vẹn.
- [x] `docs/reading-ielts/reading-practice/_index.json` cập nhật đồng bộ `"file"` và `"title"` cho `id = "b8927676-3e2d-441d-97a7-12199ef4f2ba"`; `packages/db/src/seed/reading-library-dataset.test.ts` xác nhận 351/351 entry khớp file/id/title, helper phát hiện lặp bắt `OLD_TITLE` và chấp nhận `NEW_TITLE`, và 0 bài nào trong dataset bị lặp tiêu đề.
- [x] `packages/db/turbo.json` khai báo cross-package `tasks.test.inputs` cho `../../docs/reading-ielts/reading-practice/**` và `../../docs/listening_ielts/**`, được khóa kiểm chứng trong `scripts/ci-workflow.test.mjs` (`pnpm test:ci-workflow` pass).
- [x] Migration `packages/db/src/migrations/0091_fix_reading_shares_duplicated_title.sql` có 4 statement kết thúc `;` + `--> statement-breakpoint`, mọi `CASE` có `ELSE title END`, dùng `TRIM(..., ' ' || CHAR(9) || CHAR(10) || CHAR(13))`, không dùng `LIKE`; `meta/_journal.json` có entry `idx: 91` (`when > 1795583597884`, `breakpoints: true`); `meta/0091_snapshot.json` nối liền `prevId = "4bcf36e4-8fca-4892-8977-32e72f366b67"` từ `0090_snapshot.json`.
- [x] `apps/server/src/reading-shares-title-migration.test.ts` pass 100%: 4 bảng + đủ biến thể (`OLD_TITLE`, `P1/P2/P3`, `Passage 1..3:`, `Reading Passage 1..3:`, khoảng trắng `\t\r\n`, và `materializePrompts` từ `library_test` có khoảng trắng đuôi) cập nhật đúng qua cả `client.executeMultiple(rawSql)` lẫn Drizzle `migrate()`, INF-03 được bảo toàn (org-edited title, org-edited passage, org-created, wildcard spoof, wrong skill, unrelated Reading `library_test`), orphan copy khi `library_test` bị xoá được làm sạch, idempotency giữ nguyên mốc `updated_at` cố định trên lần chạy 2, `PRAGMA foreign_key_check` = 0, và 4 endpoint HTTP (`GET /api/admin/library/tests?skill=reading`, `GET /api/admin/library/tests/:id`, `GET /api/student/practice?skill=reading`, `GET /api/student/practice/:testId/quiz`) trả về tiêu đề sạch duy nhất 1 lần (khẳng định `assignment_prompt` gốc của `org-existing` được cập nhật tại chỗ).
- [x] Toàn bộ local gates pass 100%: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test:ci-workflow`, `pnpm --filter @teacher-os/db test`, `pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts`, và `pnpm --filter server exec vitest run src/reading-shares-title-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts`.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker) + Assumption Destroyer (Fact Checker) — 2 parallel hostile subagents (Light tier)
**Findings:** 7 deduplicated from 12 raw findings (7 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 6 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Provenance & INF-03 guards (`lt.title IN (OLD, NEW)`, `assignment_prompt.part = ltp.part`, `passage = ltp.passage`, ràng buộc `UPPER(part)`) kết hợp bảo toàn xử lý bản sao mồ côi khi `library_test` đã bị xoá (`NOT EXISTS`) | High | Accept | Plan, Phase 2 |
| 2 | `CASE TRIM(title) ... END` thiếu `ELSE title END` trên cột `NOT NULL` (`library_test_part.title`, `assignment_prompt.title`) và Test 1 thiếu `P1`/`P3` trên `library_test_part` | High | Accept | Plan, Phase 2 |
| 3 | Lệch khoảng trắng giữa `formatLibraryPartTitle` (không trim `testTitle`) vs SQLite `TRIM(title)` 1 tham số (không cắt `\t`/`\r`/`\n`), và thiếu biến thể tiền tố `Passage 1..3:` / `Reading Passage 1..3:` | High | Accept | Plan, Phase 2 |
| 4 | Lỗ hổng Turbo CI cache: thiếu `packages/db/turbo.json` khai báo `../../docs/reading-ielts/reading-practice/**` khiến CI có thể cache-hit bỏ qua `reading-library-dataset.test.ts` | High | Accept | Plan, Phase 1, Phase 2 |
| 5 | Rule phát hiện tiền tố lặp ở Phase 1 Task 1.1 Case 3 mô tả mơ hồ và có nguy cơ false-positive trên chính `NEW_TITLE` (`"investment in "` 14 ký tự lặp tại index 28) | High | Accept | Plan, Phase 1 |
| 6 | Test 4 API E2E thiếu seed đồ thị pre-migration (`assignment_prompt` + `assignment_test_part`) trên `org-existing` (bị `syncLibraryTestsToOrg` che lỗi Statement 4), thiếu wiring `student` / `adminEmails`, và thiếu kiểm chứng `GET /api/admin/library/tests/:id` + `GET /api/student/practice/:testId/quiz` | High | Accept | Plan, Phase 2 |
| 7 | `packages/ui/src/lib/inline-instruction.test.ts` chỉ đọc `docs/listening_ielts` (không đọc `reading-practice/`), và Step 3 vs Verify của Phase 2 Task 2.3 không khớp nhau | Medium | Accept | Plan, Phase 1, Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-db-migration-and-verification.md`
- Decision deltas checked: 7 (reconciled provenance/INF-03 + orphan `NOT EXISTS` branch across Statements 2–4; explicit full SQL with `ELSE title END` and `P1`/`P2`/`P3` coverage; 2-arg `TRIM` + suffix split + `Passage 1..3:`/`Reading Passage 1..3:` + `materializePrompts` test; added `packages/db/turbo.json` + `scripts/ci-workflow.test.mjs` + `pnpm test:ci-workflow`; exact variable-length prefix repeat algorithm + helper unit test; full Test 4 pre-migration graph + 4 HTTP endpoints + auth wiring; removed phantom `inline-instruction.test.ts` claim and aligned all Verify/Regression Gate/Acceptance Criteria)
- Reconciled stale references: 7/7 (0 stale claims or command mismatches remaining)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-25
- `ak plan validate`: `valid: true`, `errors: null`.
- Fact Checker verification across both Red Team reviewers verified 34 codebase claims; the 2 failed claims (`inline-instruction.test.ts` reading `reading-practice/` and missing `packages/db/turbo.json` cross-package inputs) were resolved and applied across `plan.md`, `phase-01-start.md`, and `phase-02-db-migration-and-verification.md`.
- Kongming post-plan-gates counsel: Conditional GO applied — updated `passage.paragraphs.length` assertion from `7` to `11` (with `A.`..`G.` label presence check) in `plan.md` and `phase-01-start.md`; empirically verified SQL `0091` (`SUBSTR(..., -5)` Unicode codepoint safety, `OR NOT EXISTS` orphan branches, `ELSE title END`) on `@libsql/client` `:memory:` and `packages/db/turbo.json` inheritance via `turbo --dry=json`.

### Verification Results
- **Tier:** Light (2 phases — Fact Checker across 2 parallel reviewers)
- **Claims checked:** 36
- **Verified:** 34 | **Failed:** 0 (2 original failures resolved and reconciled above) | **Unverified:** 0

<!-- slug: 882-fix-library-shares-duplicated-title -->
