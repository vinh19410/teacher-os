---
phase: 1
title: "Phase 1: Bikes Q5 Source JSON & Drizzle Migration 0089"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Bikes Q5 Source JSON & Drizzle Migration 0089

<!-- Updated: Red-Team Review 2026-11-24 - Added alts/json_type/nested CASE WHEN guards, table-cell REPLACE scoping, Statement 1 WHERE consistency, drizzle-kit exec syntax, Alchemy executeMultiple + Drizzle migrate() + fixed updated_at + distinct org_id test cases -->

## Goal
Đồng bộ sửa ô bảng Q5 đề *Talking about the history of bikes* từ `easier and [5] ride` sang `easier; ride [5]` (giữ nguyên key `"more smoothly"` khớp audio) ở cả file dataset nguồn JSON lẫn dữ liệu D1 (`library_test_part` và `assignment_prompt` chưa bị chỉnh tay) qua migration `0089` an toàn, idempotent, tương thích cả Alchemy flat D1 runner lẫn Drizzle `migrate()`, kèm test TDD đầy đủ.

## Files to Create / Modify
- Modify: `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json`
- Create: `packages/db/src/migrations/0089_fix_listening_bikes_q5_blank.sql`
- Create: `packages/db/src/migrations/meta/0089_snapshot.json`
- Modify: `packages/db/src/migrations/meta/_journal.json`
- Create: `apps/server/src/listening-bikes-q5-migration.test.ts`
- Modify: `packages/db/src/seed/listening-library.test.ts`

## Tasks & Steps

### Task 1.1 — Viết TDD tests cho Bikes Q5 dataset & migration `0089` (Red phase)
- **Goal:** Tạo bộ test TDD kiểm chứng yêu cầu Bikes Q5 ở tầng dataset (`listening-library.test.ts`) và tầng D1 migration (`listening-bikes-q5-migration.test.ts`), chạy thất bại trước khi sửa dữ liệu và tạo migration.
- **Target files and symbols:**
  - `packages/db/src/seed/listening-library.test.ts` (thêm test đọc `Unknown-S4-talking-about-the-history-of-bikes.json` qua `transformListeningFile`)
  - `apps/server/src/listening-bikes-q5-migration.test.ts` (tạo mới theo pattern `apps/server/src/assignment-prompt-groups-backfill-migration.test.ts`)
- **Steps:**
  1. Trong `packages/db/src/seed/listening-library.test.ts`, thêm test kiểm tra `Unknown-S4-talking-about-the-history-of-bikes.json` qua `transformListeningFile`:
     - `item.status === "ready"`
     - `item.testId === "lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3"`
     - `item.partId === "lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4"`
     - `item.part.questions[4]?.stem === "easier; ride ____"`
     - `item.part.questions[4]?.answer === "more smoothly"` và `alts === ""`
     - `item.part.groups[0]?.instruction` chứa `<td><p>easier; ride <strong>(5)</strong></p></td>` và không chứa `easier and <strong>(5)</strong> ride`.
  2. Tạo `apps/server/src/listening-bikes-q5-migration.test.ts`:
     - Dựng helper apply tuần tự toàn bộ migration tới `0088_nostalgic_arachne.sql` trên libsql in-memory (`file::memory:`), sau đó hỗ trợ chạy `0089_fix_listening_bikes_q5_blank.sql` bằng cả 3 đường: (a) tách `--> statement-breakpoint`, (b) `client.executeMultiple(rawSql)` mô phỏng Alchemy flat D1 runner (`packages/infra/src/flat-migrations.ts`), và (c) `drizzle-orm/libsql/migrator` nâng cấp DB đã seed từ `0088` lên `0089` (kèm assert `_journal.json` entry `idx === 89` có `when > entry[88].when` và `breakpoints === true`).
     - **Test case 1 (Happy path `library_test_part` + `assignment_prompt` + Alchemy `executeMultiple`):** seed `org-1` và `org-pre85`, `library_test` (`id = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'`, `skill = 'listening'`, `status = 'ready'`), `library_test_part` (`id = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'`, `part = 's4'`, `questions[4]` có `stem = 'easier and ____ ride'`, `answer = 'more smoothly'`, `alts = ''`, `type = 'tablecomp'`, `groups[0].instruction` chứa `<td><p>easier and <strong>(5)</strong> ride</p></td>`, `intro = ''`), `assignment_prompt` trên `org-1` (có `groups` + `intro` chứa ô bảng cũ + kèm 1 `quiz_attempt` lịch sử để xác nhận chính sách vẫn cập nhật `assignment_prompt` chưa chỉnh tay cho các lượt tự luyện sau nhưng không chạm `quiz_attempt.questions_snapshot`), và `assignment_prompt` trên `org-pre85` (pre-0085: `groups = '[]'`, `intro` chứa ô bảng cũ, `questions[4].stem` chứa chuỗi cũ). Chạy `client.executeMultiple(rawSql)` và xác nhận:
       - `library_test_part.questions[4].stem === 'easier; ride ____'`, `groups[0].instruction` chứa `<td><p>easier; ride <strong>(5)</strong></p></td>`, `questions[4].answer === 'more smoothly'`, `alts === ''`, các câu khác và `groups[1]` nguyên vẹn.
       - `assignment_prompt` trên `org-1`: `questions[4].stem === 'easier; ride ____'`, cả `groups[0].instruction` lẫn `intro` cập nhật đúng ô bảng; `quiz_attempt.questions_snapshot` giữ nguyên bản gốc (RT#3).
       - `assignment_prompt` trên `org-pre85`: `questions[4].stem` và `intro` cập nhật đúng, `groups` giữ nguyên `'[]'`.
     - **Test case 2 (INF-03 isolation — mỗi biến thể seed một `org_id` riêng `org-2`..`org-8` để tránh đụng `UNIQUE(org_id, library_ref)`):**
       - `org-2`: giáo viên thêm `questions[4].alts = 'smoother'` (giữ nguyên `stem`/`answer`) → bỏ qua toàn bộ row (không chạm `questions`, `groups`, `intro`).
       - `org-3`: giáo viên đổi `questions[4].answer = 'smoother'` → bỏ qua toàn bộ row.
       - `org-4`: giáo viên sửa `questions[4].stem` sang wording riêng → bỏ qua toàn bộ row.
       - `org-5`: giáo viên tự viết lại `intro` hoặc chỉ trích dẫn chuỗi trần `"easier and <strong>(5)</strong> ride"` trong ghi chú ngoài `<td><p>...</p></td>` → bỏ qua (không `REPLACE` ngoài ô bảng).
       - `org-6`: giáo viên sửa `groups[0].instruction` sang wording khác → bỏ qua toàn bộ row.
       - `org-7`: `library_ref` khác / `NULL` / wildcard spoof `'libraryXtestYpart:...'` hoặc `skill != 'listening'` → không đụng tới.
       - `library_test_part` mà admin đã tự sửa `groups[0].instruction` sang wording khác (không chứa ô bảng cũ hay mới) → Statement 1 bỏ qua (không split-brain sửa mỗi `questions`).
     - **Test case 3 (Corrupt JSON toàn phần & một phần trên CẢ `library_test_part` lẫn `assignment_prompt`):**
       - Kiểm tra riêng trên DB memory:
         - `assignment_prompt` có `questions = '{corrupt'`, `groups = '{corrupt'` → không throw, giữ nguyên.
         - `assignment_prompt` có `questions` hợp lệ khớp chuỗi cũ NHƯNG `groups` là `'{corrupt'` / `'{"a":1}'` / `'[123]'` / `'[{"id":"g1"}]'` (thiếu `instruction`) → không throw `malformed JSON`, bỏ qua an toàn không ghi `null` vào `groups[0].instruction`.
         - `library_test_part` có `questions` hợp lệ khớp chuỗi cũ NHƯNG `groups = '{corrupt'` hoặc `groups = '[{"id":"g1"}]'` → không throw, không split-brain.
         - `questions[4].answer = 123` / `questions[4].stem = null` (type affinity trap) → không throw, bỏ qua.
     - **Test case 4 (Idempotency thật & FK check & Drizzle `migrate()`):**
       - Sau lần chạy 1, chủ động `UPDATE library_test_part SET updated_at = 1000 WHERE id = ...`, rồi chạy lại `0089` lần 2 → xác nhận `updated_at` vẫn bằng `1000` (0 row bị ghi lại), dữ liệu không đổi, và `PRAGMA foreign_key_check` trả 0 dòng.
       - Trên một DB memory sạch khác, chạy Drizzle `migrate()` tới `0088`, seed dữ liệu cũ, chạy tiếp `drizzle-orm/libsql/migrator` (`migrate()`) → xác nhận `0089` được thực thi và cập nhật đúng.
- **Success criteria:** Cả 2 file test chạy thất bại đúng lý do Red (JSON nguồn vẫn là `easier and [5] ride` và migration `0089` chưa tồn tại).
- **Verify:** `pnpm --filter @teacher-os/db exec vitest run src/seed/listening-library.test.ts` exits non-zero with assertion failure on `easier; ride ____` AND `pnpm --filter server exec vitest run src/listening-bikes-q5-migration.test.ts` exits non-zero locating `0089_fix_listening_bikes_q5_blank.sql` (passing test is a failure).

### Task 1.2 — Cập nhật 6 vị trí trong JSON nguồn Bikes Q5
- **Goal:** Sửa đồng bộ 6 vị trí `"easier and [5] ride"` → `"easier; ride [5]"` trong `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json` mà không làm thay đổi đáp án, transcript, quotes hay nhóm Q8–10.
- **Target files and symbols:** `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json` (lines 12, 13, 20, 32, 48, 82)
- **Steps:**
  1. Trong `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json`, thay chính xác 6 chỗ `"easier and [5] ride"` thành `"easier; ride [5]"`:
     - `body.text` (line 12)
     - `body.html` (line 13)
     - `question_groups[0].body` (line 20)
     - `question_groups[0].body_table[2][2]` (line 32)
     - `question_groups[0].body_html` (line 48)
     - `question_groups[0].questions[4].text` (line 82)
  2. Xác nhận `question_groups[0].questions[4].answer` vẫn là `"more smoothly"`, `quotes` và `transcript` giữ nguyên, và không còn bất kỳ chuỗi `"easier and [5] ride"` nào trong file.
- **Success criteria:** JSON hợp lệ, đúng 6 chỗ đã cập nhật, test dataset `listening-library.test.ts` pass.
- **Verify:** `pnpm --filter @teacher-os/db exec vitest run src/seed/listening-library.test.ts` exits 0 and reports all tests passed.

### Task 1.3 — Tạo migration `0089`, snapshot `0089` và cập nhật `_journal.json` (Green phase)
- **Goal:** Sinh migration SQL `0089_fix_listening_bikes_q5_blank.sql` an toàn cho SQLite/D1 (cả Alchemy flat runner lẫn Drizzle `migrate()`) cùng Drizzle snapshot `meta/0089_snapshot.json` nối liền chuỗi `prevId` từ `0088_snapshot.json` và entry `idx: 89` (`when > 1795538532220`) trong `meta/_journal.json`.
- **Target files and symbols:**
  - `packages/db/src/migrations/0089_fix_listening_bikes_q5_blank.sql`
  - `packages/db/src/migrations/meta/0089_snapshot.json`
  - `packages/db/src/migrations/meta/_journal.json`
- **Steps:**
  1. Xác nhận `id` của `packages/db/src/migrations/meta/0088_snapshot.json` là `"01c8de55-ee46-4d4c-8fea-5bb51674306b"` và `when` của entry `88` trong `meta/_journal.json` là `1795538532220`.
  2. Chạy `pnpm --filter @teacher-os/db exec drizzle-kit generate --custom --name=fix_listening_bikes_q5_blank` (KHÔNG truyền dấu `--` thừa sau `db:generate` vì pnpm 10 không nuốt `--`). Kiểm tra file `0089_fix_listening_bikes_q5_blank.sql` và `meta/_journal.json` (đảm bảo `idx: 89`, `when > 1795538532220`, `breakpoints: true`). Nếu `--custom` không tạo `meta/0089_snapshot.json`, sao chép `packages/db/src/migrations/meta/0088_snapshot.json` sang `packages/db/src/migrations/meta/0089_snapshot.json`, đổi `"id"` thành UUID v4 mới và đặt `"prevId": "01c8de55-ee46-4d4c-8fea-5bb51674306b"`.
  3. Viết 2 statement (CẢ HAI kết thúc bằng `;` và phân tách bằng `--> statement-breakpoint`) vào `packages/db/src/migrations/0089_fix_listening_bikes_q5_blank.sql`, dùng **chuỗi HTML ô bảng chính xác** `'<td><p>easier and <strong>(5)</strong> ride</p></td>'` → `'<td><p>easier; ride <strong>(5)</strong></p></td>'` và dùng **nested 2-tầng `CASE WHEN json_valid(col) = 1 THEN (CASE WHEN ... END) END`** cho MỌI hàm JSON1 (`json_type`, `json_array_length`, `json_extract`, `json_set`):
     - **Statement 1 (`UPDATE library_test_part`):**
       - Định vị PK chính xác: `id = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'` AND `test_id = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'` AND `part = 's4'` AND `EXISTS (SELECT 1 FROM library_test lt WHERE lt.id = library_test_part.test_id AND lt.skill = 'listening')`.
       - Guard `questions` trong `WHERE` (nested `CASE WHEN`): `questions` là array length = 10, `$[4]` là `'object'`, `json_type(questions, '$[4].answer') = 'text'` với `LOWER(TRIM(answer)) = 'more smoothly'`, `json_type(questions, '$[4].stem') = 'text'` với `stem IN ('easier and ____ ride', 'easier; ride ____')`, `alts` là `NULL` hoặc `'text'` có `TRIM(alts) = ''`, và `type` là `NULL` hoặc `'text'` bằng `'tablecomp'`.
       - Guard nhất quán `intro` và `groups` trong `WHERE` (chống split-brain & corrupt JSON một phần):
         - `TRIM(intro) = '' OR INSTR(intro, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0 OR INSTR(intro, '<td><p>easier; ride <strong>(5)</strong></p></td>') > 0`.
         - `TRIM(groups) = ''` HOẶC (valid array length = 0) HOẶC (valid array length >= 1, `$[0]` là `'object'`, `json_type(groups, '$[0].instruction') = 'text'`, và `$[0].instruction` chứa ô bảng cũ hoặc mới).
       - Điều kiện kích hoạt trong `WHERE`: ít nhất 1 trong 3 chỗ (`questions[4].stem = 'easier and ____ ride'`, `intro` chứa ô bảng cũ, hoặc `groups[0].instruction` chứa ô bảng cũ) còn chuỗi cũ.
       - Nhánh `SET` (tuyệt đối KHÔNG dựa vào `COALESCE` bọc ngoài `json_set`; mỗi nhánh chỉ gọi `json_set` bên trong `CASE WHEN` đã kiểm `json_valid` + `json_type = 'text'` + `INSTR > 0`):
         - `questions`: cập nhật `$[4].stem` sang `'easier; ride ____'` khi `$[4].stem = 'easier and ____ ride'`, else giữ `questions`.
         - `groups`: thay đúng ô bảng trong `$[0].instruction` khi `$[0].instruction` là `'text'` chứa ô bảng cũ, else giữ `groups`.
         - `intro`: thay đúng ô bảng khi `INSTR(intro, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0`, else giữ `intro`.
         - `updated_at = cast(unixepoch('subsecond') * 1000 as integer)`.
     - **Statement 2 (`UPDATE assignment_prompt`):**
       - KHÔNG `SET updated_at` (`assignment_prompt` không có cột `updated_at` theo `packages/db/src/schema/assignment-prompt.ts:18-65`).
       - Định vị chính xác bằng `=` (không dùng `LIKE`): `library_ref = 'library_test_part:lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'` AND `skill = 'listening'` AND `part = 's4'`.
       - Áp dụng đầy đủ cùng tập INF-03 + JSON1 nested `CASE WHEN` + table-cell guards như Statement 1 trên `questions` (gồm `alts = ''`, `type` null/`'tablecomp'`), `intro`, và `groups`, với điều kiện kích hoạt ít nhất 1 trong 3 chỗ còn chuỗi cũ.
       - Cập nhật `questions`, `groups`, `intro` bằng cùng biểu thức `CASE WHEN ... THEN json_set(...) ELSE col END`.
- **Success criteria:** Migration `0089` pass 100% test cases (kể cả `executeMultiple` + `migrate()` + `updated_at` idempotency + INF-03 + partial corrupt JSON), `study-pack-migration.test.ts` pass snapshot chain check, `flat-migrations.test.ts` pass, và `listening-library-import.test.ts` pass toàn bộ 498 file.
- **Verify:** `pnpm --filter server exec vitest run src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/listening-library-import.test.ts && pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts` exits 0 and reports all tests passed.

## Verification
- `pnpm --filter @teacher-os/db exec vitest run src/seed/listening-library.test.ts`
- `pnpm --filter server exec vitest run src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/listening-library-import.test.ts`
- `pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts`

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
