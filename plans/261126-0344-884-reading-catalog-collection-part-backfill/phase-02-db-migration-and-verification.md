---
phase: 2
title: "Phase 2: Drizzle Migration 0094 Backfill, Regression Tests & Gates"
status: completed
priority: P1
effort: "1h 30m"
dependencies: [1]
---

# Phase 2: Drizzle Migration 0094 Backfill, Regression Tests & Gates

<!-- Updated: Red-Team Review 2026-11-26 - Expanded Step IELTS/Unknown WHERE cleanup for Prod D1, explicit INSERT OR IGNORE + ap.library_ref join on _tmp_blocked_prompt_0094 + custom 1-part test, added ap.org_id=at.org_id / ltp.test_id=lt.id / at.collection=lt.collection / at.test_group=lt.test_group + block ap.source, broadened valid test_group set, homoglyph SQL normalization + 349/350 ASCII passage_clue, COALESCE NOT NULL safety + Statement B WHERE change-guard + anchored SUBSTR auto-title -->

## Goal
Tạo Drizzle migration `0094_backfill_reading_library_collection_and_part.sql` cùng `meta/0094_snapshot.json` và cập nhật `meta/_journal.json` để backfill an toàn, idempotent, tương thích D1 (cả staging lẫn production), khử `"Step IELTS"`/`"Unknown"`, bảo toàn INF-03 và bất biến `assignment_test_part.part === assignment_prompt.part` trên 5 bảng (`library_test`, `library_test_part`, `assignment_test`, `assignment_test_part`, `assignment_prompt`), khóa kiểm chứng cơ học 100% giữa migration và dataset nguồn, và vượt qua toàn bộ cổng chất lượng local + targeted E2E.

## Files to Create / Modify
- Modify: `packages/db/src/seed/reading-library-dataset.test.ts` (thêm test đối chiếu cơ học giữa các lệnh `INSERT INTO \`_tmp_reading_meta_0094\`` trong `0094_*.sql` và `loadReadingLibraryMetadata()`, kiểm kích thước từng statement `< 10_000` bytes, không dùng `CREATE TEMP TABLE`, có `DROP TABLE IF EXISTS` ở đầu và cuối, và 0 giá trị tuple đích chứa `/step[\s-]?ielts/i` hay `"Unknown"`)
- Create: `apps/server/src/reading-collection-part-backfill-migration.test.ts`
- Create: `packages/db/src/migrations/0094_backfill_reading_library_collection_and_part.sql`
- Create: `packages/db/src/migrations/meta/0094_snapshot.json`
- Modify: `packages/db/src/migrations/meta/_journal.json`

## Tests Before
1. Trong `packages/db/src/seed/reading-library-dataset.test.ts`:
   - Đọc `0094_backfill_reading_library_collection_and_part.sql`, tách theo `--> statement-breakpoint`, xác nhận mọi statement kết thúc `;`, độ dài UTF-8 từng statement `< 10_000` bytes, không chứa `CREATE TEMP TABLE`, đầu và cuối file đều có `DROP TABLE IF EXISTS \`_tmp_reading_meta_0094\`` và `DROP TABLE IF EXISTS \`_tmp_blocked_prompt_0094\``, và toàn bộ tuple parse từ các lệnh `INSERT INTO \`_tmp_reading_meta_0094\`` khớp 1-1 với `loadReadingLibraryMetadata()` (350 dòng, 0 giá trị đích khớp `/step[\s-]?ielts/i` hoặc `^unknown$`).
2. Trong `apps/server/src/reading-collection-part-backfill-migration.test.ts`:
   - **Test 1 (Happy path 5 bảng + Alchemy `executeMultiple` + Step IELTS/Unknown Prod cleanup + Coral Reefs + homoglyphs + whitespace + existing `test_group` + anchored `SUBSTR` auto-titles):**
     - Seed các đề Reading vào `library_test`, `library_test_part` (`part = 'p1'`, passage chứa đúng `passage_clue` thực tế của từng bài) và đồ thị đã sync sẵn trên `org-existing` (`assignment_test`, `assignment_test_part` `part = 'p1'`, `position = 0`, `assignment_prompt` `part = 'p1'`):
       - `"The Falkirk Wheel"` (`C11T1`, `p2`, `collection = NULL`, `test_group = "Passage 1"`, part title `"The Falkirk Wheel — P1"`)
       - `"Termite Mounds"` (`Collection`, `p3`, `collection = ""`, `test_group = NULL`, part title `"Passage 1: Termite Mounds"`)
       - `"\t Making Every Drop Count \r\n"` (`C7T1`, `p2`, `collection = NULL`, `test_group = "Test 1"` — chứng minh không bị rào `test_group` loại bỏ!, part title `"Reading Passage 1: Making Every Drop Count"`; đồng thời trên `assignment_prompt` của bài này đặt title `"Passage 1: Notes on Passage 1"` để chứng minh nhánh `SUBSTR` chỉ đổi tiền tố thành `"Passage 2: Notes on Passage 1"`, không bị `REPLACE` phá thân)
       - `"Advertising Needs Attention"` (`Actual Test`, `p1`, `collection = "Unknown"`, `source = "Unknown — Passage 1"`, part title `"Passage 1"`)
       - `"Team Building"` (`Trainer`, `passage_number = null` → `p1`, `collection = NULL`)
       - `"Solving Traffic Problems in Big Cities"` (`collection = "Step IELTS"`, `source = "Step IELTS — Passage 1"` trên CẢ `library_test`/`library_test_part` lẫn `assignment_test`/`assignment_prompt` — mô phỏng Prod D1 chưa chạy `cleanup-step-ielts`!) → khử sạch thành `"Other sources"` và `"Other sources — Passage 1"`.
       - `"Coral reefs"` (`C20T3`, `p2`, passage chứa `"London Zoo"`) và `"Coral Reefs"` (`Collection`, `p1`, passage chứa `"calcium carbonate"`).
       - `"Will Eating Less Make You Live Longer"` (`Collection`, `p2`, passage thật).
       - Tiêu đề homoglyph: `"The science of sleep"` (Latin `p`, thay vì Cyrillic `р` trong JSON) và `"The Farmers: the Past and the Present"` (ASCII `:`, thay vì `：`) và `"This Marvellous Invention"`? (lưu ý `‘This Marvellous Invention’` vs `'This Marvellous Invention'` — seed `'This Marvellous Invention'` ASCII quotes và `"The science of sleep"` Latin `p` + `"The Farmers:the Past and the Present"` ASCII `:`, chứng minh chuẩn hóa homoglyph khớp sạch!).
     - Chạy `client.executeMultiple(rawSql)` trên `0094` và assert toàn bộ 5 bảng được cập nhật chính xác (`collection`, `test_group`, `part`, `position = 0/1/2`, `source`, auto-generated `title`), không còn bảng `_tmp_reading_meta_0094` hay `_tmp_blocked_prompt_0094` trong `sqlite_master`, và `PRAGMA foreign_key_check` trả 0 dòng.
   - **Test 2 (INF-03, provenance, tenant isolation, multi-part, short-title custom hijack guard & bất biến `atp.part === ap.part`):**
     - Đề giáo viên tự soạn (`library_ref = NULL`, title `"The Falkirk Wheel"`) → không đổi.
     - Đề admin custom ngắn trùng tên `"Team Building"` hoặc `"Diabetes"` (`collection = NULL`, `status = 'ready'`) nhưng có `passage` tự soạn không khớp `passage_clue` → **KHÔNG bị chiếm đoạt** ở cả `library_test` lẫn `library_test_part`.
     - Đề admin custom trong `library_test` trùng tên `"Coral reefs"` (passage có `"London Zoo"`) nhưng admin đã đặt `collection = 'Bộ đề riêng'` → CẢ `library_test` LẪN `library_test_part` (part `p1`, source `''`) đều KHÔNG đổi.
     - Đề Reading multi-part trong `library_test` (`p1` + `p2`, title `"The Falkirk Wheel"`, `collection = NULL`) → KHÔNG đổi `library_test` lẫn `library_test_part`.
     - Bản sao `assignment_test` mà giáo viên đã sửa `collection = 'Lớp IELTS 7.0'` (vẫn giữ `library_ref` tới `lt-falkirk`) → giữ nguyên `at.collection`, `at.test_group`, **`atp.part = 'p1'`, `atp.position = 0`, `ap.part = 'p1'`, và `ap.source = ''`** (không bị Statement D/E xuyên thủng INF-03!).
     - Bản sao `assignment_prompt` mà giáo viên đã sửa `passage` khác `ltp.passage` → giữ nguyên `ap.part = 'p1'`, `ap.source = ''`, `atp.part = 'p1'`, `atp.position = 0`.
     - Prompt thư viện gắn **độc nhất** (`COUNT(*) = 1`) vào 1 đề custom 1-part (`assignment_test.library_ref IS NULL`) → bước post-D của `_tmp_blocked_prompt_0094` (join qua `ap.library_ref`) chặn Statement E đổi `ap.part` và `ap.source`, giữ `atp.part === ap.part === 'p1'`.
     - Prompt dùng chung ở 2 đề (`at-synced` 1-part + `at-custom-multi` multi-part custom ở slot `p1`) → `_tmp_blocked_prompt_0094` (`INSERT OR IGNORE`, không nổ `PRIMARY KEY`!) chặn CẢ `assignment_test_part` LẪN `assignment_prompt` đổi `part`/`source`, giữ `atp.part === ap.part === 'p1'`.
     - Đề `skill = 'listening'` trùng tên `"The Falkirk Wheel"` → không đổi.
     - `assignment_prompt` giả mạo wildcard `library_ref = 'libraryXtestYpart:...'` → không đổi.
     - `library_test_part` đã có `part = 'p2'`, `test_group = 'Test 1'`, `collection = NULL` và custom title `"Tiêu đề riêng"` → backfill `collection = 'Cambridge IELTS 11'`, giữ nguyên `test_group = 'Test 1'`, `part = 'p2'`, `title = 'Tiêu đề riêng'`, và backfill `source` rỗng.
     - `quiz_attempt.questions_snapshot` và `study_pack_item` trỏ `library_test_part.id` giữ nguyên 100%.
   - **Test 3 (Idempotency sentinel `updated_at`, retry safety & Drizzle `migrate()` + `_journal.json`):**
     - Kiểm tra `meta/_journal.json`: `entry93` và `entry94` tồn tại, `entry94.tag === "0094_backfill_reading_library_collection_and_part"`, `entry94.breakpoints === true`, `entry94.when > entry93.when`.
     - Chạy `0094` lần 1 → đặt `updated_at = 1000` trên `library_test`, `library_test_part`, `assignment_test` → chạy lại `0094` lần 2 → assert `updated_at === 1000` không bị chạm trên cả 3 bảng và không có dữ liệu nào đổi.
     - Pre-create bảng `_tmp_reading_meta_0094` và `_tmp_blocked_prompt_0094` (kèm dữ liệu rác) → chạy `0094` → thành công sạch và drop sạch cả 2 bảng tạm.
     - Trên DB mới áp tới `0093` + ghi `__drizzle_migrations` tới `entry93.when`, seed dữ liệu pre-migration rồi chạy `migrate(db, { migrationsFolder: MIGRATIONS_DIR })` → thành công sạch trên 5 bảng.
   - **Test 4 (HTTP API E2E trên `org-existing` & `org-new`):**
     - Seed tập đề Reading (`C7T1` `p2`, `C11T1` `p2`, `C20T3` Coral reefs `p2`, `Collection` Coral Reefs `p1`, `Collection` Termite Mounds `p3`, `Actual Test` `p1` với `collection = 'Unknown'`, `Trainer` `p1`, `Step IELTS` → `Other sources` `p1` với `collection = 'Step IELTS'`) với pre-synced graph trên `org-existing` và `org-new` chưa sync.
     - Áp migration `0094`, khởi tạo `buildApp` (truyền đủ `adminEmails`, `adminOrigins`, `corsOrigin` theo mẫu `reading-shares-title-migration.test.ts:946-947`, cùng bản ghi `student` trên cả `org-existing` và `org-new`), và gọi:
       1. `GET /api/student/practice?skill=reading&facets=1` cho `org-existing` và `org-new` → cả 2 đều trả:
          - `facets.collections` = `["Actual Test", "Cambridge IELTS 7", "Cambridge IELTS 11", "Cambridge IELTS 20", "Collection", "Other sources", "Trainer"]` (đúng thứ tự tự nhiên, không `"Step IELTS"`, không `"Unknown"`).
          - `facets.parts` = `["p1", "p2", "p3"]`.
       2. `GET /api/student/practice?skill=reading&facets=1&collection=Cambridge+IELTS+20&part=p2` → trả đúng `"Coral reefs"` (`collection: "Cambridge IELTS 20"`, `testGroup: "Test 3"`).
       3. `GET /api/student/practice?skill=reading&facets=1&part=p3` → trả đúng `"Termite Mounds"`.
       4. `GET /api/student/practice/:testId/quiz` cho `"The Falkirk Wheel"` → trả `part: "p2"`, `collection: "Cambridge IELTS 11"`, `testGroup: "Test 1"`.
       5. `GET /api/admin/library/tests?skill=reading` và `GET /api/admin/library/tests/:id` → trả `collection`, `testGroup`, và `parts[0].part === "p2"` cho `"The Falkirk Wheel"`.

## Tasks & Steps

### Task 2.1 — Viết TDD tests cho migration `0094` và parity test dataset (Red phase)
- **Goal:** Tạo test chứng minh migration `0094` chưa tồn tại và khóa toàn bộ yêu cầu đúng đắn, khử `"Step IELTS"`/`"Unknown"`, INF-03, idempotency, retry, và HTTP API E2E trước khi sinh file SQL.
- **Target files and symbols:**
  - `packages/db/src/seed/reading-library-dataset.test.ts` (thêm test parity với `0094_backfill_reading_library_collection_and_part.sql`)
  - `apps/server/src/reading-collection-part-backfill-migration.test.ts` (4 test blocks theo mục Tests Before)
- **Steps:**
  1. Bổ sung test parity migration `0094` vào `packages/db/src/seed/reading-library-dataset.test.ts`.
  2. Tạo `apps/server/src/reading-collection-part-backfill-migration.test.ts` triển khai đủ 4 test blocks.
  3. Chạy vitest xác nhận Red phase fail đúng vì thiếu file `0094_*.sql`.
- **Success criteria:** Cả hai test file đều thất bại do chưa tìm thấy `0094_backfill_reading_library_collection_and_part.sql`.
- **Verify:** `pnpm --filter server exec vitest run src/reading-collection-part-backfill-migration.test.ts` exits non-zero because migration `0094` is not found (passing is a failure in red phase).

### Task 2.2 — Sinh migration `0094`, snapshot `0094` và cập nhật `_journal.json` (Green phase)
- **Goal:** Tạo đủ 3 artifact Drizzle (`0094_backfill_reading_library_collection_and_part.sql`, `meta/0094_snapshot.json`, `meta/_journal.json`) tuân thủ mọi rào bảo vệ D1, khử Step IELTS/Unknown, INF-03, và bất biến `atp.part === ap.part`.
- **Target files and symbols:**
  - `packages/db/src/migrations/0094_backfill_reading_library_collection_and_part.sql`
  - `packages/db/src/migrations/meta/0094_snapshot.json`
  - `packages/db/src/migrations/meta/_journal.json`
- **Steps:**
  1. Sinh `packages/db/src/migrations/0094_backfill_reading_library_collection_and_part.sql` từ `loadReadingLibraryMetadata()` với cấu trúc chuẩn xác sau:
     - **Đầu file (retry-safe):**
       - `DROP TABLE IF EXISTS \`_tmp_blocked_prompt_0094\`;`
       - `DROP TABLE IF EXISTS \`_tmp_reading_meta_0094\`;`
       - `CREATE TABLE \`_tmp_reading_meta_0094\` (\`norm_title\` text NOT NULL, \`passage_clue\` text NOT NULL DEFAULT '', \`collection\` text NOT NULL, \`test_group\` text NOT NULL, \`part\` text NOT NULL, \`part_source\` text NOT NULL);`
       - `CREATE INDEX \`_tmp_reading_meta_0094_title_idx\` ON \`_tmp_reading_meta_0094\` (\`norm_title\`);`
       - 14 lệnh `INSERT INTO \`_tmp_reading_meta_0094\` (...) VALUES ...;` (~25 dòng/lệnh = 350 dòng, escape `'` → `''`, mỗi lệnh `< 4 KB`).
     - **Biểu thức chuẩn hóa chung trong SQL:**
       - `NORM_WS(x)`: `TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(x, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))`
       - `NORM_TITLE(x)`: `LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(x, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))`
       - `ELIGIBLE_COLLECTION(x, m_col)`: `NORM_WS(x) = '' OR LOWER(NORM_WS(x)) IN ('unknown', LOWER(m_col)) OR INSTR(LOWER(NORM_WS(x)), 'step ielts') > 0 OR INSTR(LOWER(NORM_WS(x)), 'step-ielts') > 0 OR INSTR(LOWER(NORM_WS(x)), 'stepielts') > 0`
       - `ELIGIBLE_SOURCE(x)`: `NORM_WS(x) = '' OR LOWER(NORM_WS(x)) = 'unknown' OR SUBSTR(LOWER(NORM_WS(x)), 1, 10) IN ('unknown — ', 'unknown - ') OR INSTR(LOWER(NORM_WS(x)), 'step ielts') > 0 OR INSTR(LOWER(NORM_WS(x)), 'step-ielts') > 0 OR INSTR(LOWER(NORM_WS(x)), 'stepielts') > 0`
       - `ELIGIBLE_TEST_GROUP(tg, m_tg)`: `LOWER(NORM_WS(tg)) IN ('', 'unknown', 'passage 1', 'p1', 'part 1', 'passage 2', 'p2', 'part 2', 'passage 3', 'p3', 'part 3', LOWER(m_tg)) OR INSTR(LOWER(NORM_WS(tg)), 'step ielts') > 0 OR INSTR(LOWER(NORM_WS(tg)), 'step-ielts') > 0 OR INSTR(LOWER(NORM_WS(tg)), 'stepielts') > 0`
       - **Null-safe change-guard:** luôn dùng `IS NOT` (tuyệt đối không dùng `<>`) khi so sánh cột nullable `collection` / `test_group` với giá trị đích.
     - **Statement A (`library_test`):** cập nhật `collection`, `test_group` (dùng `COALESCE` / `ELSE`), và `updated_at` cho đề `skill = 'reading'` có đúng 1 `library_test_part` (`ltp.part IN ('p1', m.part)`), khớp duy nhất 1 dòng `_tmp_reading_meta_0094` (qua `NORM_TITLE(library_test.title) = m.norm_title` và `m.passage_clue = '' OR INSTR(LOWER(ltp.passage), m.passage_clue) > 0`), thỏa `ELIGIBLE_COLLECTION(collection)` và `ELIGIBLE_TEST_GROUP(test_group, m.test_group)`, và ít nhất 1 trong 2 cột (`collection`, `test_group`) thực sự đổi.
     - **Statement B (`library_test_part`):** cập nhật `part` (chỉ khi `part = 'p1' AND m.part IN ('p2', 'p3')`), `source` (chỉ khi `ELIGIBLE_SOURCE(source)` và `m.part_source <> ''`), auto-generated `title` (chỉ khi `part` thực sự đổi từ `'p1'` → `'p2'`/`'p3'`, dùng `SUBSTR` neo đầu/cuối trên `NORM_WS(title)` — **tuyệt đối không dùng `REPLACE`** — xử lý `'Passage 1'`, `'Reading Passage 1'`, `'Passage 1: <rest>'`, `'Reading Passage 1: <rest>'`, và `'<base> — P1'`), và `updated_at`. Bọc mọi scalar subquery bằng `COALESCE(..., current_col)` trên tất cả cột `NOT NULL`. Điều kiện `WHERE` bắt buộc: `lt.skill = 'reading'`, đề `lt` chỉ có 1 part, `lt.collection = m.collection AND lt.test_group = m.test_group`, khớp duy nhất 1 dòng `m` (kèm `passage_clue`), **và** có ít nhất 1 cột (`part` hoặc `source`) thực sự cần cập nhật (bảo vệ sentinel `updated_at = 1000`).
     - **Statement C (`assignment_test`):** cập nhật `collection`, `test_group`, `updated_at` cho bản sao đồng bộ (`library_ref IS NOT NULL AND NORM_WS(library_ref) <> ''`, `skill = 'reading'`) trỏ tới `library_test lt` khớp `_tmp_reading_meta_0094` (1 part, `lt.collection = m.collection AND lt.test_group = m.test_group`), thỏa `ELIGIBLE_COLLECTION(assignment_test.collection)` và `ELIGIBLE_TEST_GROUP(assignment_test.test_group, lt.test_group)`, và có ít nhất 1 cột thực sự đổi.
     - **Tạo và nạp `_tmp_blocked_prompt_0094` (bước 1 — shared prompts):**
       - `CREATE TABLE \`_tmp_blocked_prompt_0094\` (\`prompt_id\` text PRIMARY KEY);`
       - `INSERT OR IGNORE INTO \`_tmp_blocked_prompt_0094\` (\`prompt_id\`) SELECT \`prompt_id\` FROM \`assignment_test_part\` GROUP BY \`prompt_id\` HAVING COUNT(*) > 1;`
     - **Statement D (`assignment_test_part`):** cập nhật `part = COALESCE(..., part)` và `position = COALESCE(..., position)` (`p2 -> 1`, `p3 -> 2`, else `0`) cho dòng `part = 'p1'`, 1-part (`NOT EXISTS` part khác cùng `test_id`), `NOT EXISTS` trong `_tmp_blocked_prompt_0094`, nối `assignment_test at` (`at.id = assignment_test_part.test_id`, `at.skill = 'reading'`, `at.library_ref IS NOT NULL AND NORM_WS(at.library_ref) <> ''`), `library_test lt` (`lt.id = at.library_ref`, `lt.skill = 'reading'`, 1 part, `at.collection = lt.collection`, `at.test_group = lt.test_group`), `assignment_prompt ap` (`ap.id = assignment_test_part.prompt_id`, **`ap.org_id = at.org_id`**, `ap.skill = 'reading'`, `ap.part = 'p1'`, `SUBSTR(ap.library_ref, 1, 18) = 'library_test_part:'`, `NORM_WS(SUBSTR(ap.library_ref, 19)) <> ''`), và `library_test_part ltp` (`ltp.id = SUBSTR(ap.library_ref, 19)`, **`ltp.test_id = lt.id`**, `ltp.part IN ('p2', 'p3')`, `ap.passage = ltp.passage`), khớp `_tmp_reading_meta_0094`.
     - **Nạp bổ sung `_tmp_blocked_prompt_0094` (bước 2 — tường minh `INSERT OR IGNORE`, join qua `ap.library_ref`):**
       - `INSERT OR IGNORE INTO \`_tmp_blocked_prompt_0094\` (\`prompt_id\`) SELECT DISTINCT atp.\`prompt_id\` FROM \`assignment_test_part\` atp INNER JOIN \`assignment_prompt\` ap ON ap.\`id\` = atp.\`prompt_id\` INNER JOIN \`library_test_part\` ltp ON SUBSTR(ap.\`library_ref\`, 1, 18) = 'library_test_part:' AND NORM_WS(SUBSTR(ap.\`library_ref\`, 19)) <> '' AND ltp.\`id\` = SUBSTR(ap.\`library_ref\`, 19) WHERE ap.\`skill\` = 'reading' AND atp.\`part\` <> ltp.\`part\`;`
     - **Statement E (`assignment_prompt` — không chạm `updated_at`):** cập nhật `part` (khi `ap.part = 'p1' AND ltp.part IN ('p2', 'p3')`), `source` (khi `(ap.part = ltp.part OR (ap.part = 'p1' AND ltp.part IN ('p2', 'p3')))` và `ELIGIBLE_SOURCE(ap.source)` và `ltp.source <> ''`), và auto-generated `title` (chỉ khi `part` thực sự đổi, dùng `SUBSTR` neo đầu/cuối, không `REPLACE`) với `COALESCE(..., current_col)` trên mọi cột `NOT NULL`, bắt buộc **`NOT EXISTS (SELECT 1 FROM \`_tmp_blocked_prompt_0094\` b WHERE b.\`prompt_id\` = \`assignment_prompt\`.\`id\`)`** (chặn cả `part`, `source`, lẫn `title` trên prompt bị block!), `skill = 'reading'`, `SUBSTR(library_ref, 1, 18) = 'library_test_part:'`, khớp `ltp` + `lt` (1 part, `lt.collection = m.collection AND lt.test_group = m.test_group`, khớp `_tmp_reading_meta_0094`), `ap.passage = ltp.passage`, và có ít nhất 1 cột thực sự đổi.
     - **Cuối file:**
       - `DROP TABLE IF EXISTS \`_tmp_blocked_prompt_0094\`;`
       - `DROP TABLE IF EXISTS \`_tmp_reading_meta_0094\`;`
     - Mọi statement kết thúc `;` và ngăn bởi `--> statement-breakpoint`.
  2. Tạo `packages/db/src/migrations/meta/0094_snapshot.json` bằng cách sao chép `0093_snapshot.json`, sinh UUID v4 mới cho `"id"` và đặt `"prevId": "5c2b298b-448f-4f62-b185-039010ae9fd7"`.
  3. Cập nhật `packages/db/src/migrations/meta/_journal.json` thêm entry `idx: 94`, `version: "6"`, `when: 1795650000000`, `tag: "0094_backfill_reading_library_collection_and_part"`, `breakpoints: true`.
  4. Chạy bộ test migration, dataset, snapshot chain và flat-migrations.
- **Success criteria:** Toàn bộ tests trong `reading-collection-part-backfill-migration.test.ts`, `reading-library-dataset.test.ts`, `study-pack-migration.test.ts`, `flat-migrations.test.ts` pass 100%.
- **Verify:** `pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts && pnpm --filter server exec vitest run src/reading-collection-part-backfill-migration.test.ts src/study-pack-migration.test.ts` exits 0 and prints all tests passed.

### Task 2.3 — Chạy đầy đủ cổng kiểm tra local và targeted E2E
- **Goal:** Xác minh không có lỗi lint, typecheck, hồi quy unit/integration test trên toàn các workspace liên quan và spec E2E `student-practice.spec.ts` xanh trên cổng override `8100–8105` (không chạy full E2E local theo `AGENTS.md`).
- **Target files and symbols:** Toàn bộ các file đã chạm ở Phase 1 & Phase 2.
- **Steps:**
  1. Chạy `pnpm exec biome check .` (read-only lint/format gate).
  2. Chạy `pnpm check-types` (typecheck toàn workspace).
  3. Chạy `pnpm test:ci-workflow`, `pnpm --filter @teacher-os/db test`, `pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts`, `pnpm --filter server exec vitest run src/reading-collection-part-backfill-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts src/routes/assignments/prompt-content-lock.test.ts`, và `pnpm --filter student test src/components/practice/practice-catalog.test.tsx`.
  4. Chạy targeted E2E spec `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts`.
- **Success criteria:** Tất cả các lệnh đều exit 0 với 0 lỗi.
- **Verify:** All verification commands above exit 0 with zero failures.

## Verification
- `pnpm exec biome check . && pnpm check-types` exits 0
- `pnpm test:ci-workflow && pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts` exits 0
- `pnpm --filter server exec vitest run src/reading-collection-part-backfill-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts src/routes/assignments/prompt-content-lock.test.ts` exits 0
- `pnpm --filter student test src/components/practice/practice-catalog.test.tsx` exits 0
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts` exits 0

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
