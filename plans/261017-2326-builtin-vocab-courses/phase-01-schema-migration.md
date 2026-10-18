---
title: "Phase 1: Schema & Migration"
status: todo
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Schema & Migration

## Overview

Tạo 3 bảng library global (không `orgId`) cho catalog từ vựng dùng chung, mở rộng `vocab_deck` (provenance) và `vocab_word` (audio URL) bằng cột nullable, sinh migration 0037 qua drizzle-kit, và định trước toàn bộ Zod contracts mà Phase 3/4 tiêu thụ. Catalog KHÔNG nullable- hóa `vocab_deck.orgId`/`classId` — hai cột NOT NULL đó là nền của mọi query org-scoped đã ship (#359), nullable hóa là IDOR surface.

## Context Links

- Scout report: `plans/261017-2326-builtin-vocab-courses/reports/scout-report.md` (mục 4 rủi ro, mục 5 quyết định).
- Schema vocab hiện tại: `packages/db/src/schema/vocab.ts` — `vocabDeck` :21-44 (`orgId` NOT NULL :25-27, `classId` NOT NULL :28-30), `vocabWord` :52-72 (`audioKey` nullable :62).
- Migration mới nhất: `packages/db/src/migrations/0036_bored_infant_terrible.sql`; journal `meta/_journal.json` idx cuối = 36 → migration kế tiếp là 0037. Header precedent "DEPLOY ORDER": `0033_adorable_felicia_hardy.sql:2`, `0035_ambiguous_freak.sql:2`.
- Contracts: `packages/api/src/contracts.ts` — `KernelVocabDeckRow` :2166-2173, `vocabSessionCardSchema` :2311-2326, `vocabTeacherWordSchema` :2226-2236, `VOCAB_ERROR_CODES` :2162, release-train note :2156-2157.
- drizzle config: `packages/db/drizzle.config.ts` (dialect sqlite, out `./src/migrations`).

## Key Insights

- **Library tách bảng, không tổ chức**: 3 bảng mới không có `orgId`/`classId` — read là toàn cục theo yêu cầu đề bài; write vào org chỉ xảy ra qua clone (Phase 3). Đây là cơ chế content global đầu tiên của repo (syllabus template #79 vẫn org-scoped, `schema/syllabus.ts:34-47`).
- **Deterministic id = idempotent seed**: PK là text suy ra trực tiếp từ CSV id (`libcourse-<csvId>`, `libdeck-<csvId>`, `libword-<csvId>`, ví dụ `libcourse-6`, `libword-44753`). Chạy seed lại bao nhiêu lần cũng ra cùng hàng, `ON CONFLICT(id) DO UPDATE` cập nhật nội dung mà không đổi id.
- **`sourceLibraryDeckId` KHÔNG có FK**: clone phải sống sót cả khi thư viện bị re-seed/đổi — FK cascade ngược chiều sẽ có nguy cơ xoá deck của teacher khi library đổi. Chỉ là con trỏ text nullable + index để lọc/badge.
- **Chỉ thêm `audioUrl` vào `vocab_word`**: các field CSV khác (`pos`, `sentenceVi`, `sentenceEn`, `picture`) hiện KHÔNG có consumer nào — teacher words route trả `id/deckId/word/ipa/translation/audioKey/sortOrder` (`vocab-teacher.ts:90-106`), session card có `word/translation/ipa/audioKey` (`vocab-provision.ts:138-151`), word editor chỉ render các field đó + upload. Data đầy đủ vẫn nằm trong `vocab_library_word` để dùng sau (YAGNI có chủ đích).
- **`hasAudio` additive đúng MỘT chiều — chiều ngược lại là breaking có chủ đích**: vectors `eligibility` (`packages/api/src/srs/vectors/level-vectors.json:439`) chỉ test `typingEligible` per-word, không test audio. `.default(false)` giữ chiều payload-cũ → schema-mới parse được. Nhưng `vocabSessionCardSchema` là `.strict()` (`contracts.ts:2321`) và student **runtime-parse** (`apps/student/src/lib/repos/vocab.ts:56` — có sẵn test khẳng định reject field lạ, `vocab-contracts.test.ts:77,125`) → server mới + student cũ = `ZodError` làm **toàn bộ session-data vocab vỡ**, không riêng deck library. Hệ quả bắt buộc: server + student deploy cùng release train (đã là cơ chế alchemy deploy chung — `docs/production-release-runbook.md:206-208`), và rollback server mà chưa rollback student cũng vỡ chiều ngược. Ghi vào checklist PR, không phải footnote.

## Requirements

- [ ] 3 bảng `vocab_library_course`, `vocab_library_deck`, `vocab_library_word` + index `(courseId)`/`(deckId)` đúng.
- [ ] `vocab_deck.source_library_deck_id` nullable + index; `vocab_word.audio_url` nullable; không đổi cột NOT NULL nào.
- [ ] Migration 0037 sinh bởi `pnpm db:generate`, header ghi DEPLOY ORDER, review SQL trước khi commit.
- [ ] Contracts: 4 schema library (course/deck/words-response/clone) + mở rộng 3 schema cũ (`hasAudio`, `audioUrl`, `sourceLibraryDeckId`) + 3 error codes mới, tất cả `.strict()`.
- [ ] Test contracts pass (pattern `packages/api/src/vocab-contracts.test.ts`).

## Architecture

DDL sketch (drizzle style, SQL cột tương ứng do generator sinh):

```ts
// packages/db/src/schema/vocab-library.ts (mới)
vocabLibraryCourse: id PK text ("libcourse-<csvId>"), name text notNull,
  description text nullable, target text nullable, sortOrder int notNull default 0,
  createdAt, updatedAt (timestamp_ms, cùng default expression với vocab.ts:33-38)
vocabLibraryDeck: id PK text ("libdeck-<csvId>"), courseId FK→course(cascade),
  title text notNull, imageUrl text nullable, sortOrder int notNull default 0,
  createdAt, updatedAt — index (courseId)
vocabLibraryWord: id PK text ("libword-<csvId>"), deckId FK→deck(cascade),
  word text notNull, ipa text nullable, pos text nullable,
  translation text notNull default "", sentenceVi text nullable, sentenceEn text nullable,
  pictureUrl text nullable, audioUrl text nullable, sortOrder int notNull default 0,
  createdAt, updatedAt — index (deckId)

// packages/db/src/schema/vocab.ts (mở rộng)
vocabDeck + sourceLibraryDeckId text nullable — index "vocab_deck_source_library_idx" (KHÔNG FK)
vocabWord + audioUrl text nullable (KHÔNG FK)
```

Contracts thêm vào `packages/api/src/contracts.ts` (mọi object `.strict()`):

- `vocabLibraryCourseSchema` `{ id, name, description nullable, target nullable, deckCount int, sortOrder }`.
- `vocabLibraryDeckSchema` `{ id, courseId, title, imageUrl nullable, wordCount int, sortOrder }`.
- `vocabLibraryWordsResponseSchema` `{ deck: { id, title }, words: [{ id, word, ipa, pos, translation, sentenceVi, sentenceEn, pictureUrl, audioUrl, sortOrder }] }` (preview capped ở Phase 3).
- `vocabLibraryCloneSchema` `{ classId: string min 1, deckIds: array(string) min 1 max 50 }`.
- `vocabSessionCardSchema` + `hasAudio: z.boolean().default(false)`; `vocabTeacherWordSchema` + `audioUrl: z.string().nullable()`; `KernelVocabDeckRow` + `sourceLibraryDeckId: string | null`.
- `VOCAB_ERROR_CODES` + `LIBRARY_COURSE_NOT_FOUND`, `LIBRARY_DECK_NOT_FOUND`, `LIBRARY_CLONE_TOO_LARGE`.

## Related Code Files

- Create: `packages/db/src/schema/vocab-library.ts`, migration `packages/db/src/migrations/0037_*.sql` (generator đặt tên).
- Modify: `packages/db/src/schema/vocab.ts` (2 cột mới), `packages/db/src/schema/index.ts` (export `./vocab-library`), `packages/api/src/contracts.ts`.
- Test: `packages/api/src/vocab-contracts.test.ts` (mở rộng).

## Implementation Steps

1. Viết `packages/db/src/schema/vocab-library.ts` theo DDL trên, JSDoc mỗi bảng giải thích invariant (global read, deterministic id, không orgId; `pos`/`sentence*`/`pictureUrl` giữ full fidelity cho tương lai dù chưa có consumer). Style theo `packages/db/src/schema/vocab.ts`.
2. Sửa `packages/db/src/schema/vocab.ts`: thêm `sourceLibraryDeckId` vào `vocabDeck` + index, `audioUrl` vào `vocabWord`; comment giải thích vì sao không FK.
3. Export `./vocab-library` trong `packages/db/src/schema/index.ts`.
4. Chạy `pnpm db:generate` từ repo root (script `db:generate` ở root `package.json` trỏ turbo vào `@teacher-os/db`). Mở migration SQL sinh ra review: đủ 3 CREATE TABLE + 2 ALTER TABLE ADD COLUMN + index; bổ sung header `-- DEPLOY ORDER (bắt buộc): chạy db:migrate:deploy TRƯỚC khi deploy worker` theo precedent `0035_ambiguous_freak.sql:2` nếu generator chưa chèn.
5. Thêm contracts vào `packages/api/src/contracts.ts` đúng danh sách ở Architecture, giữ release-train note cập nhật.
6. Mở rộng `packages/api/src/vocab-contracts.test.ts`: `hasAudio` default false khi thiếu field (payload cũ parse được), `deckIds` rỗng/61 phần tử reject, field lạ reject `.strict()`.
7. Chạy `pnpm --filter @teacher-os/api test` + `pnpm check-types`.

## Todo

- [ ] `vocab-library.ts` schema + 2 cột mở rộng + export index
- [ ] Migration 0037 generate + review SQL + header DEPLOY ORDER
- [ ] Contracts library + mở rộng 3 schema + error codes
- [ ] Test contracts pass, `pnpm check-types` sạch

## Success Criteria

- Migration apply được trên libsql: `pnpm --filter e2e exec tsx -e "import {createClient} from '@libsql/client'; ..."` hoặc gián tiếp qua `pnpm --filter server test` (test suite tự migrate — `vocab-teacher.test.ts:17-24` dùng migrator thật).
- Grep migration 0037 thấy `source_library_deck_id` nullable (không NOT NULL) và `CREATE INDEX vocab_deck_source_library_idx`.
- `pnpm --filter @teacher-os/api test` pass; payload session-data cũ (không `hasAudio`) vẫn parse thành công; thêm test ghi nhận chiều ngược: payload có `hasAudio` bị schema `.strict()` cũ-tương-đương reject — đây là breaking được ghi nhận chủ đích, kèm comment trỏ về release-train note `contracts.ts:2156-2157`.

## Risk Assessment

- **Trùng số migration với plan khác đang cook song song** (likelihood thấp, impact thấp): không pin cứng 0037 — lấy số kế tiếp trong `meta/_journal.json` lúc generate, plan này ghi "0037" theo trạng thái hiện tại (idx 36).
- **Quên `.default(false)` cho `hasAudio`** (likelihood trung, impact cao): payload cũ từ server cũ sẽ vỡ schema student — test bước 6 chặn.
- **Nullable hóa nhầm cột org/class** (likelihood thấp, impact cao): phạm vi cột đã liệt kê tường minh; review SQL bước 4 đối chiếu.
- **Deploy lệch train server/student** (likelihood trung, impact cao — red team): student parse `.strict()` runtime nên bundle student cũ + worker mới = mọi deck (kể cả deck #359 cũ) không mở được tới khi student tải bundle mới. Mitigation: alchemy deploy worker + student assets cùng bước (runbook:206-208); PR checklist ghi "đừng promote riêng lẻ"; tab SPA đang mở cần reload — chấp nhận vignette ngắn.<!-- Updated: Red Team Session 1 - release train 2 chiều -->
- **Rollback worker về bản cũ khi student đã mới** (likelihood thấp, impact trung): chiều cũ→mới của cùng vấn đề — payload cũ thiếu `hasAudio` parse được nhờ `.default(false)` nên student mới vẫn chạy; chỉ ghi nhận để runbook rollback khỏi bất ngờ.

## Security Considerations

- Bảng library không có dữ liệu user/org — read toàn cục là chủ đích, không lộ PII.
- Không thêm secret; CSV seed là nội dung học công khai (vấn đề giấy phép ghi ở plan.md Open Questions, không phải security kỹ thuật).
- Contracts `.strict()` toàn bộ schema mới (chặn field lạ — precedent repo `contracts.ts:2156-2157`).

## Next Steps

Phase 2 (seed pipeline từ CSV) và Phase 3 (library API + clone) cùng đọc schema này; Phase 3 bắt buộc dùng đúng contracts đã chốt ở đây, không tự đổi field.
