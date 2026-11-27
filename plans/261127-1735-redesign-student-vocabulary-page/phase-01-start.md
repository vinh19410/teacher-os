---
phase: 1
title: "Phase 1: Contract & Server Overview Extension"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Contract & Server Overview Extension

## Goal
Mở rộng `GET /api/student/vocab/overview` và `vocabOverviewSchema` thêm `streakDays` (7 boolean ngày Việt Nam) và `decks[].levelDistribution` (5-tuple cấp trí nhớ theo từng bộ từ) với 0 migration DB, 0 SQL query phát sinh, có test raw JSON và cập nhật toàn bộ mock `VocabOverview` trong repo.

## Files to Create / Modify
- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/vocab.ts`
- Modify: `packages/api/src/vocab-contracts.test.ts`
- Modify: `apps/server/src/routes/vocab.test.ts`
- Modify: `apps/student/src/components/vocab/vocab-course-catalog.test.tsx`

## Tasks & Steps

### Task 1.1 — Mở rộng `vocabOverviewDeckSchema` và `vocabOverviewSchema` với factory `.catch()`
- **Goal:** Bổ sung `levelDistribution` vào `vocabOverviewDeckSchema` và `streakDays` vào `vocabOverviewSchema`, giữ `.strict()` và dùng factory `() => [...]` trong `.catch(...)` để không share mảng mutable.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts` (`vocabOverviewDeckSchema` dòng 4423–4434, `vocabOverviewSchema` dòng 4436–4465)
  - `packages/api/src/vocab-contracts.test.ts` (`describe("vocab contracts...")` dòng 71–97 và 400–505)
- **Steps:**
  1. Trong `packages/api/src/vocab-contracts.test.ts`, viết test trước (TDD red): kiểm tra payload cũ thiếu `streakDays` và `decks[].levelDistribution` parse ra `[false x 7]` và `[0 x 5]` với 2 object ref khác nhau qua 2 lần `parse()`, kiểm tra payload mới đầy đủ 2 trường pass, và kiểm tra unknown key vẫn fail `.strict()`. Ghi chú thêm trade-off cửa sổ deploy `.strict()` cùng chỗ với comment RT-F4.
  2. Chạy test để quan sát fail (red).
  3. Trong `packages/api/src/contracts.ts`:
     - Thêm vào `vocabOverviewDeckSchema`:
       `levelDistribution: z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(0), z.number().int().min(0), z.number().int().min(0)]).catch(() => [0, 0, 0, 0, 0] as [number, number, number, number, number])`
     - Thêm vào `vocabOverviewSchema`:
       `streakDays: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()]).catch(() => [false, false, false, false, false, false, false] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean])`
- **Success criteria:** `vocabOverviewSchema` giữ `.strict()`, backward-compatible khi thiếu 2 trường mới, và không share reference mặc định giữa các lần parse.
- **Verify:** `pnpm --filter @teacher-os/api test` exits 0 và toàn bộ test trong `vocab-contracts.test.ts` pass.

### Task 1.2 — Trả `streakDays` và `decks[].levelDistribution` từ `GET /api/student/vocab/overview`
- **Goal:** Tính `streakDays` từ `logDays` + `todayISO` và `decks[].levelDistribution` từ `cards` đã tải sẵn trong bộ nhớ ở `GET /vocab/overview` (0 SQL mới).
- **Target files and symbols:**
  - `apps/server/src/routes/vocab.ts` (`router.get("/vocab/overview", ...)` dòng 573–753)
  - `apps/server/src/routes/vocab.test.ts` (assertions trên `decks` tại dòng 322–343, 1046–1062, 1485–1500; streak/forecast dòng 540–624; positive states dòng 658–697)
- **Steps:**
  1. Trong `apps/server/src/routes/vocab.test.ts`:
     - Cập nhật 3 assertion `.toEqual(...)` trên `decks` ở dòng 332–342 (`levelDistribution: [0, 0, 0, 0, 0]`), 1053–1061 (`levelDistribution: [0, 0, 0, 0, 0]`), và 1490–1500 (`levelDistribution: [0, 1, 0, 0, 0]` vì card vừa được trả lời đúng lên level 2).
     - Thêm assertions trên **raw JSON** (`const raw = (await res.json()) as Record<string, unknown>`) trước khi gọi `vocabOverviewSchema.parse(raw)` tại dòng 540–624 và 658–697: kiểm tra `raw.streakDays` khớp `[today-6 .. today]` trong các case yesterday-only, yesterday+today, 2-days-ago-only, và kiểm tra `raw.decks[i].levelDistribution` khớp tổng card `state === "review"` của deck (kể cả card future-due) và cộng lại bằng `raw.levelDistribution`.
  2. Chạy `pnpm --filter server test -- vocab.test.ts` để xác nhận fail (red).
  3. Trong `apps/server/src/routes/vocab.ts`:
     - Sau khi build `logDays` (dòng 678–685), tạo `streakDays` cho các offset `-6, -5, -4, -3, -2, -1, 0` qua `logDays.has(addDaysISO(todayISO, offset))`.
     - Trong vòng `accessibleDecks.map` (dòng 704–725), khởi tạo `deckLevelDistribution: [number, number, number, number, number] = [0, 0, 0, 0, 0]`; tách nhánh `else if (card.dueAt <= now)` ở dòng 712 thành `else { if (card.dueAt <= now) { deckDueCount += 1; } if (card.level >= 1 && card.level <= 5) { deckLevelDistribution[card.level - 1] = (deckLevelDistribution[card.level - 1] ?? 0) + 1; } }` để đếm đủ cả card `state === "review"` chưa đến hạn.
     - Trả `levelDistribution: deckLevelDistribution` trong từng item của `decks` và `streakDays` trong `response: VocabOverview`.
- **Success criteria:** Raw JSON từ `/api/student/vocab/overview` trả đúng `streakDays` (7 boolean) và `decks[].levelDistribution` (5 int khớp `reviewPool` của từng deck), không thêm query SQL.
- **Verify:** `pnpm --filter server test -- vocab.test.ts` exits 0 và assert raw JSON pass 100%.

### Task 1.3 — Cập nhật toàn bộ mock `VocabOverview` trong workspace để pass typecheck
- **Goal:** Đảm bảo mọi mock `VocabOverview` / `VocabOverviewDeck` khai báo tường minh kiểu TypeScript đều có `streakDays` và `levelDistribution`.
- **Target files and symbols:**
  - `apps/student/src/components/vocab/vocab-course-catalog.test.tsx` (`emptyOverview` dòng 303–315, `overviewWithOneDeck` dòng 425–447)
  - Kiểm tra thêm bằng grep toàn repo cho `VocabOverview` nếu còn chỗ khác.
- **Steps:**
  1. Grep `VocabOverview` trên `apps/` và `packages/` để xác nhận đủ danh sách file bị ảnh hưởng bởi 2 field mới.
  2. Cập nhật `emptyOverview` thêm `streakDays: [false, false, false, false, false, false, false]` và `overviewWithOneDeck` thêm `streakDays: [false, false, true, true, true, true, true]` cùng `levelDistribution: [3, 4, 2, 0, 1]` trong `decks[0]`.
  3. Chạy `pnpm check-types` trên toàn workspace.
- **Success criteria:** Không còn lỗi typecheck ở bất kỳ package/app nào trong monorepo.
- **Verify:** `pnpm check-types` exits 0.

## Verification
- `pnpm --filter @teacher-os/api test && pnpm --filter server test -- vocab.test.ts && pnpm check-types`

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
