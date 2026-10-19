---
title: "Phase 3: API contracts + student access rule & suggestion lifecycle"
status: todo
---

# Phase 3: API contracts + student access rule & suggestion lifecycle

## Context Links

- Contracts: `packages/api/src/contracts.ts` (`vocabOverviewSchema`, `vocabSessionDataSchema`, …)
- Student routes: `apps/server/src/routes/vocab.ts` (mount `/vocab/*` trong `studentRoutes` — RT#1, không mount standalone trong app.ts)
- Provision: `apps/server/src/lib/vocab-provision.ts` (`ensureDeckCards` — INNER JOIN enrollment)
- Tests hiện có: `apps/server/src/routes/vocab.test.ts`

## Overview

Định nghĩa zod contracts cho suggestion + mở overview; mở rule truy cập deck ("enrolled HOẶC accepted suggestion") xuyên suốt overview / session-data / provision; thêm 2 endpoint student accept/dismiss.

## Key Insights

- **RT-F1 (Critical) — rule truy cập áp cho ĐỦ 5 call sites, không phải 3:** enrollment-join cứng hiện nằm ở: (1) overview `vocab.ts:311`; (2) `loadOwnedSessionCard` `vocab.ts:76-92` — phục vụ **POST `/vocab/answer`** (`:528`) VÀ **POST `/vocab/learn-commit`** (`:656`, retry `:728`); (3) audio `/vocab/audio/:wordId` `vocab.ts:767-781`; (4) `ensureDeckCards` `vocab-provision.ts:43-49`; (5) `loadPool` `vocab-provision.ts:178-191` (pool ôn SRS trong session-data). `eq(enrollment.classId, NULL)` không bao giờ match → thiếu chỗ nào thì deck riêng 404 ngay chỗ đó (student học card đầu tiên là vỡ answer; pool rỗng giết minigame distractor).
- **RT-F2 — route POST mới bắt buộc qua `vocabWriteGuard`:** student router KHÔNG có origin guard toàn cục; pattern repo là MỖI write path đăng ký cặp `requireStudent` + `vocabWriteGuard` (Origin allowlist + content-type JSON + bodyLimit 4096 — `vocab.ts:255-294`, mount 289-294). Cookie SameSite=None → thiếu guard = CSRF hole.
- **RT-F4 (Critical) — `.strict()` KHÔNG additive:** zod strict reject unknown key (`vocab-contracts.test.ts:50-52,79-82` chứng minh); `className` đổi thành null cũng fail client cũ (`expected string, received null`). An toàn thật đến từ release train server+student cùng promotion (bài học #319), KHÔNG phải từ strict. Field mới phía response phải dùng `.catch()`/default theo pattern `contracts.ts:1594-1598` (#264) để client MỚI parse được payload CŨ và ngược lại; `className` giữ `z.string().catch("")` + thêm field riêng `source`.
- **RT-F7 — union phải dedupe:** deck thuộc cả 2 nhánh (enrolled + suggested) → set-union theo deckId, precedence `source: 'class'` > `'suggested'`, kèm test case deck 2 nhánh.
- **RT-F6 — transition matrix:** accept idempotent; dismiss chỉ hợp lệ từ `pending` (accepted → 409); teacher thu hồi là flip status (phase 4), không hard-delete.
- Overview hiện query enrolled decks INNER JOIN class + enrollment → đổi thành union dedupe như trên.
- Suggestion pending trả kèm wordCount (đếm `vocab_word`) + note + createdAt.
- **TOCTOU/ON CONFLICT (bài học #359):** provision `ensureDeckCards` đã dùng `INSERT OR IGNORE` theo unique (studentId, wordId), giữ nguyên.

## Requirements

- [ ] Contracts mới/đ mở theo pattern compat: `vocabSuggestionItemSchema`, overview thêm `suggestions[]` + `decks[].source` (`.catch`/default); `className` giữ type cũ `z.string().catch("")` — KHÔNG đổi nullable trên wire; test compat 2 chiều (client schema MỚI parse payload CŨ; schema cũ parse payload mới được bắt lỗi rõ)
- [ ] `GET /api/student/vocab/overview` trả deck riêng đã accepted + suggestions pending; union DEDUPE theo deckId (source precedence class > suggested)
- [ ] `POST /api/student/vocab/suggestions/:id/accept` → status accepted + respondedAt (idempotent khi đã accepted) — KHÔNG provision ngay (provision giữ lazy ở session-data)
- [ ] `POST /api/student/vocab/suggestions/:id/dismiss` → chỉ từ `pending` (đã accepted → 409)
- [ ] Cả 2 route trên đăng ký `requireStudent` + `vocabWriteGuard` theo pattern `vocab.ts:283-296`; test Origin lạ → 403
- [ ] Access predicate dùng chung thay enrollment-join ở ĐỦ 5 call sites (overview, loadOwnedSessionCard, audio, ensureDeckCards, loadPool)
- [ ] IDOR âm tính: student B gọi overview/session-data/accept/suggestion của A → 403/404; deck riêng chưa accepted → 404 ở answer/learn-commit/audio

## Architecture

```
access predicate (một nguồn, dùng chung 5 sites):
  canAccess(deck, studentId) =
    (deck.classId != null AND enrollment(studentId, deck.classId).status='active')
    OR EXISTS(vocab_suggestion(studentId, deck.id, status='accepted'))

GET /vocab/overview
  decks[]        = DEDUPE(enrolled ∪ accepted-suggestion) theo deckId
                   source: 'class' nếu enrolled, precedence class > suggested
                   className: string (rỗng "" cho deck riêng — giữ type wire cũ)
  suggestions[]  = pending của studentId (deck title, wordCount, note, createdAt)
  stats          = tổng hợp trên decks[] đã dedupe

POST /vocab/suggestions/:id/accept   # ownership: suggestion.studentId === ctx.studentId; pending|accepted → accepted (idempotent)
POST /vocab/suggestions/:id/dismiss  # pending → dismissed; accepted → 409
```

## Related Code Files

- Sửa: `packages/api/src/contracts.ts`, `packages/api/src/vocab-contracts.test.ts`
- Sửa: `apps/server/src/routes/vocab.ts` (overview, loadOwnedSessionCard, audio, 2 route mới, guard mount), `apps/server/src/lib/vocab-provision.ts` (ensureDeckCards, loadPool)
- Sửa: `apps/server/src/routes/vocab.test.ts` (các case dưới)

## Implementation Steps

1. Thêm contracts theo pattern compat `.catch()` (mục Key Insights) + contract tests 2 chiều.
2. Viết hàm access predicate dùng chung trong `vocab-provision.ts`; refactor đủ **5 sites**: overview, `loadOwnedSessionCard`, audio query, `ensureDeckCards`, `loadPool`.
3. Thêm 2 route accept/dismiss với cặp guard `requireStudent` + `vocabWriteGuard` (mount `/vocab/suggestions` và `/vocab/suggestions/*`).
4. Overview: query union + dedupe + suggestions pending (1 query join đếm từ).
5. Tests server (`vocab.test.ts`): (a) accept → session-data provision + **answer + learn-commit + audio + pool chứa từ deck riêng** (RT-F1), (b) dismiss ẩn + accepted-dismiss → 409, (c) IDOR: B không thấy suggestion của A; deck riêng chưa accepted → 404 ở cả overview/answer/audio; Origin lạ → 403, (d) deck lớp cũ nguyên vẹn (answer/learn-commit regression), (e) re-suggest sau dismissed flip về pending (upsert), (f) deck đồng thời enrolled + suggested hiện 1 lần source='class'.
6. `pnpm --filter server test` xanh.

## Todo

- [ ] Contracts compat (.catch) + contract tests 2 chiều
- [ ] Access predicate dùng chung — 5 call sites
- [ ] Route accept/dismiss + vocabWriteGuard + test CSRF
- [ ] Overview union dedupe + suggestions
- [ ] Server tests a–f

## Success Criteria

- Toàn bộ test server pass. Verify bằng đếm call sites (KHÔNG grep chuỗi liền — join đa dòng): đếm `innerJoin(\n enrollment` trong `vocab.ts` + `vocab-provision.ts` trước khi refactor (kỳ vọng 5) và sau khi refactor — mỗi site còn lại phải đối chiếu danh sách 5 sites ở Key Insights và giải thích được.

## Risk Assessment

- Đổi overview query dễ vỡ stats hiện có (VocabCountdown) → giữ nguyên shape stats, chỉ thêm field; chạy test student cũ ở phase 6 sớm.
- RT-F4: schema `.strict()` KHÔNG tương thích forward — bundle student cũ đang mở sẽ crash parse nếu server trả field mới không `.catch()` → mọi field mới dùng `.catch()`/default; an toàn cuối cùng do release train cùng promotion server+student (#319), không dựa vào tính chất schema.

## Security Considerations

- Ownership check mọi route suggestion theo `studentId` + `orgId` từ ctx (không tin input).
- Deck riêng (classId null) tuyệt đối không lọt vào list của student chưa accepted — test âm tính bắt buộc.
