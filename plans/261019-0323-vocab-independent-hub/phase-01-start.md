---
title: "Phase 1: Khởi tạo branch & chốt quyết định kỹ thuật"
status: todo
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

- [ ] Branch `vinh19410/ai-handle-vocab-independent-hub` tạo từ `develop` mới nhất
- [ ] Baseline gates xanh trước khi sửa
- [ ] 2 quyết định kỹ thuật dưới đây được verify bằng evidence

## Implementation Steps

1. `git checkout develop && git pull && git checkout -b vinh19410/ai-handle-vocab-independent-hub`
2. Chạy baseline: `pnpm check && pnpm check-types` (nếu đỏ do môi trường → dừng, báo, không bắt đầu).
3. **Verify D2 — snapshot `vocabDecks` org-wide**: đọc `apps/server/src/routes/snapshot.ts` dòng 309–314 (query `vocabDeck` theo orgId, không filter class) và dòng 590–598 (map `KernelVocabDeckRow`); đồng thời đọc `apps/web/src/lib/repos/kernel.ts:480-518` (`SNAPSHOT_COLLECTION_KEYS` + `isSnapshotShape` runtime guard) để nêu rõ sequence deploy an toàn khi thêm snapshot field mới (phase 4). Lưu ý: snapshot build nằm ở `snapshot.ts`, KHÔNG phải `kernel.ts`.
4. **Verify D3 — drizzle migrate flow**: xác nhận lệnh apply migration local dùng trong #361 (xem `packages/db/package.json` scripts + `.alchemy/local`); đọc tiền lệ `packages/db/src/migrations/0011_classy_clea.sql` — repo đã từng đè SQL drizzle generate (recreate bảng) → migration 0038 của plan này cũng sẽ recreate `vocab_deck`, bắt buộc audit từng statement (phase 2).
5. Ghi kết quả verify vào mục Todo dưới đây (done = có evidence).

## Todo

- [ ] Branch tạo từ develop mới nhất
- [ ] Baseline `pnpm check` + `check-types` xanh
- [ ] D2 verify snapshot.ts org-wide + deploy sequence guard
- [ ] D3 verify migrate flow + precedent 0011

## Success Criteria

- Branch tồn tại, baseline xanh, 3 quyết định D1–D3 có kết luận viết trong file này (bổ sung mục "Kết quả verify" khi hoàn thành).

## Risk Assessment

- Baseline đỏ do env local (dev stack chiếm port) → chạy lại theo memory local-dev-stack, không sửa code để "fix" baseline.

## Next Steps

- Phase 2 (schema) phụ thuộc kết luận D1.
