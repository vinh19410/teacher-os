---
title: "Phase 2: Schema + Migration + Contracts"
status: todo
---

# Phase 2: Schema + Migration + Contracts

## Context Links

- Spec: `docs/srs-spec.md` §1 (card fields — sau khi Phase 1 copy) + Flinto `api/migrations/0005_sync.sql` (chỉ tham khảo hình dạng JSON data, KHÔNG port).
- Schema mẫu theo style repo: `packages/db/src/schema/class-assignment.ts` (comment doc, index, uniqueIndex, `timestamp_ms`).
- Contracts precedent: `packages/api/src/contracts.ts` (Zod `.strict()`, `STUDENT_ERROR_CODES`); release train note precedent #304 (contracts.ts:1945-1951).

## Overview

Tạo 4 bảng D1 cho vocab (deck / word / card / review log) + migration drizzle + Zod contracts cho cả teacher write-path lẫn student read/write-path. Card là SRS state per student; log snapshot word để sống sót khi deck bị xoá.

## Key Insights

- **Card lazy provision**: cards chỉ được tạo khi student mở deck lần đầu (`INSERT OR IGNORE` nhờ unique `(studentId, wordId)`) — không pre-create hàng loạt khi teacher tạo deck (1 deck × 40 học sinh × 50 từ = 2000 rows vô ích nếu chưa ai học).
- **Thứ tự từ khi provision dùng mốc ổn định** (red-team F8): `dueAt = vocab_deck.createdAt − (n − 1) + i` cho từ thứ i (port trick catalog Flinto §7, nơi `addedAtMs` là mốc sự kiện đơn). KHÔNG dùng `Date.now()` per-request — 2 request đồng thời (2 tab/retry) sẽ xen 2 mốc và đảo thứ tự Learn **vĩnh viễn** vì dueAt persist. `deck.createdAt` dùng chung cho mọi request → idempotent kể cả race.
- **Xoá deck KHÔNG dựa FK cascade** (red-team F7): PRAGMA `foreign_keys` theo-connection và e2e boot không set pragma (`apps/e2e/src/boot.ts:79-84`) → hành vi cascade khác nhau giữa e2e (libsql) và prod (D1). Route xoá (Phase 3) xoá `deck + words + cards` trong 1 `db.batch` — precedent `routes/assignments/tests.ts:131-132` "không dựa vào FK cascade". FK trong schema vẫn khai `onDelete: "cascade"` (defensive) nhưng logic xoá chủ động.
- **Log không FK tới card/deck**: teacher xoá deck → cascade words + cards, nhưng `vocab_review_log` giữ nguyên (streak/retention/history sống sót — đúng Flinto §5 "Deleting a deck ... keeping all ReviewLog rows"). Do đó log phải snapshot `word` + `translation` lúc ghi.
- `dueAt` integer epoch ms (`timestamp_ms` mode) — so sánh `dueAt <= now` bằng integer, tránh string ISO so lech.
- Migration KHÔNG pin số: chạy `pnpm db:generate` lấy số kế tiếp trong journal (P1 #358 có thể đã chiếm 0036 nếu cook trước).

## Requirements

- [ ] 4 bảng `vocab_deck`, `vocab_word`, `vocab_card`, `vocab_review_log` + index/unique đúng.
- [ ] Migration sinh bởi drizzle-kit, áp local được (e2e boot libsql + local dev D1).
- [ ] Contracts Zod `.strict()` cho: teacher deck/word mutations, student overview / session-data / answer / learn-commit payloads.
- [ ] Test contracts (parse/strip behavior) theo pattern test hiện có của `packages/api`.

## Architecture

```ts
// packages/db/src/schema/vocab.ts (mới)
vocab_deck:   id PK, orgId→organization(cascade), classId→class(cascade), title, lang (default "en"),
              createdAt, updatedAt  — index (orgId), (classId)
vocab_word:   id PK, deckId→vocab_deck(cascade), word, ipa (nullable), translation (notNull, default ""),
              audioKey (nullable), sortOrder int, createdAt, updatedAt — index (deckId)
vocab_card:   id PK, studentId→student(cascade), wordId→vocab_word(cascade),
              level int default 1, isWarning bool default false, state text default "new",
              intervalDays int default 0, dueAt int timestamp_ms notNull, lapses int default 0,
              createdAt, updatedAt — unique (studentId, wordId), index (studentId, dueAt), index (wordId)
vocab_review_log: id PK (= clientLogId do client sinh — Phase 3 idempotency), studentId→student(cascade),
              cardId text (no FK), deckId text (no FK), sessionKind "review"|"learn",
              grade "good"|"again", durationMs int, reviewedAt timestamp_ms,
              word text, translation text — index (studentId, reviewedAt)
```

Contracts mới trong `contracts.ts` (tên suggested) — **field list chốt ở đây là hợp đồng release-train server↔student, mọi phase sau tham chiếu không tự đổi** (red-team F10):
- Teacher: `vocabDeckCreateSchema`, `vocabDeckRenameSchema`, `vocabDeckDeleteSchema`, `vocabWordUpsertSchema`, `vocabWordRemoveSchema` — audio KHÔNG có field `audioKey` client-supplied (upload riêng Phase 3, server-set key — red-team F3).
- `vocabOverviewSchema`: `{ dueCount, nextDueAt (nullable), upcomingCount (nullable — 0 khi nextDueAt null, UI clamp max(1, n) khi render), learnedCount, matureCount, levelDistribution[5], streak, retention (nullable khi 0 log), forecast[7], decks: [{ deckId, title, className, total, newCount, dueCount }] }` — **mọi due metric chỉ tính card `state="review"`** (red-team F5; spec §5 global review pool).
- `vocabSessionDataSchema`: `{ deck: { id, title, lang }, cards: [{ id, wordId, word, translation, ipa (nullable), audioKey (nullable), level, isWarning, state, intervalDays, dueAt, lapses }], pool: [{ wordId, word, translation, lang, deckId }] }` — pool chỉ cần text làm distractor (KHÔNG có hasAudio — audio eligibility của `listeningChoice` thuộc card đang hỏi, spec §4).
- `vocabAnswerSchema`: `{ clientLogId (uuid), cardId, correct, durationMs }`; `vocabLearnCommitSchema`: `{ clientLogId (uuid), cardId, gradeGood, durationMs }` — `gradeGood` ≡ `firstTryCorrect` của mọi scored step của từ (spec §3b rule 7; từ không có scored step → true).
- `VOCAB_ERROR_CODES` (pattern `STUDENT_ERROR_CODES`).
- `durationMs`: int ≥ 0, **server clamp** `min(value, 3_600_000)` thay vì reject (red-team F13 — learn-commit là tổng nhiều bước + intro dwell, học sinh treo máy lâu vẫn phải commit được; clamp giữ chống spam).

## Related Code Files

- Create: `packages/db/src/schema/vocab.ts`, migration `packages/db/src/migrations/00xx_vocab_srs.sql` (generate).
- Modify: `packages/db/src/schema/index.ts` (re-export nếu pattern có), `packages/api/src/contracts.ts` (thêm schemas), test contracts file tương ứng.

## Implementation Steps

1. Viết `packages/db/src/schema/vocab.ts` theo cây trên — comment doc từng bảng giải thích invariant (isWarning chỉ L5; intervalDays display-only; log snapshot lý do sống sót cascade). Theo style `class-assignment.ts` (comment JSDoc đầu bảng).
2. Chạy `pnpm db:generate` → migration SQL mới; mở SQL review: đủ 4 bảng + index + unique; comment đầu file ghi `DEPLOY ORDER: migrate TRƯỚC worker` theo precedent `0035_ambiguous_freak.sql`.
3. Thêm contracts vào `contracts.ts` theo field list đã chốt ở Architecture: mọi object `.strict()`; `durationMs` int ≥ 0 (server clamp 3_600_000 — không reject, xem Key Insights); `clientLogId` = uuid string; `grade` enum 2 giá; `state`/`level` range 1–5.
4. Viết test contracts: valid payload pass, field lạ bị strip/reject đúng `.strict()`, boundary (level 0/6 reject, durationMs âm reject, durationMs 4_000_000 pass — clamp xảy ra server-side không phải contract).
5. Chạy `pnpm --filter @teacher-os/api run test` + `pnpm check-types` (schema type export dùng được từ apps/server).

## Todo

- [ ] `vocab.ts` schema + migration generate + review SQL
- [ ] Contracts teacher + student + error codes
- [ ] Test contracts pass
- [ ] `pnpm check-types` sạch

## Success Criteria

- Migration apply trên local D1 không lỗi (chạy local dev stack boot được).
- Unique `(studentId, wordId)` tồn tại trong SQL (grep migration file).
- Test contracts pass; `.strict()` không cho phép field lạ (assert trong test).

## Risk Assessment

- **Đụng số migration với plan P1 #358** (cùng định 0036): chọn số theo journal lúc generate — whichever cooks trước lấy số trước, plan sau tự dồn. Không khoá cứng.
- **`audioKey` chưa có route upload ở phase này** — nullable, Phase 3 mới gắn media-store; schema không phụ thuộc.

## Security Considerations

- Contracts `.strict()` mọi schema mới (chặn field lạ — precedent repo).
- Không có secret/PII mới; `vocab_review_log.durationMs` cap chèn garbage.
- Ownership check (student chỉ thấy card của mình) thuộc Phase 3 — schema đặt index đúng để query đó rẻ (`studentId, dueAt`).
