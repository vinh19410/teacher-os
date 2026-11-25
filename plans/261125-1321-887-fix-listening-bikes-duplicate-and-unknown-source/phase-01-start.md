---
phase: 1
title: "Phase 1: Drizzle Migration 0092 (originally 0091) & Historical Review Safety"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Drizzle Migration 0091 & Historical Review Safety

<!-- Updated: Red-Team Session 1 - hardened canonical part/audio gate, exact INF-03 S1..S4 source match, custom test protection + deprecation note, Task 1.4 draft review safety for submitted attempts, Case 6 direct route assertions before sync, updated_at=500 sentinel, study-pack-migration.test.ts gate, and Risk & Rollback -->

## Goal

Tạo và kiểm chứng TDD cho Drizzle migration `0091_fix_listening_bikes_dedup_and_unknown_source.sql` nhằm hạ trạng thái (`draft`, kèm ghi chú deprecation) bản Listening `"Talking about the history of bikes"` thủ công legacy cùng các bản `assignment_test` copy khi bản canonical `lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3` đã `ready` có đủ part `s4` + `audio_key`; chuẩn hóa nhãn nguồn `'Unknown'` → `'Other sources'` an toàn INF-03 trên 4 bảng; và bảo toàn luồng xem chi tiết + nghe lại audio cho các `quiz_attempt` đã nộp trên đề `draft` trong `apps/server/src/routes/student-practice.ts`.

## Files to Create / Modify

- Create: `packages/db/src/migrations/0091_fix_listening_bikes_dedup_and_unknown_source.sql`
- Create: `packages/db/src/migrations/meta/0091_snapshot.json`
- Modify: `packages/db/src/migrations/meta/_journal.json`
- Modify: `apps/server/src/routes/student-practice.ts`
- Modify: `apps/server/src/routes/student-practice.test.ts`
- Create: `apps/server/src/listening-bikes-dedup-unknown-source-migration.test.ts`

## Tasks & Steps

### Task 1.1 — Scaffold empty custom Drizzle migration 0091
- **Goal:** Tạo bộ 3 tệp migration Drizzle `0091` hợp lệ (`0091_fix_listening_bikes_dedup_and_unknown_source.sql`, `meta/0091_snapshot.json` nối `prevId` từ `0090_snapshot.json`, và entry cuối `idx: 91` trong `meta/_journal.json`).
- **Target files and symbols:**
  - `packages/db/src/migrations/0091_fix_listening_bikes_dedup_and_unknown_source.sql`
  - `packages/db/src/migrations/meta/0091_snapshot.json`
  - `packages/db/src/migrations/meta/_journal.json`
- **Steps:**
  1. Chạy `pnpm --filter @teacher-os/db db:generate --custom --name=fix_listening_bikes_dedup_and_unknown_source` (không thêm `--` thừa trước `--custom` trên pnpm 10.33.1).
  2. Kiểm tra file `packages/db/src/migrations/0091_fix_listening_bikes_dedup_and_unknown_source.sql` đã được tạo.
  3. Kiểm tra `packages/db/src/migrations/meta/_journal.json` có entry cuối cùng là `idx: 91`, `tag: "0091_fix_listening_bikes_dedup_and_unknown_source"`, `breakpoints: true`, `when > 1795583597884` (entry 90).
  4. Kiểm tra `packages/db/src/migrations/meta/0091_snapshot.json` có `"prevId": "4bcf36e4-8fca-4892-8977-32e72f366b67"` và `"id"` là chuỗi khác rỗng, khác `"4bcf36e4-8fca-4892-8977-32e72f366b67"`.
- **Success criteria:** Cả 3 tệp migration `0091` tồn tại, đúng `idx`/`tag`/`id`/`prevId`/`when`, và nội dung SQL ban đầu rỗng.
- **Verify:** `node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync("packages/db/src/migrations/meta/_journal.json","utf8")); const e90=j.entries.find(e=>e.idx===90); const e91=j.entries.at(-1); const s91=JSON.parse(fs.readFileSync("packages/db/src/migrations/meta/0091_snapshot.json","utf8")); if(!e91||e91.idx!==91||e91.tag!=="0091_fix_listening_bikes_dedup_and_unknown_source"||!e91.breakpoints||!(e91.when>e90.when)||typeof s91.id!=="string"||!s91.id||s91.id==="4bcf36e4-8fca-4892-8977-32e72f366b67"||s91.prevId!=="4bcf36e4-8fca-4892-8977-32e72f366b67") process.exit(1); console.log("0091_SCAFFOLD_OK");'` exits 0 and prints `0091_SCAFFOLD_OK`.

### Task 1.2 — Write TDD Red tests for draft-test historical review & migration 0091
- **Goal:** Viết bộ test TDD đầy đủ cho cả (a) bảo toàn `/quiz` và `/audio` cho học viên đã có `submitted` attempt trên đề `draft` và (b) migration `0091`, rồi xác nhận test FAIL (Red phase) trước khi viết code và SQL.
- **Target files and symbols:**
  - `apps/server/src/routes/student-practice.test.ts` (describe `"student practice (#378 phase 10)"`)
  - `apps/server/src/listening-bikes-dedup-unknown-source-migration.test.ts` (mirror `apps/server/src/listening-bikes-q5-migration.test.ts`)
- **Steps:**
  1. Trong `apps/server/src/routes/student-practice.test.ts`, thêm test case kiểm chứng:
     - Học viên có `quiz_attempt` `mode = 'practice'` và `status = 'submitted'` trên một đề `assignment_test` Listening sau đó bị chuyển `status = 'draft'`:
       - `GET /api/student/practice/:testId/quiz` trả `200` (để màn `/learn/quizzes/attempt/$attemptId/detail` tải được chrome).
       - `GET /api/student/practice/:testId/audio` trả `200` (nghe lại audio khi review).
       - `POST /api/student/practice/:testId/attempts` vẫn trả `404` (không thể bắt đầu lượt làm mới trên đề `draft`).
     - Học viên khác trong cùng org (chưa từng nộp bài trên đề `draft` đó) gọi `GET /quiz`, `GET /audio`, `POST /attempts` đều nhận `404`.
  2. Tạo `apps/server/src/listening-bikes-dedup-unknown-source-migration.test.ts` áp các migration tới `0090_concerned_mach_iv.sql` và kiểm thử 6 kịch bản độc lập:
     - **Case 1 (Happy path + Alchemy `executeMultiple` + `/history` & `study_pack_item` preservation):** Seed canonical `lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3` (`status='ready'`, `collection='Unknown'`, `test_group='Section 4'`) + part `lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4` (`part='s4'`, `source='Unknown — Section 4'`, `audio_key='library-listening/83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3.mp3'`), thêm 1 đề `lib-listen-0c07c56f-6946-41fd-97e0-06001b159046` (`collection='  unknown  '`, part `s1`, `source='Unknown'`), 2 bản thủ công legacy: `manual-bikes-legacy-id` (`skill='listening'`, `status='ready'`, `title='  Talking About The History Of Bikes\u00a0'`, `collection=NULL`, `test_group=NULL`, `description='Old note'`) và `manual-bikes-s4-group-id` (`skill='listening'`, `status='ready'`, `title='Talking about the history of bikes\r'`, `collection=''`, `test_group='Section 4'`, `description=NULL`), kèm part `s4` và 1 `study_pack_item` trỏ tới part đó, cộng các bản sao `assignment_test` + `assignment_prompt` trên `org-1` (gồm cả 1 bản `assignment_test` dangling `library_ref='deleted-manual-bikes-id'`, `collection=NULL`, `test_group='S4'`, title `"Talking about the history of bikes"`, chỉ có part `s4`), và 1 `quiz_attempt` (`mode='practice'`, `status='submitted'`) gắn `test_id` của bản `assignment_test` legacy. Chạy `client.executeMultiple(rawSql)` trên file `0091`. Assert:
       - Cả `manual-bikes-legacy-id` và `manual-bikes-s4-group-id` chuyển thành `status='draft'`, `description` tương ứng là `'[Duplicate of lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3] Old note'` và `'[Duplicate of lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3]'` (không dư dấu cách), part và `study_pack_item` còn nguyên vẹn.
       - Cả bản `assignment_test` copy của `manual-bikes-legacy-id` lẫn bản dangling `deleted-manual-bikes-id` chuyển thành `status='draft'`.
       - `quiz_attempt.test_id` vẫn khác `NULL` và query `INNER JOIN assignment_test` vẫn trả đúng attempt đó.
       - Canonical `library_test` + sibling `lib-listen-*` có `collection = 'Other sources'`, `library_test_part.source` thành `'Other sources — Section 4'` và `'Other sources'`, bản `assignment_test` canonical trên `org-1` có `collection = 'Other sources'`, và `assignment_prompt.source` trên `org-1` thành `'Other sources — Section 4'` và `'Other sources'`.
       - `PRAGMA foreign_key_check` trả 0 dòng.
     - **Case 2 (Canonical fail-closed gates — 4 biến thể):**
       - (2a) Không có canonical `lib-listen-83a7d7c9-...` → bản legacy và bản copy giữ nguyên `status='ready'`.
       - (2b) Canonical có `status='draft'` → giữ nguyên `status='ready'`.
       - (2c) Canonical có `status='ready'` nhưng **thiếu** `library_test_part` (`s4`) → giữ nguyên `status='ready'`.
       - (2d) Canonical có `status='ready'` và có part `s4` nhưng `audio_key` là `NULL` hoặc `'   '` → giữ nguyên `status='ready'`.
     - **Case 3 (INF-03, custom tests & anti-spoof protection — tách `org_id`):** Seed đầy đủ canonical + các dòng phải được **giữ nguyên hoàn toàn**:
       - (3a) Đề tự soạn của giáo viên (`library_ref = NULL`, `title = 'Talking about the history of bikes'`, `collection = 'Unknown'`, `status = 'ready'`).
       - (3b) Đề Listening custom trong `library_test` (non-`lib-listen-`, cùng title, `collection = 'Mock Exam 2026'`, `test_group = 'Test 1'`, `status = 'ready'`).
       - (3c) Đề Listening multi-part trong `library_test` (non-`lib-listen-`, cùng title, `collection = NULL`, có thêm part `s1` ngoài `s4`).
       - (3d) Bản sao `assignment_test` của đề `Cambridge IELTS 18` (`lib-listen-*` có `lt.collection = 'Cambridge IELTS 18'`) mà giáo viên tự sửa `collection = 'Unknown'`.
       - (3e) Bản sao `assignment_test` canonical mà giáo viên đã đổi `collection = 'Bộ đề riêng của lớp'`, và `assignment_prompt` mà giáo viên đã sửa `source = 'Unknown — Ghi chú riêng lớp 7A'` hoặc chuỗi dài 200 ký tự `'Unknown — ' + 'a'.repeat(190)`.
       - (3f) Đề `lib-listen-*` có `library_test_part.source = 'Unknown Artist — Section 1'` và đề Reading (`skill = 'reading'`) trùng tiêu đề.
       - (3g) `assignment_prompt` giả mạo wildcard `library_ref = 'libraryXtestYpart:lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'`.
       Chạy `0091` và assert **mọi dòng 3a–3g hoàn toàn không thay đổi**.
     - **Case 4 (Idempotency với sentinel `updated_at = 500 → 1000`):** Seed tường minh `updated_at = 500` trước lần chạy 1 trên `library_test`, `library_test_part`, `assignment_test`; chạy `0091` lần 1, assert `updated_at > 500`; đặt lại `updated_at = 1000` trên các dòng đã đổi; chạy `0091` lần 2; assert tất cả `updated_at` vẫn bằng `1000`, `description` không bị gắn lặp tiền tố `[Duplicate of ...]`, và giá trị không đổi.
     - **Case 5 (Drizzle `migrate()` upgrade path 0090 → 0091):** Áp tới `0090_concerned_mach_iv.sql`, seed `__drizzle_migrations` với `entry90.when`, seed dữ liệu mẫu, chạy `migrate(db, { migrationsFolder: MIGRATIONS_DIR })` và assert cả 4 bảng cập nhật chính xác.
     - **Case 6 (End-to-end Student Practice API — test route trực tiếp TRƯỚC catalog sync):** Seed trước migration cả bản `library_test` + bản `assignment_test`/`assignment_test_part`/`assignment_prompt` đã sync cho legacy Bikes và canonical Bikes (`Unknown`), kèm 2 học viên trên `org-1` (`stu-submitted` đã có `quiz_attempt` `submitted` trên legacy copy; `stu-fresh` chưa có attempt). Áp `0091`. **Trước khi** gọi `GET /api/student/practice`:
       - `stu-fresh` gọi `GET /api/student/practice/:legacyCopyId/quiz`, `/audio`, và `POST .../attempts` → cả 3 đều trả `404` (chứng minh Statement 2 thực sự chạy mà không nhờ `syncLibraryTestsToOrg`).
       - `stu-submitted` gọi `GET /api/student/practice/:legacyCopyId/quiz` và `/audio` → cả 2 trả `200` (màn review chi tiết + audio hoạt động); gọi `POST .../attempts` → trả `404` (chặn retake trên đề nháp).
       - Sau đó gọi `GET /api/student/practice?skill=listening&facets=1` → assert `total === 1`, `items[0].title === "Talking about the history of bikes"`, `items[0].collection === "Other sources"`, `items[0].testGroup === "Section 4"`, và `facets.collections` bằng `["Other sources"]` (không còn `"Unknown"`).
  3. Chạy Vitest trên file test migration mới để xác nhận Red phase.
- **Success criteria:** Test file biên dịch sạch và FAIL đúng do migration `0091` chưa có SQL và `student-practice.ts` chưa mở đọc draft cho học viên đã nộp bài.
- **Verify:** `pnpm --filter server test src/listening-bikes-dedup-unknown-source-migration.test.ts` exits non-zero with assertion failure (Red phase; passing test here is a failure).

### Task 1.3 — Implement the 6 SQL statements in migration 0091 (Green phase — DB)
- **Goal:** Viết đủ 6 câu SQL idempotent, an toàn INF-03, không tràn `max(200)`, tương thích Alchemy flat D1 runner & Drizzle migrator trong `packages/db/src/migrations/0091_fix_listening_bikes_dedup_and_unknown_source.sql`.
- **Target files and symbols:**
  - `packages/db/src/migrations/0091_fix_listening_bikes_dedup_and_unknown_source.sql`
- **Steps:**
  1. Ghi 6 câu `UPDATE` phân tách bằng `--> statement-breakpoint`, mỗi câu kết thúc bằng `;`:
     - **Statement 1 (`library_test` demote + deprecation note):**
       - Điều kiện canonical fail-closed (dùng chung cho Statement 1 & 2):
         ```sql
         EXISTS (
         	SELECT 1
         	FROM `library_test` canonical
         	INNER JOIN `library_test_part` cp ON cp.`test_id` = canonical.`id`
         	WHERE canonical.`id` = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'
         		AND canonical.`skill` = 'listening'
         		AND canonical.`status` = 'ready'
         		AND cp.`id` = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'
         		AND cp.`part` = 's4'
         		AND cp.`audio_key` IS NOT NULL
         		AND TRIM(cp.`audio_key`) <> ''
         )
         ```
       - Chuẩn hóa tiêu đề trước khi so: `LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(title, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'talking about the history of bikes'`.
       - Ràng buộc bản legacy PR #843: `skill = 'listening' AND status = 'ready' AND id <> 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3' AND SUBSTR(id, 1, 11) <> 'lib-listen-' AND COALESCE(TRIM(collection), '') = '' AND LOWER(TRIM(COALESCE(test_group, ''))) IN ('', 'section 4', 's4') AND NOT EXISTS (SELECT 1 FROM library_test_part p WHERE p.test_id = library_test.id AND p.part <> 's4')`.
       - `SET status = 'draft'`, `description` nối tiền tố `'[Duplicate of lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3]'` (nhánh riêng không dư dấu cách khi `TRIM(COALESCE(description, '')) = ''`, kẹp `SUBSTR(..., 1, 2000)`, idempotent theo `INSTR`), và `updated_at = cast(unixepoch('subsecond') * 1000 as integer)`.
     - **Statement 2 (`assignment_test` demote):**
       - `UPDATE assignment_test SET status = 'draft', updated_at = cast(unixepoch('subsecond') * 1000 as integer)` với `skill = 'listening' AND status = 'ready' AND library_ref IS NOT NULL AND TRIM(library_ref) <> '' AND library_ref <> 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3' AND SUBSTR(library_ref, 1, 11) <> 'lib-listen-'`, cổng canonical `EXISTS` giống Statement 1, và nhánh khớp:
         - `EXISTS (SELECT 1 FROM library_test legacy WHERE legacy.id = assignment_test.library_ref AND legacy.skill = 'listening' AND legacy.status <> 'ready' AND SUBSTR(legacy.id, 1, 11) <> 'lib-listen-' AND COALESCE(TRIM(legacy.collection), '') = '' AND LOWER(TRIM(COALESCE(legacy.test_group, ''))) IN ('', 'section 4', 's4') AND LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(legacy.title, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'talking about the history of bikes' AND NOT EXISTS (SELECT 1 FROM library_test_part p WHERE p.test_id = legacy.id AND p.part <> 's4'))`
         - `OR (COALESCE(TRIM(collection), '') = '' AND LOWER(TRIM(COALESCE(test_group, ''))) IN ('', 'section 4', 's4') AND LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(title, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'talking about the history of bikes' AND NOT EXISTS (SELECT 1 FROM assignment_test_part p WHERE p.test_id = assignment_test.id AND p.part <> 's4') AND NOT EXISTS (SELECT 1 FROM library_test lt WHERE lt.id = assignment_test.library_ref))`.
     - **Statement 3 (`library_test.collection` Unknown → Other sources):**
       - `UPDATE library_test SET collection = 'Other sources', updated_at = cast(unixepoch('subsecond') * 1000 as integer)` với `SUBSTR(id, 1, 11) = 'lib-listen-' AND skill = 'listening' AND LOWER(TRIM(COALESCE(collection, ''))) = 'unknown'`.
     - **Statement 4 (`library_test_part.source` Unknown / Unknown — Section 1..4 → Other sources):**
       - `UPDATE library_test_part SET source = CASE WHEN LOWER(TRIM(source)) = 'unknown' THEN 'Other sources' ELSE 'Other sources — Section ' || SUBSTR(part, 2) END, updated_at = cast(unixepoch('subsecond') * 1000 as integer)` với `SUBSTR(id, 1, 16) = 'lib-listen-part-' AND SUBSTR(test_id, 1, 11) = 'lib-listen-' AND EXISTS (SELECT 1 FROM library_test lt WHERE lt.id = library_test_part.test_id AND lt.skill = 'listening' AND lt.collection = 'Other sources') AND (LOWER(TRIM(source)) = 'unknown' OR (part IN ('s1', 's2', 's3', 's4') AND LOWER(TRIM(source)) = 'unknown — section ' || SUBSTR(part, 2)))`.
     - **Statement 5 (`assignment_test.collection` Unknown → Other sources, INF-03 safe):**
       - `UPDATE assignment_test SET collection = 'Other sources', updated_at = cast(unixepoch('subsecond') * 1000 as integer)` với `library_ref IS NOT NULL AND SUBSTR(library_ref, 1, 11) = 'lib-listen-' AND skill = 'listening' AND LOWER(TRIM(COALESCE(collection, ''))) = 'unknown' AND EXISTS (SELECT 1 FROM library_test lt WHERE lt.id = assignment_test.library_ref AND lt.skill = 'listening' AND lt.collection = 'Other sources')`.
     - **Statement 6 (`assignment_prompt.source` Unknown / Unknown — Section 1..4 → Other sources, INF-03 safe, KHÔNG `updated_at`):**
       - `UPDATE assignment_prompt SET source = CASE WHEN LOWER(TRIM(source)) = 'unknown' THEN 'Other sources' ELSE 'Other sources — Section ' || SUBSTR(part, 2) END` với `library_ref IS NOT NULL AND SUBSTR(library_ref, 1, 18) = 'library_test_part:' AND SUBSTR(library_ref, 19, 16) = 'lib-listen-part-' AND skill = 'listening' AND (LOWER(TRIM(source)) = 'unknown' OR (part IN ('s1', 's2', 's3', 's4') AND LOWER(TRIM(source)) = 'unknown — section ' || SUBSTR(part, 2))) AND EXISTS (SELECT 1 FROM library_test_part ltp INNER JOIN library_test lt ON lt.id = ltp.test_id WHERE ltp.id = SUBSTR(assignment_prompt.library_ref, 19) AND lt.skill = 'listening' AND lt.collection = 'Other sources' AND ltp.part = assignment_prompt.part AND ltp.source = CASE WHEN LOWER(TRIM(assignment_prompt.source)) = 'unknown' THEN 'Other sources' ELSE 'Other sources — Section ' || SUBSTR(assignment_prompt.part, 2) END)`.
  2. Chuyển sang Task 1.4 để hoàn thiện nhánh review lịch sử trên `student-practice.ts` rồi chạy bộ Verify của Phase 1.
- **Success criteria:** File `0091_fix_listening_bikes_dedup_and_unknown_source.sql` chứa đúng 6 câu `UPDATE` hợp lệ, tuân thủ INF-03 và không có `updated_at` ở Statement 6.
- **Verify:** no verification needed (verified together with Task 1.4 immediately below).

### Task 1.4 — Preserve historical attempt review detail & audio for demoted/draft practice tests (Green phase — Server)
- **Goal:** Cho phép học viên đã nộp `quiz_attempt` trên một `assignment_test` tự luyện bị hạ `draft` vẫn mở được `GET /api/student/practice/:testId/quiz` và `GET /api/student/practice/:testId/audio` từ màn `/learn/quizzes/attempt/$attemptId/detail`, trong khi vẫn chặn cứng `404` đối với học viên chưa từng nộp bài và chặn cứng `POST /api/student/practice/:testId/attempts`.
- **Target files and symbols:**
  - `apps/server/src/routes/student-practice.ts` (`loadPracticeTestWithParts`, `GET /practice/:testId/quiz`, `GET /practice/:testId/audio`, `POST /practice/:testId/attempts`)
- **Steps:**
  1. Trong `apps/server/src/routes/student-practice.ts:189-227`, mở rộng `loadPracticeTestWithParts(db, orgId, testId, options?: { allowDraft?: boolean })`: mặc định vẫn áp `eq(assignmentTest.status, "ready")`; chỉ bỏ filter `status = "ready"` khi `options?.allowDraft === true`.
  2. Viết helper nội bộ `loadPracticeTestForRead(db, orgId, studentId, testId)`:
     - Gọi `loadPracticeTestWithParts(db, orgId, testId)` trước (fast-path cho đề `ready`, 0 query phụ).
     - Nếu `null`, kiểm tra 1 query nhẹ: có tồn tại `quiz_attempt` với `orgId`, `studentId`, `testId`, `mode = "practice"`, `status = "submitted"` hay không (`limit(1)`).
     - Chỉ khi tồn tại, gọi lại `loadPracticeTestWithParts(db, orgId, testId, { allowDraft: true })`; nếu không, trả `null` (giữ `404` bảo vệ đề nháp của giáo viên).
  3. Dùng `loadPracticeTestForRead` trong `GET /practice/:testId/quiz` (line 703) và `GET /practice/:testId/audio` (line 747 — trích `{ student: s, orgId } = c.get("studentCtx")`). **Giữ nguyên** `loadPracticeTestWithParts(db, orgId, testId)` (strict `ready`) trong `POST /practice/:testId/attempts` (line 787).
  4. Chạy toàn bộ test Phase 1 (`listening-bikes-dedup-unknown-source-migration.test.ts`, `listening-bikes-q5-migration.test.ts`, `study-pack-migration.test.ts`, `student-practice.test.ts`, và `packages/infra/src/flat-migrations.test.ts`).
- **Success criteria:** Toàn bộ test migration `0091`, hồi quy `0089`, chuỗi snapshot `#554`, `student-practice.test.ts`, và `flat-migrations.test.ts` pass 100%.
- **Verify:** `pnpm --filter server test src/listening-bikes-dedup-unknown-source-migration.test.ts src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice.test.ts && pnpm --filter @teacher-os/infra test src/flat-migrations.test.ts` exits 0 and prints `passed`.

## Risk & Rollback

- **Danh sách 9 `lib-listen-<uuid>` được chuyển `'Unknown'` → `'Other sources'` (ghim sẵn để rollback chọn lọc mà không chạm 17 đề `'Other sources'` nguyên bản):**
  1. `lib-listen-0c07c56f-6946-41fd-97e0-06001b159046` (`s1` — Advice)
  2. `lib-listen-2317b6ae-c6c9-4072-88f7-146c5d9a64d5` (`s1` — Coffee and Donuts)
  3. `lib-listen-c3323773-3e7a-4f0d-8e80-75faf31e9088` (`s1` — Halloween)
  4. `lib-listen-7ef7016d-762c-44c6-9272-25137db27e7d` (`s1` — Henry Ford)
  5. `lib-listen-c09e15d9-6342-434b-895d-c421b35fc982` (`s1` — Memories – Listening Comprehension)
  6. `lib-listen-3266b5ce-3c01-401c-8cd1-e37a33156c8e` (`s1` — Shopping at the mall)
  7. `lib-listen-a9a49589-fa69-4b9f-9b4d-b0ae34f61e9a` (`s1` — Summertime)
  8. `lib-listen-bf104c60-0799-4a0d-b0cc-6dd5b3bc8588` (`s1` — The future)
  9. `lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3` (`s4` — Talking about the history of bikes)
- **Rollback bản legacy đã demote:** lọc `library_test` chứa `'[Duplicate of lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3]'` trong `description` → gỡ tiền tố và bật lại `status = 'ready'` (khi cần), `syncLibraryTestsToOrg` tự bật lại bản sao `assignment_test`.
- **Lưu ý vòng đời Staging & Production:**
  - Migration D1 của Alchemy là forward-only chạy 1 lần (`packages/infra/src/flat-migrations.ts:8-9`). Sau khi deploy Staging, cần kiểm chứng trực quan trên `/student/practice/listening` (tìm `"Talking about the history of bikes"` chỉ hiện 1 lần với `"Other sources · Section 4"`, dropdown `"Bộ đề"` không còn `"Unknown"`).
  - Trên Production, nếu bộ 498 đề Listening được promote sau khi `0091` đã áp dụng (no-op do chưa có canonical), workflow/script promote Listening sang Production về sau cần tích hợp bước kiểm tra/dedup tương ứng thay vì dựa vào `0091`.

## Verification

- `pnpm --filter server test src/listening-bikes-dedup-unknown-source-migration.test.ts src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice.test.ts`
- `pnpm --filter @teacher-os/infra test src/flat-migrations.test.ts`

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
