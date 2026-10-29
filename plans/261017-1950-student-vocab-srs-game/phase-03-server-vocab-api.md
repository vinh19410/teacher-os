---
title: "Phase 3: Server Vocab API"
status: todo
---

# Phase 3: Server Vocab API

## Context Links

- Guard pattern: `apps/server/src/routes/student.ts:500-594` (`requireStudent` closure, đăng ký per-path; comment RT#1 tại `student.ts:586-588`; precedent #320 đăng ký `path` **và** `path/*` — `student.ts:592-594`).
- **RT#1 ràng buộc mount** (red-team F2): bootstrapMiddleware bỏ qua `/api/student/*` (`app.ts:86-93`) → vocab student routes PHẢI khai báo bên trong `studentRoutes()`, **CẤM** `app.route("/api/student/vocab", ...)` ở `app.ts` (router mount riêng sẽ không có auth).
- Enrollment guard precedent: `/classes/:classId` IDOR guard `student.ts:833-849` (join `enrollment`: org + studentId + classId + status active → 404).
- Route factory + deps: `apps/server/src/app.ts` (`Db` re-export ~:20, `AppDeps.getDb()` ~:49), `StudentRouteDeps` (`student.ts:76-83`).
- Kernel sub-route precedent: `routes/assignments/` mount tại `kernel.ts:2099-2105` (dòng :78-83 chỉ là import); read-path teacher qua `loadSnapshot` (`snapshot.ts:184` — Promise.all full-org selects).
- Batch atomic precedent: `BatchItem` từ `drizzle-orm/batch` (`kernel.ts:68`); xoá không-FK-cascade precedent `routes/assignments/tests.ts:131-132`; `.onConflictDoNothing()` precedent `ingest-transaction.ts:133`.
- Media precedent: `MediaStore` (`apps/server/src/lib/media-store.ts:14-26` — flat, KHÔNG org-scoping); key convention org-scoped `quiz-media/${orgId}/${attemptId}/${uuid}` (`student.ts:1383`); response an toàn `mediaObjectResponse` nosniff + sandbox (`student.ts:1513-1517`); PUT media duy nhất hiện có là student attempt (`student.ts:1328`) — **không có route upload teacher nào để reuse, phải tạo**.

## Overview

Toàn bộ server cho vocab: student endpoints (overview stats, session-data có lazy provision + enrollment guard, answer/learn-commit atomic + idempotent) khai báo bên trong `studentRoutes()` ở route file mới `routes/vocab.ts`; teacher CRUD deck/word + upload audio ở sub-route `routes/vocab-teacher.ts` mount vào kernel; snapshot teacher chỉ thêm `vocabDecks`. Server chạy `applyAnswer`/`learned` từ engine Phase 1 — cùng module student dùng.

## Key Insights

- **Enrollment check mọi endpoint chạm deck** (red-team F1 Critical): session-data + audio stream join `enrollment` (org + studentId + class của deck + status active) trước khi provision/trả — 404 nếu không enroll. Thiếu check này = IDOR: student org A provision card + đọc toàn bộ từ của deck org B qua `deckId` leak.
- **Server KHÔNG chấm lại đáp án** (Key Decision 3 plan.md): client gửi `correct` boolean / `gradeGood`; server verify ownership + enrollment rồi apply toán engine. Honor-policy.
- **Idempotent chống TOCTOU** (red-team F6): KHÔNG chỉ SELECT-then-insert (2 request đồng thời cùng `clientLogId` đều qua check → UNIQUE 500). Insert dùng `.onConflictDoNothing()` / bắt UNIQUE constraint → khi conflict re-read log + card → trả 200 replay. Kèm **guard dueAt** cross-session: nếu card `state="review" && dueAt > now` → trả card hiện tại, không apply (2 tab 2 phiên không nhảy level 2 lần — spec §1 "due iff dueAt <= now").
- **Lazy provision mốc ổn định**: `ensureDeckCards` dùng `vocab_deck.createdAt` làm base `dueAt = base − (n−1) + i` (KHÔNG `Date.now()` per-request — red-team F8); `INSERT OR IGNORE` unique `(studentId, wordId)` idempotent kể cả race.
- **Due metrics chỉ tính `state="review"`** (red-team F5): dueCount/nextDueAt/upcomingCount/forecast/deck-due đều lọc state — card `new` có dueAt quá khứ (trick provision) nhưng KHÔNG thuộc review pool (spec §5:234, :86 "never flood"). `newCount` đếm riêng.
- **Streak đúng spec §5** (red-team F12): chuỗi ngày VN liên tiếp **kết thúc ở hôm nay hoặc hôm qua** (hôm nay trống → giữ streak hôm qua; hôm qua cũng trống → 0). Retention = `grade != again` / mọi log (0 log → null). Forecast 7 ngày tới theo ngày VN, **loại card overdue** (day offset < 0). Personal best → Out of Scope.
- **Distractor pool**: `SELECT wordId, word, translation, lang, deckId` mọi live card **của student này** (đúng field list `vocabSessionDataSchema` Phase 2 — KHÔNG hasAudio).
- **Snapshot chỉ thêm `vocabDecks`** (red-team F11): rows deck + aggregate đếm từ (teacher list); `vocabWords` KHÔNG vào snapshot (full-org text payload mỗi fetch) — editor đọc words per-deck qua GET sub-route.

## Requirements

- [ ] `GET /api/student/vocab/overview` → `{ dueCount (chỉ state=review), nextDueAt, upcomingCount, learnedCount (level ≥ 2), matureCount (level = 5), levelDistribution (1–5, chỉ state=review), streak (today-or-yesterday), retention, forecast[7] (loại overdue), decks[] (deckId, title, className, total, newCount, dueCount) }` — đúng `vocabOverviewSchema`.
- [ ] `GET /api/student/vocab/decks/:deckId/session-data` → **enrollment check 404** → lazy provision (base `deck.createdAt`) → `{ deck, cards[], pool[] }` đúng `vocabSessionDataSchema`.
- [ ] `POST /api/student/vocab/answer` (review first-result) → ownership + dueAt guard → `applyAnswer` + update card + insert 1 log trong **1 batch**; conflict `clientLogId` → 200 replay.
- [ ] `POST /api/student/vocab/learn-commit` → `learned()` + update card + insert 1 log (grade theo `gradeGood`, durationMs server-clamp 3_600_000).
- [ ] `PUT /api/kernel/vocab/words/:wordId/audio` (teacher): kernel-gated + Origin check, MIME allowlist `audio/*`, size cap theo media-store, **key server sinh** `vocab/{orgId}/{wordId}/${crypto.randomUUID()}` → set `vocab_word.audioKey` sau khi PUT thành công.
- [ ] `GET /api/student/vocab/audio/:wordId` → requireStudent + enrollment check (lớp chứa word) → stream `mediaObjectResponse` (nosniff + sandbox); teacher preview audio qua GET kernel sub-route tương ứng.
- [ ] Teacher kernel (`routes/vocab-teacher.ts` mount kernel.ts): deck create/rename/delete, word upsert/remove, audio upload (PUT trên); **delete deck xoá `deck + words + cards` trong 1 `db.batch`** (không FK cascade); `GET /api/kernel/vocab/decks/:deckId/words` cho editor.
- [ ] Snapshot teacher thêm `vocabDecks` (required array, factory test default `[]` — Phase 6 lo fixture).
- [ ] `now` lấy server (`Date.now()` lúc xử lý) — client KHÔNG gửi `now`.

## Architecture

Đăng ký bên trong `studentRoutes()` (route file mới `vocab.ts` export `registerVocabRoutes(router, deps, requireStudent)` được gọi từ `student.ts`; **guard đăng ký TRƯỚC handler**, precedent #320 dạng `path` + `path/*`):

```
router.use("/vocab/overview", requireStudent);      router.use("/vocab/overview/*", requireStudent)
router.use("/vocab/decks/:deckId/session-data", requireStudent); (+ dạng "/*")
router.use("/vocab/answer", requireStudent);         (+ dạng "/*")  + writeGuard
router.use("/vocab/learn-commit", requireStudent);   (+ dạng "/*")  + writeGuard
router.use("/vocab/audio/:wordId", requireStudent);  (+ dạng "/*")
```

`writeGuard` = Origin check + JSON-only content-type + bodyLimit (mirror `quizWriteGuard` `student.ts:606` — hiện là closure của `studentRoutes()`, tách ra module chung hoặc replicate trong vocab.ts; đăng ký cho 2 POST path).

Flow `POST /vocab/answer`:
```
parse body (.strict) → join card WHERE id AND studentId = ctx.student.id (không thấy → 404)
if log exists(id = clientLogId) → 200 replay { card }                    // retry tuần tự
if card.state == "review" && card.dueAt > now → 200 { card }             // cross-session guard
newCard = applyAnswer(card, correct, now)                                // từ @teacher-os/api/srs/scheduler
db.batch([ update vocab_card = newCard,
           insert vocab_review_log { id: clientLogId, ... } .onConflictDoNothing() ])
  → conflict (race cùng clientLogId) → re-read log + card → 200 replay   // KHÔNG 500
→ 200 { card: newCard }
```

## Related Code Files

- Create: `apps/server/src/routes/vocab.ts`, `apps/server/src/routes/vocab-teacher.ts`, `apps/server/src/lib/vocab-provision.ts` (lazy provision + pool query), `apps/server/src/routes/vocab.test.ts`, `apps/server/src/routes/vocab-teacher.test.ts`.
- Modify: `apps/server/src/routes/student.ts` (gọi `registerVocabRoutes` + KHÔNG thêm handler trực tiếp), `apps/server/src/routes/kernel.ts` (mount `vocabTeacherRoutes` — 1 dòng, cùng chỗ mount assignments `:2099+`), `apps/server/src/routes/snapshot.ts` (thêm select `vocabDecks` + type), `KernelSnapshot` type (`packages/api/src/contracts.ts:1423`).

## Implementation Steps

1. Viết `vocab-provision.ts`: `ensureDeckCards(db, studentId, deckId)` (enrollment check + INSERT OR IGNORE base `deck.createdAt` + trick thứ tự) và `loadPool(db, studentId)`. Unit test: provision idempotent (gọi 2 lần → không thêm row), provision race an toàn (2 call đồng thời `Promise.all` → thứ tự dueAt nhất quán 1 mốc), không enroll → 404.
2. Viết `routes/vocab.ts` 5 endpoint (overview, session-data, answer, learn-commit, audio stream) theo flow; overview streak/retention/forecast theo Key Insights (pseudocode streak: nhóm log theo ngày VN → từ hôm nay lùi: nếu hôm nay trống dùng hôm qua làm anchor, đếm liên tiếp tới ngày trống đầu tiên).
3. Viết `routes/vocab-teacher.ts`: mutations Zod-validated + upload audio (PUT raw stream → media-store → set audioKey server-sinh) + GET words per-deck; delete deck = `db.batch` xoá deck + words + cards.
4. Mount + đăng ký: `registerVocabRoutes` gọi trong `studentRoutes()`; `vocabTeacherRoutes` mount kernel; snapshot thêm `vocabDecks`.
5. Tests (dựng `buildApp` + fake deps theo `student-quiz.test.ts`):
   - Ownership: student B gọi card của student A → 404.
   - Enrollment: student không enroll lớp chứa deck → session-data + audio 404 (KHÔNG provision).
   - Idempotent tuần tự + đồng thời: 2 request cùng `clientLogId` (Promise.all) → 1 log row, card áp 1 lần, **cả 2 trả 200**.
   - Cross-session: card `state=review && dueAt > now` → answer trả card hiện tại không apply.
   - Batch atomic: ép fail insert log (fake db ném lỗi) → card KHÔNG update.
   - Answer đúng toán: card L1 correct → L2, dueAt +3d; learn-commit → state=review, dueAt +1d, durationMs clamp khi gửi 4_000_000.
   - Due metrics: 3 card new chưa học → dueCount 0, newCount 3; forecast không chứa card overdue... (overdue = review card due quá khứ → forecast day-0 bucket? theo spec forecast đếm due theo ngày tới 7 ngày, overdue không vào bucket nào — test conforme).
   - Streak: log chỉ hôm qua → streak 1; hôm qua + hôm nay → 2; đứt 1 ngày → 0.
   - Delete deck → 0 orphan words/cards; review_log sống sót.
   - CSRF: POST `/vocab/answer` không Origin → 403.
   - Auth: GET session-data không session → 401 (không phải 500 — chứng minh RT#1 mount đúng).

## Todo

- [ ] Provision + pool module + test (kể cả race + enrollment 404)
- [ ] 5 student endpoints + writeGuard + test
- [ ] Teacher sub-route (CRUD + upload audio + GET words + batch delete) + test
- [ ] Snapshot `vocabDecks` + test
- [ ] `pnpm --filter server run test` pass

## Success Criteria

- Toàn bộ test list ở Implementation Steps 5 pass (12 nhóm case).
- `app.ts` KHÔNG có route vocab nào (grep `vocab` trong app.ts = 0) — mount duy nhất qua `studentRoutes()`/`kernelRoutes()`.
- Snapshot teacher chứa `vocabDecks` sau khi tạo (test vocab-teacher); payload snapshot KHÔNG chứa words.

## Risk Assessment

- **Pool phình khi student có nhiều từ**: entry gọn ~100 bytes; nếu > 5000 từ thì giới hạn pool theo deck cùng lớp + deck khác cùng lang — quyết khi đo, ghi follow-up.
- **writeGuard tách module**: `quizWriteGuard` là closure — nếu tách phá test hiện có thì replicate trong vocab.ts (Origin + content-type + bodyLimit), không refactor lớn.
- **Concurrent answer 2 tab khác clientLogId cùng card**: đã có guard dueAt ở trên — trả card hiện tại, không double-apply.

## Security Considerations

- Ownership (mọi query card/log kèm `studentId`) + **enrollment (mọi endpoint chạm deck)** — hai tầng, deck-level là Critical (red-team F1).
- Origin check cho POST (CSRF — SameSite=None); bodyLimit cho POST; audio stream `mediaObjectResponse`.
- `clientLogId` PK — spam chỉ tạo log của chính student đó; durationMs clamp server.
- Audio upload teacher: MIME allowlist + size cap + key server-sinh org-scoped (client không gửi key); GET audio yêu cầu enrollment — không public link.
