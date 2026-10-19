---
title: "Phase 1: Khởi tạo branch & chốt quyết định kỹ thuật"
status: done
---

# Phase 1: Khởi tạo branch & chốt quyết định kỹ thuật

## Context Links

- Brainstorm contract: session 2026-10-19 (hướng A — deck org-scoped + bảng suggestion)
- Schema hiện tại: `packages/db/src/schema/vocab.ts` — `vocabDeck.classId NOT NULL` (dòng 28)
- Migration cuối: `packages/db/src/migrations/0037_cheerful_gambit.sql`

## Overview

Tạo branch làm việc, xác nhận baseline xanh, và chốt 2 quyết định kỹ thuật còn nghi ngờ trước khi đụng schema (mỗi quyết định verify bằng lệnh cụ thể — không giả định).

## Key Insights

- Quyết định đã chốt ở brainstorm + red-team: suggestion luôn trỏ `deckId` thật (muốn gợi ý bài library → clone thành deck riêng rồi gợi ý, tái dùng clone flow #361); re-suggest sau dismiss được phép; tab Tiến độ mặc định theo học viên.
- **Red-team đã xác nhận bằng codebase:** snapshot `vocabDecks` là org-wide (`apps/server/src/routes/snapshot.ts:311-313`) — deck không lớp tự xuất hiện; `packages/db` ĐÃ có vitest (`packages/db/package.json:13`).
- Progress KHÔNG đưa vào kernel snapshot (snapshot-once, bài học #343) — dùng endpoint GET riêng.
- Red-team RT-19: dùng `UNIQUE(student_id, deck_id)` thường + upsert flip-status (bỏ partial unique index — không pattern tiền lệ nào trong repo, fallback phức tạp hơn thiết kế chính). Không cần bước verify D1 nữa.

## Requirements

- [x] Branch `ai-handle-issue-363` tạo từ `develop` mới nhất (`90ad060`)
- [x] Baseline gates xanh trước khi sửa (`pnpm check && pnpm check-types` exit 0, 12/12 packages)
- [x] 2 quyết định kỹ thuật dưới đây được verify bằng evidence
## Implementation Steps

1. `git checkout develop && git pull && git checkout -b vinh19410/ai-handle-vocab-independent-hub`
2. Chạy baseline: `pnpm check && pnpm check-types` (nếu đỏ do môi trường → dừng, báo, không bắt đầu).
3. **Verify D2 — snapshot `vocabDecks` org-wide**: đọc `apps/server/src/routes/snapshot.ts` dòng 309–314 (query `vocabDeck` theo orgId, không filter class) và dòng 590–598 (map `KernelVocabDeckRow`); đồng thời đọc `apps/web/src/lib/repos/kernel.ts:480-518` (`SNAPSHOT_COLLECTION_KEYS` + `isSnapshotShape` runtime guard) để nêu rõ sequence deploy an toàn khi thêm snapshot field mới (phase 4). Lưu ý: snapshot build nằm ở `snapshot.ts`, KHÔNG phải `kernel.ts`.
4. **Verify D3 — drizzle migrate flow**: xác nhận lệnh apply migration local dùng trong #361 (xem `packages/db/package.json` scripts + `.alchemy/local`); đọc tiền lệ `packages/db/src/migrations/0011_classy_clea.sql` — repo đã từng đè SQL drizzle generate (recreate bảng) → migration 0038 của plan này cũng sẽ recreate `vocab_deck`, bắt buộc audit từng statement (phase 2).
5. Ghi kết quả verify vào mục Todo dưới đây (done = có evidence).

## Todo

- [x] Branch tạo từ develop mới nhất
- [x] Baseline `pnpm check` + `check-types` xanh
- [x] D2 verify snapshot.ts org-wide + deploy sequence guard
- [x] D3 verify migrate flow + precedent 0011

## Success Criteria

- Branch tồn tại, baseline xanh, 3 quyết định D1–D3 có kết luận viết trong file này (bổ sung mục "Kết quả verify" khi hoàn thành).


## Kết quả verify

- **D1 (UNIQUE index):** Đã chốt theo RT-19 — dùng `UNIQUE(student_id, deck_id)` thường + upsert flip-status.
- **D2 (Snapshot `vocabDecks` & `vocabSuggestions`):** `apps/server/src/routes/snapshot.ts:309-314` query `vocabDeck` theo `orgId` toàn org (không filter class); dòng 590–598 map `KernelVocabDeckRow`. `apps/web/src/lib/repos/kernel.ts:477-518` dùng `SNAPSHOT_COLLECTION_KEYS` + `isSnapshotShape` (bắt buộc mỗi key trong `SNAPSHOT_COLLECTION_KEYS` phải `Array.isArray`). Do đó khi thêm `vocabSuggestions?: KernelVocabSuggestionRow[]` (optional), cần tách key optional khỏi `SNAPSHOT_COLLECTION_KEYS` (hoặc cho phép `record[key] === undefined || Array.isArray(record[key])` trong `isSnapshotShape`) và deploy server trả field trước khi deploy web.
- **D3 (Drizzle migrate flow & precedent 0011):** `packages/db/package.json` có `db:generate` (`drizzle-kit generate`), `db:migrate:deploy` (`drizzle-kit migrate`), `test` (`vitest run`). Precedent `0011_classy_clea.sql` xác nhận pattern recreate bảng SQLite (`PRAGMA foreign_keys=OFF; CREATE TABLE __new_...; INSERT INTO __new_... SELECT ...; DROP TABLE ...; ALTER TABLE __new_... RENAME TO ...; PRAGMA foreign_keys=ON; CREATE INDEX ...`).
## Risk Assessment

- Baseline đỏ do env local (dev stack chiếm port) → chạy lại theo memory local-dev-stack, không sửa code để "fix" baseline.

## Next Steps

- Phase 2 (schema) phụ thuộc kết luận D1.

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
