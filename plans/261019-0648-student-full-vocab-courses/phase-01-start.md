---
title: "Phase 1: DB Schema & Migration 0039 (vocab_card polymorphic word_id)"
status: done
---

# Phase 1: DB Schema & Migration 0039 (vocab_card polymorphic word_id)

## Context Links

- Schema: [`packages/db/src/schema/vocab.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/db/src/schema/vocab.ts) (`vocabCard` lines 95–125)
- Library Schema: [`packages/db/src/schema/vocab-library.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/db/src/schema/vocab-library.ts) (`vocabLibraryCourse`, `vocabLibraryDeck`, `vocabLibraryWord`)
- Library Seed: [`packages/db/src/seed/vocab-library.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/db/src/seed/vocab-library.ts) (`buildVocabLibraryUpsertStatements`, lines 294–305)
- Precedent migrations: [`packages/db/src/migrations/0036_bored_infant_terrible.sql`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/db/src/migrations/0036_bored_infant_terrible.sql), [`packages/db/src/migrations/0038_wise_blizzard.sql`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/db/src/migrations/0038_wise_blizzard.sql)
- Schema tests: [`packages/db/src/schema/vocab.test.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/db/src/schema/vocab.test.ts)

## Overview

Bỏ ràng buộc khóa ngoại cứng `FOREIGN KEY (word_id) REFERENCES vocab_word(id)` trên bảng `vocab_card` bằng migration `0039` (recreate bảng `vocab_card` trong SQLite). Nhờ đó, `vocab_card.word_id` có thể lưu cả ID từ của bộ từ giáo viên/lớp (`vocab_word.id`) lẫn ID từ của thư viện khóa học có sẵn (`vocab_library_word.id` dạng `libword-*`) mà không bị lỗi `SQLITE_CONSTRAINT_FOREIGNKEY` khi `PRAGMA foreign_keys = ON`. Đồng thời bổ sung câu lệnh dọn dẹp thẻ mồ côi (`libword-*` không còn trong CSV) vào cuối `buildVocabLibraryUpsertStatements` khi chạy `prune: true`, và bật tường minh `PRAGMA foreign_keys = ON` sau `migrate()` trong bộ test.

## Key Insights

- Trong `0036_bored_infant_terrible.sql:18`, `vocab_card` có `FOREIGN KEY (word_id) REFERENCES vocab_word(id) ON UPDATE no action ON DELETE cascade`. Trên Cloudflare D1 (luôn bật FK) hoặc khi bật `PRAGMA foreign_keys=ON` ngoài transaction, mọi lệnh `INSERT INTO vocab_card` với `word_id = 'libword-*'` sẽ bị SQLite chặn nếu giữ FK này.
- **Lưu ý Red-Team (RT-F4 — Phantom FK in `migrate()`)**: Trong SQLite, lệnh `PRAGMA foreign_keys=ON` bên trong một transaction là no-op. Vì `migrate(db, { migrationsFolder })` của Drizzle bọc migration trong transaction, các test suite (`packages/db/src/schema/vocab.test.ts:203`, `apps/server/src/routes/vocab.test.ts:111`, `apps/e2e/src/boot.ts:84`) phải gọi tường minh `await client.execute("PRAGMA foreign_keys = ON;")` ngay sau `await migrate(...)` để test phản ánh đúng hành vi của Cloudflare D1.
- Theo doctrine F7 của repo (`packages/db/src/schema/vocab.ts:18-20` và `apps/server/src/routes/vocab-teacher.ts:240,761`), luồng xóa deck hoặc xóa từ của giáo viên **đã xóa tường minh `vocab_card` trong cùng `db.batch`**, không phụ thuộc vào FK cascade của `word_id`. (Ở Phase 2 & 3, ta cũng chặn giáo viên tạo `id` mang tiền tố `libword-*`/`libdeck-*` và giới hạn lệnh xóa `vocab_card` của giáo viên không bao giờ đụng tới `libword-%`).
- **Bảo toàn dữ liệu & chống thẻ mồ côi khi chạy `seedVocabLibrary` với `prune: true` (RT-F5)**:
  - Không đặt FK sang `vocab_library_word(id)` để khi `seedVocabLibrary` (`packages/db/src/seed/vocab-library.ts:296-302`) chạy `DELETE FROM vocab_library_word WHERE id LIKE 'libword-%'` rồi `INSERT` lại cùng ID deterministic `libword-<csvId>`, toàn bộ `vocab_card` của học viên vẫn còn nguyên vẹn.
  - Tuy nhiên, nếu một từ `libword-X` thực sự bị gỡ bỏ hoàn toàn khỏi CSV sau khi `INSERT` xong, cần dọn các dòng `vocab_card` mồ côi bằng câu lệnh cuối cùng trong `buildVocabLibraryUpsertStatements` (khi `options?.prune === true`):
    `DELETE FROM vocab_card WHERE word_id LIKE 'libword-%' AND NOT EXISTS (SELECT 1 FROM vocab_library_word WHERE vocab_library_word.id = vocab_card.word_id);`
- Vẫn giữ nguyên `FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE cascade` trên `vocab_card`.

## Requirements

- [ ] Trong `packages/db/src/schema/vocab.ts`, bỏ `.references(() => vocabWord.id, { onDelete: "cascade" })` trên cột `vocabCard.wordId` và cập nhật docblock giải thích `wordId` trỏ tới `vocab_word.id` hoặc `vocab_library_word.id` (`libword-*`).
- [ ] Sinh và kiểm duyệt từng câu lệnh trong migration `0039_<name>.sql` (`PRAGMA foreign_keys=OFF` → `CREATE TABLE __new_vocab_card` → `INSERT INTO __new_vocab_card SELECT ... FROM vocab_card` → `DROP TABLE vocab_card` → `ALTER TABLE __new_vocab_card RENAME TO vocab_card` → `PRAGMA foreign_keys=ON` → tạo lại đủ 3 index `vocab_card_student_word_uq`, `vocab_card_student_due_idx`, `vocab_card_word_idx`).
- [ ] Trong `packages/db/src/seed/vocab-library.ts` (`buildVocabLibraryUpsertStatements`), khi `options?.prune === true`, sau khi đã `INSERT` toàn bộ `courses`, `decks`, `words`, nối thêm câu lệnh `DELETE FROM vocab_card WHERE word_id LIKE 'libword-%' AND NOT EXISTS (SELECT 1 FROM vocab_library_word WHERE vocab_library_word.id = vocab_card.word_id);` để giữ nguyên thẻ của các từ còn trong CSV nhưng dọn sạch thẻ của từ đã bị xóa khỏi CSV.
- [ ] Trong `packages/db/src/schema/vocab.test.ts`, bật tường minh `await client.execute("PRAGMA foreign_keys = ON;")` sau `await migrate(...)` và viết unit test chứng minh:
  1. Dữ liệu `vocab_card` hiện có sống sót nguyên vẹn qua migration `0039`.
  2. Khi `PRAGMA foreign_keys = ON` (xác nhận `PRAGMA foreign_keys` trả về `1`), `vocab_card` insert thành công cả `word_id` thuộc `vocab_word` lẫn `word_id = 'libword-1'` thuộc `vocab_library_word`, trong khi insert `student_id` không tồn tại vẫn bị FK `student_id` chặn.
  3. Chạy lại `seedVocabLibrary(..., { prune: true })` giữ nguyên `vocab_card` của các `libword-*` còn trong bộ seed và xóa `vocab_card` của `libword-removed` không còn trong `vocab_library_word`.

## Architecture

```sql
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vocab_card` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`word_id` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`is_warning` integer DEFAULT false NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_vocab_card`("id", "student_id", "word_id", "level", "is_warning", "state", "interval_days", "due_at", "lapses", "created_at", "updated_at") SELECT "id", "student_id", "word_id", "level", "is_warning", "state", "interval_days", "due_at", "lapses", "created_at", "updated_at" FROM `vocab_card`;--> statement-breakpoint
DROP TABLE `vocab_card`;--> statement-breakpoint
ALTER TABLE `__new_vocab_card` RENAME TO `vocab_card`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_card_student_word_uq` ON `vocab_card` (`student_id`,`word_id`);--> statement-breakpoint
CREATE INDEX `vocab_card_student_due_idx` ON `vocab_card` (`student_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `vocab_card_word_idx` ON `vocab_card` (`word_id`);
```

## Related Code Files

- Modify: `packages/db/src/schema/vocab.ts`
- Create: `packages/db/src/migrations/0039_<generated>.sql` (+ cập nhật `packages/db/src/migrations/meta/_journal.json` và snapshot qua `drizzle-kit generate`)
- Modify: `packages/db/src/seed/vocab-library.ts`
- Modify: `packages/db/src/schema/vocab.test.ts`

## Implementation Steps

1. Mở `packages/db/src/schema/vocab.ts`, sửa định nghĩa `vocabCard.wordId`: bỏ `.references(() => vocabWord.id, { onDelete: "cascade" })`, cập nhật docblock nêu rõ `wordId` hỗ trợ `vocab_word.id` và `vocab_library_word.id` (`libword-*`).
2. Chạy `pnpm --filter @teacher-os/db exec drizzle-kit generate` để sinh migration `0039`.
3. Kiểm tra file SQL `0039_*.sql` vừa sinh: đảm bảo copy đủ 11 cột của `vocab_card`, giữ FK `student_id`, bỏ FK `word_id`, bật lại `PRAGMA foreign_keys=ON`, và tạo lại đủ 3 index (`vocab_card_student_word_uq`, `vocab_card_student_due_idx`, `vocab_card_word_idx`), kèm header comment hướng dẫn deploy order.
4. Cập nhật `packages/db/src/seed/vocab-library.ts`: ở cuối `buildVocabLibraryUpsertStatements`, nếu `options?.prune === true`, thêm câu lệnh dọn `vocab_card` mồ côi (`word_id LIKE 'libword-%' AND NOT EXISTS (...)`).
5. Trong `packages/db/src/schema/vocab.test.ts`, thêm `await client.execute("PRAGMA foreign_keys = ON;")` sau `await migrate(...)` và bổ sung test kiểm tra migration `0039` + polymorphic `word_id` + prune cleanup.
6. Chạy `pnpm --filter @teacher-os/db test` để xác nhận pass.

## Todo

- [ ] Bỏ FK `vocabCard.wordId` trong `packages/db/src/schema/vocab.ts`
- [ ] Generate và audit migration `0039`
- [ ] Thêm câu lệnh dọn `vocab_card` mồ côi khi `prune: true` trong `packages/db/src/seed/vocab-library.ts`
- [ ] Bật `PRAGMA foreign_keys = ON` sau `migrate()` và thêm unit test trong `packages/db/src/schema/vocab.test.ts`

## Success Criteria

- `pnpm --filter @teacher-os/db test` pass với `PRAGMA foreign_keys = 1` thực sự bật trên connection.
- `vocab_card` cho phép insert `word_id = 'libword-...'`, giữ `UNIQUE(student_id, word_id)`, và giữ FK `student_id -> student(id) ON DELETE cascade`.

## Risk Assessment

- **Recreate bảng `vocab_card` trên D1**: Tương tự `0038_wise_blizzard.sql`, cần chạy `db:migrate:deploy` trước khi deploy worker. Câu lệnh `INSERT INTO __new_vocab_card SELECT ...` bảo toàn 100% thẻ SRS đã học của học viên.

## Security Considerations

- Giữ nguyên `FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE cascade` và `UNIQUE(student_id, word_id)` để đảm bảo cô lập dữ liệu giữa các học viên.

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
