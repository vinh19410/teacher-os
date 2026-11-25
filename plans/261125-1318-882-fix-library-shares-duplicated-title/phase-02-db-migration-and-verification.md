---
phase: 2
title: "Phase 2: DB Migration 0091 & Full Verification Gates"
status: completed
priority: P1
effort: "40m"
dependencies: [1]
---

# Phase 2: DB Migration 0091 & Full Verification Gates

<!-- Updated: Red-Team Review 2026-11-25 - Added explicit full SQL with ELSE title END, 2-arg TRIM (space/tab/CR/LF), untrimmed formatLibraryPartTitle suffix handling, Passage/Reading Passage N prefixes, provenance+INF-03+orphan guards, full pre-migration Test 4 graph + 4 HTTP endpoints, and aligned Verify commands -->

## Goal
Tạo Drizzle migration `0091_fix_reading_shares_duplicated_title.sql` cùng `meta/0091_snapshot.json` và `meta/_journal.json` để làm sạch tiêu đề lặp đôi trên 4 bảng D1 (`library_test`, `assignment_test`, `library_test_part`, `assignment_prompt`), bảo toàn INF-03 và snapshot RT#3, kèm bộ test TDD migration/API và chạy đủ local quality gates.

## Files to Create / Modify
- Create: `apps/server/src/reading-shares-title-migration.test.ts`
- Create: `packages/db/src/migrations/0091_fix_reading_shares_duplicated_title.sql`
- Create: `packages/db/src/migrations/meta/0091_snapshot.json`
- Modify: `packages/db/src/migrations/meta/_journal.json`

## Tests Before
- Tạo `apps/server/src/reading-shares-title-migration.test.ts` (theo mẫu `apps/server/src/listening-bikes-q5-migration.test.ts`) kiểm chứng trước khi tạo migration `0091`:
  1. Happy path trên cả 4 bảng (`library_test` gồm `ready` + `draft` + khoảng trắng `\t\r\n`, `assignment_test` trên nhiều org, `library_test_part` đủ biến thể `OLD_TITLE`, `— P1`, `— P2`, `— P3`, `Passage 2:`, `Reading Passage 2:`, `assignment_prompt` đủ biến thể kể cả bản do `materializePrompts`/`syncLibraryTestsToOrg` sinh ra từ `library_test` có khoảng trắng đuôi và `library_test_part.title = ''`) qua `client.executeMultiple(rawSql)` (Alchemy flat D1 runner).
  2. Bảo toàn INF-03, provenance & orphan handling: org-edited `assignment_test.title`, org-edited `assignment_prompt.title`, org-edited `assignment_prompt.passage` (vẫn giữ `library_ref` + `OLD_TITLE`), `assignment_prompt.part <> ltp.part`, `library_ref` trỏ tới `library_test` Reading không liên quan (`"The History of Tea"`), `library_ref = NULL` / khoảng trắng, wildcard spoof `libraryXtestYpart:...`, sai `skill = 'listening'`, `library_test_part` đã có `passage.title` sạch (`"Investment in shares versus investment in other assets"`), `class_assignment`/`quiz_attempt` bất biến, VÀ bản sao mồ côi (`library_test` đã bị xoá) vẫn được làm sạch.
  3. Idempotency với mốc `updated_at` cố định (`1000`) trên `library_test`, `assignment_test`, `library_test_part`, kèm `PRAGMA foreign_key_check` = 0 và nâng cấp từ `0090` lên `0091` qua `drizzle-orm/libsql/migrator` (`migrate()`) + kiểm tra `_journal.json` (`idx === 91`, `when > entry[90].when`, `breakpoints === true`).
  4. Kiểm chứng end-to-end tầng HTTP API sau migration trên 4 endpoint (`GET /api/admin/library/tests?skill=reading`, `GET /api/admin/library/tests/:id`, `GET /api/student/practice?skill=reading`, `GET /api/student/practice/:testId/quiz`) với `org-existing` đã seed ĐẦY ĐỦ đồ thị pre-migration (`student`, `assignment_test`, `assignment_prompt`, `assignment_test_part`) và `org-new` mới sync, xác nhận `assignment_prompt` gốc của `org-existing` được sửa tại chỗ.

## Tasks & Steps

### Task 2.1 — Viết TDD tests cho migration `0091` và API sau migration (Red phase)
- **Goal:** Tạo `apps/server/src/reading-shares-title-migration.test.ts` và xác nhận fail đúng lý do vì migration `0091` chưa tồn tại.
- **Target files and symbols:**
  - `apps/server/src/reading-shares-title-migration.test.ts` (import `createClient`, `drizzle`, `migrate`, `buildApp`, `syncLibraryTestsToOrg`, `schema`)
- **Steps:**
  1. Tạo `apps/server/src/reading-shares-title-migration.test.ts` với hằng số chính xác:
     - `OLD_TITLE = "Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?"`
     - `NEW_TITLE = "Investment in shares versus investment in other assets - which gives the greater gain?"`
     - `CLEAN_PASSAGE_TITLE = "Investment in shares versus investment in other assets"`
     - Em-dash `\u2014`: `" — P1"`, `" — P2"`, `" — P3"`.
  2. Viết helper `applyThrough(client, "0090_concerned_mach_iv.sql")` và `migration0091File()` tìm file prefix `0091_` trong `packages/db/src/migrations`.
  3. Viết đủ 4 test block:
     - **Test 1 (Happy path 4 bảng + đủ biến thể `P1/P2/P3` + `Passage N:` + `materializePrompts` với khoảng trắng đuôi + Alchemy `executeMultiple`):**
       - Seed `org-1`, `org-2`, `org-3`, `org-sync-ws`.
       - Seed `library_test` Reading với UUID ngẫu nhiên:
         - `lt-ready`: `status = 'ready'`, `title = OLD_TITLE`
         - `lt-draft`: `status = 'draft'`, `title = "\t " + OLD_TITLE + " \r\n"`
         - `lt-ws-sync`: `status = 'ready'`, `title = "  " + OLD_TITLE + "  "` (có 1 `library_test_part` `part = 'p2'`, `title = ''` để chạy thật `syncLibraryTestsToOrg(db, "org-sync-ws", "reading")` TRƯỚC migration, sinh ra `assignment_prompt.title = "  ${OLD_TITLE}   — P2"`).
       - Seed `library_test_part` với đủ biến thể:
         - trên `lt-ready`: `p1` (`title = OLD_TITLE`), `p2` (`title = "${OLD_TITLE} — P2"`), `p3` (`title = "${OLD_TITLE} — P3"`)
         - trên `lt-draft`: `p1` (`title = "${OLD_TITLE} — P1"`), `p2` (`title = "Passage 2: ${OLD_TITLE}"`), `p3` (`title = CLEAN_PASSAGE_TITLE`)
         - thêm 1 `library_test` `lt-rp` (`title = OLD_TITLE`) có part `p2` (`title = "Reading Passage 2: ${OLD_TITLE}"`).
       - Seed `assignment_test` trên `org-1`, `org-2`, `org-3` trỏ `library_ref` tới các `library_test` trên với `OLD_TITLE` (gồm cả bản có `\t`/`\n`), và `assignment_prompt` (đủ `OLD_TITLE`, `${OLD_TITLE} — P1`, `${OLD_TITLE} — P2`, `${OLD_TITLE} — P3`, `Passage 2: ${OLD_TITLE}`, `Reading Passage 2: ${OLD_TITLE}` khớp đúng `part` và `passage` của `library_test_part`).
       - Chạy `client.executeMultiple(rawSql)` và assert toàn bộ các bản ghi lỗi (gồm cả `assignment_prompt` do `syncLibraryTestsToOrg` tạo từ `lt-ws-sync`) được chuẩn hóa sang `NEW_TITLE` / `${NEW_TITLE} — P1/P2/P3` / `Passage 2: ${NEW_TITLE}` / `Reading Passage 2: ${NEW_TITLE}`, trong khi `CLEAN_PASSAGE_TITLE` giữ nguyên và `PRAGMA foreign_key_check` trả 0 dòng.
     - **Test 2 (INF-03, provenance isolation & orphan copy cleanup):** trên các org tách biệt (`org-e1`..`org-e9`) để không đụng `UNIQUE(org_id, library_ref)`, seed:
       - `org-e1`: `assignment_test` có `library_ref = NULL`, `title = OLD_TITLE` (org tự soạn) → không đổi;
       - `org-e2`: `assignment_test` có `library_ref = "   "`, `title = OLD_TITLE` → không đổi;
       - `org-e3`: `assignment_test` có `library_ref` trỏ tới `lt-ready`, nhưng giáo viên đã sửa `title = "[Custom] " + OLD_TITLE` → không đổi;
       - `org-e4`: `assignment_test` và `assignment_prompt` trỏ tới `library_test` Reading không liên quan (`lt-unrelated`, `title = "The History of Tea"`) dù mang `OLD_TITLE` → không đổi;
       - `org-e5`: `assignment_test`, `library_test`, `assignment_prompt` có `skill = 'listening'` và `title = OLD_TITLE` → không đổi;
       - `org-e6`: `assignment_prompt` có `library_ref = "libraryXtestYpart:<partId>"` (wildcard spoof) → không đổi;
       - `org-e7`: `assignment_prompt` có `library_ref = 'library_test_part:<partId>'`, giữ `OLD_TITLE` nhưng giáo viên đã sửa `passage` khác `ltp.passage` (INF-03) → không đổi;
       - `org-e8`: `assignment_prompt` có `part = 'p2'` nhưng `title = "${OLD_TITLE} — P1"` (lệch slot) → không đổi;
       - `org-e9`: `assignment_test` (`library_ref = 'deleted-lib-test-id'`, `status = 'draft'`, `skill = 'reading'`, `title = OLD_TITLE`) và `assignment_prompt` (`library_ref = 'library_test_part:deleted-part-id'`, `skill = 'reading'`, `part = 'p2'`, `title = "${OLD_TITLE} — P2"`) là bản sao mồ côi của đề nguồn đã bị xoá → ĐƯỢC làm sạch sang `NEW_TITLE` và `${NEW_TITLE} — P2`;
       - `class_assignment` (`title = OLD_TITLE`) và `quiz_attempt` gắn với đề đó → tuyệt đối không đổi (snapshot RT#3).
     - **Test 3 (Idempotency với mốc `updated_at` cố định & Drizzle `migrate()` + `_journal.json`):**
       - Kiểm tra `meta/_journal.json`: `entry90` và `entry91` tồn tại, `entry91.tag.startsWith("0091_")`, `entry91.breakpoints === true`, `entry91.when > entry90.when`.
       - Chạy `0091` lần 1 → gán mốc `updated_at = 1000` cho `library_test`, `assignment_test`, `library_test_part` → chạy lại `0091` lần 2 → assert `updated_at` vẫn bằng `1000` trên cả 3 bảng và `title` không đổi.
       - Trên DB memory mới áp tới `0090` + ghi bảng `__drizzle_migrations` tới `entry90.when`, seed dữ liệu lỗi rồi chạy `migrate(db, { migrationsFolder: MIGRATIONS_DIR })` → assert cả 4 bảng được nâng cấp sạch.
     - **Test 4 (HTTP API E2E sau migration — 4 endpoint):**
       - Seed `org-existing` và `org-new`, seed `student` (`email = "hoa@test.local"`) cho cả 2 org; seed `library_test` (`id = "lt-e2e"`, `status = 'ready'`, `skill = 'reading'`, `title = OLD_TITLE`) và `library_test_part` (`id = "ltp-e2e"`, `test_id = "lt-e2e"`, `part = 'p2'`, `title = OLD_TITLE`, `passage = "CRSP passage"`, 1 câu `tfng` hợp lệ).
       - Seed ĐẦY ĐỦ đồ thị pre-migration trên `org-existing`: `assignment_test` (`id = "at-existing"`, `library_ref = "lt-e2e"`, `title = OLD_TITLE`), `assignment_prompt` (`id = "ap-existing"`, `library_ref = "library_test_part:ltp-e2e"`, `skill = 'reading'`, `part = 'p2'`, `title = OLD_TITLE`, `passage = "CRSP passage"`, cùng 1 câu `tfng`), và `assignment_test_part` nối `at-existing` ↔ `ap-existing`.
       - Áp migration `0091` qua `client.executeMultiple(rawSql)`.
       - Khởi tạo `buildApp` với `adminEmails: ["admin@test.local"]`, `adminOrigins: ["http://localhost:8004"]`, `corsOrigin: ["http://localhost:8003"]`, `getSessionUser` phân biệt header `x-test-user: admin` (`email: "admin@test.local"`, `emailVerified: true`, `role: "admin"`) và `x-test-user: hoa` (`email: "hoa@test.local"`, `emailVerified: true`, `role: "student"`).
       - Gọi và assert cả 4 endpoint:
         1. `GET /api/admin/library/tests?skill=reading` → `tests[0].title === NEW_TITLE`.
         2. `GET /api/admin/library/tests/lt-e2e` → `title === NEW_TITLE` và `parts[0].title === NEW_TITLE`.
         3. `GET /api/student/practice?skill=reading` cho `org-existing` và `org-new` → cả 2 đều trả `items[0].title === NEW_TITLE`.
         4. `GET /api/student/practice/at-existing/quiz` (với `x-student-org-id: org-existing`) → `title === NEW_TITLE`; đọc lại bảng `assignment_prompt` xác nhận dòng `ap-existing` gốc được cập nhật tại chỗ (`title === NEW_TITLE`, không bị tạo bản ghi trùng).
  4. Chạy vitest xác nhận Red phase fail do thiếu file `0091_*.sql`.
- **Success criteria:** Test chạy và fail vì chưa tìm thấy migration `0091`.
- **Verify:** `pnpm --filter server exec vitest run src/reading-shares-title-migration.test.ts` exits non-zero because migration `0091` does not exist yet (passing test is a failure).

### Task 2.2 — Tạo migration `0091`, snapshot `0091` và cập nhật `_journal.json` (Green phase)
- **Goal:** Tạo đủ 3 artifact Drizzle (`0091_fix_reading_shares_duplicated_title.sql`, `meta/0091_snapshot.json`, `meta/_journal.json`) với SQL tường minh, `ELSE title END` bắt buộc, `TRIM` 2 tham số, bảo vệ INF-03/provenance + orphan cleanup, và làm xanh toàn bộ test migration + snapshot + flat-migrations.
- **Target files and symbols:**
  - `packages/db/src/migrations/0091_fix_reading_shares_duplicated_title.sql`
  - `packages/db/src/migrations/meta/0091_snapshot.json`
  - `packages/db/src/migrations/meta/_journal.json`
- **Steps:**
  1. Xác nhận `id` của `packages/db/src/migrations/meta/0090_snapshot.json` là `"4bcf36e4-8fca-4892-8977-32e72f366b67"` và `when` của entry `90` trong `packages/db/src/migrations/meta/_journal.json` là `1795583597884`.
  2. Chạy `pnpm --filter @teacher-os/db exec drizzle-kit generate --custom --name=fix_reading_shares_duplicated_title` (KHÔNG thêm `--` trước `--custom`). Kiểm tra file SQL sinh ra là `0091_fix_reading_shares_duplicated_title.sql` và `meta/_journal.json` có `idx: 91`, `breakpoints: true`, `when > 1795583597884` (nếu `when <= 1795583597884`, nâng `when` lên `Math.max(Date.now(), 1795583597885)`).
  3. Nếu `--custom` không tạo `packages/db/src/migrations/meta/0091_snapshot.json`, sao chép `packages/db/src/migrations/meta/0090_snapshot.json` sang `packages/db/src/migrations/meta/0091_snapshot.json`, thay `"id"` bằng UUID v4 mới (`crypto.randomUUID()`) và đặt `"prevId": "4bcf36e4-8fca-4892-8977-32e72f366b67"`.
  4. Ghi nguyên văn 4 statement SQL sau vào `packages/db/src/migrations/0091_fix_reading_shares_duplicated_title.sql` (đều kết thúc `;`, ngăn bằng `--> statement-breakpoint`, `WS = ' ' || CHAR(9) || CHAR(10) || CHAR(13)`, em-dash `\u2014` trong `' — '`, KHÔNG `LIKE`, mọi `CASE` kết thúc `ELSE \`title\` END`, KHÔNG `updated_at` trên `assignment_prompt`):

```sql
-- Fix duplicated Reading title for "Investment in shares versus investment in other assets - which gives the greater gain?"
-- across library_test, assignment_test, library_test_part, and assignment_prompt
-- (idempotent, INF-03/provenance safe, orphan-copy safe, NOT NULL safe, no LIKE).
UPDATE `library_test`
SET
	`title` = 'Investment in shares versus investment in other assets - which gives the greater gain?',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `skill` = 'reading'
	AND TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?';
--> statement-breakpoint
UPDATE `assignment_test`
SET
	`title` = 'Investment in shares versus investment in other assets - which gives the greater gain?',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `library_ref` IS NOT NULL
	AND TRIM(`library_ref`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) <> ''
	AND `skill` = 'reading'
	AND TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
	AND (
		EXISTS (
			SELECT 1
			FROM `library_test` lt
			WHERE lt.`id` = `assignment_test`.`library_ref`
				AND lt.`skill` = 'reading'
				AND TRIM(lt.`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
					'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
					'Investment in shares versus investment in other assets - which gives the greater gain?'
				)
		)
		OR NOT EXISTS (
			SELECT 1
			FROM `library_test` lt
			WHERE lt.`id` = `assignment_test`.`library_ref`
		)
	);
--> statement-breakpoint
UPDATE `library_test_part`
SET
	`title` = CASE
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain?'
		WHEN `part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain? — ' || UPPER(`part`)
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		THEN REPLACE(
			TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		ELSE `title`
	END,
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE (
		TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		OR (
			`part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
	)
	AND EXISTS (
		SELECT 1
		FROM `library_test` lt
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'reading'
			AND TRIM(lt.`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
				'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
				'Investment in shares versus investment in other assets - which gives the greater gain?'
			)
	);
--> statement-breakpoint
UPDATE `assignment_prompt`
SET
	`title` = CASE
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain?'
		WHEN `part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain? — ' || UPPER(`part`)
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		THEN REPLACE(
			TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		ELSE `title`
	END
WHERE SUBSTR(`library_ref`, 1, 18) = 'library_test_part:'
	AND TRIM(SUBSTR(`library_ref`, 19), ' ' || CHAR(9) || CHAR(10) || CHAR(13)) <> ''
	AND `skill` = 'reading'
	AND (
		TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		OR (
			`part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
	)
	AND (
		EXISTS (
			SELECT 1
			FROM `library_test_part` ltp
			INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
			WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
				AND lt.`skill` = 'reading'
				AND TRIM(lt.`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
					'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
					'Investment in shares versus investment in other assets - which gives the greater gain?'
				)
				AND `assignment_prompt`.`part` = ltp.`part`
				AND `assignment_prompt`.`passage` = ltp.`passage`
		)
		OR NOT EXISTS (
			SELECT 1
			FROM `library_test_part` ltp
			WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
		)
	);
```

  5. Chạy test migration `0091`, `study-pack-migration.test.ts`, `student-practice-library-sync.test.ts`, `admin-library.test.ts`, và `flat-migrations.test.ts`.
- **Success criteria:** Toàn bộ migration tests, snapshot chain tests, flat-migrations tests, và API library/practice tests pass 100%.
- **Verify:** `pnpm --filter server exec vitest run src/reading-shares-title-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts && pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts` exits 0 and reports all tests passed.

### Task 2.3 — Chạy toàn bộ local quality gates
- **Goal:** Xác minh lint/format, typecheck, CI workflow test, và các test suite liên quan không có lỗi hay hồi quy.
- **Target files and symbols:** Toàn bộ workspace (không chạy full E2E theo `AGENTS.md`).
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format do file mới tạo, chạy `pnpm check:fix` rồi kiểm lại bằng `pnpm exec biome check .`).
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm test:ci-workflow`, `pnpm --filter @teacher-os/db test`, `pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts`, và `pnpm --filter server exec vitest run src/reading-shares-title-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts`.
- **Success criteria:** 0 lỗi biome, 0 lỗi TypeScript, 100% test liên quan pass.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test:ci-workflow && pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts && pnpm --filter server exec vitest run src/reading-shares-title-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts` exits 0.

## Tests After
- Toàn bộ 4 test block trong `apps/server/src/reading-shares-title-migration.test.ts` pass (Alchemy `executeMultiple`, Drizzle `migrate()`, INF-03 + provenance + orphan handling, idempotency sentinel, 4 HTTP API endpoints).
- `apps/server/src/study-pack-migration.test.ts` xác nhận chuỗi `prevId` snapshot từ `0058` tới `0091` liền mạch.
- `packages/infra/src/flat-migrations.test.ts` xác nhận `0091_fix_reading_shares_duplicated_title.sql` tương thích Alchemy flat D1 migrations.
- `scripts/ci-workflow.test.mjs` xác nhận `packages/db/turbo.json` bảo vệ cache CI cho bộ dữ liệu Reading & Listening.

## Regression Gate
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm test:ci-workflow`
- `pnpm --filter @teacher-os/db test`
- `pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts`
- `pnpm --filter server exec vitest run src/reading-shares-title-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts`

## Verification
- `pnpm exec biome check . && pnpm check-types && pnpm test:ci-workflow && pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts && pnpm --filter server exec vitest run src/reading-shares-title-migration.test.ts src/study-pack-migration.test.ts src/routes/student-practice-library-sync.test.ts src/routes/admin-library.test.ts`

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
