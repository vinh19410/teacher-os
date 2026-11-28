---
phase: 2
title: "Phase 2: Design Tokens, URL Search & Pure Helpers"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Design Tokens, URL Search & Pure Helpers

## Goal
Thêm 5 token cấp trí nhớ `--vocab-lv-1..5` (Light + inverted Dark) vào `packages/ui/src/styles/globals.css`, và xây dựng + kiểm thử TDD toàn bộ logic thuần (`parseVocabOverviewSearch`, `resolveVocabHeroState` đủ 5 trạng thái, lọc/sort deck, format nhãn nguồn, tính tiến độ an toàn `total === 0`, và dựng nhãn 7 ngày chuỗi học theo giờ Việt Nam).

## Files to Create / Modify
- Modify: `packages/ui/src/styles/globals.css`
- Create: `apps/student/src/components/vocab/vocab-overview-helpers.ts`
- Create: `apps/student/src/components/vocab/vocab-overview-helpers.test.ts`

## Tasks & Steps

### Task 2.1 — Thêm 5 token `--vocab-lv-1..5` vào hệ thống token design v2
- **Goal:** Khai báo token mực xám → đậm cho 5 cấp trí nhớ ở `:root` (Light) và đảo chiều phù hợp ở `.dark` (Dark) đảm bảo phân tách rõ khỏi `--muted` (`0.97` / `0.269`) và `--card` (`1.0` / `0.205`), expose vào `@theme inline` để dùng trực tiếp class Tailwind `bg-vocab-lv-1..5` mà không hard-code hex.
- **Target files and symbols:**
  - `packages/ui/src/styles/globals.css` (`:root`, `.dark`, `@theme inline`)
- **Steps:**
  1. Trong `:root` (`globals.css`), thêm dải lightness phân tách rõ khỏi nền `--card`/`--muted`:
     - `--vocab-lv-1: oklch(0.76 0 0);`
     - `--vocab-lv-2: oklch(0.62 0 0);`
     - `--vocab-lv-3: oklch(0.48 0 0);`
     - `--vocab-lv-4: oklch(0.32 0 0);`
     - `--vocab-lv-5: oklch(0.145 0 0);`
  2. Trong `.dark` (`globals.css`), thêm thang đảo chiều trên nền card `oklch(0.205 0 0)` và track `oklch(0.269 0 0)` để cả L1 lẫn L5 đều tách biệt rõ ràng:
     - `--vocab-lv-1: oklch(0.42 0 0);`
     - `--vocab-lv-2: oklch(0.56 0 0);`
     - `--vocab-lv-3: oklch(0.7 0 0);`
     - `--vocab-lv-4: oklch(0.84 0 0);`
     - `--vocab-lv-5: oklch(0.985 0 0);`
  3. Trong `@theme inline` (`globals.css`), thêm `--color-vocab-lv-1: var(--vocab-lv-1);` đến `--color-vocab-lv-5: var(--vocab-lv-5);`. (Swatch và track từ mới dùng thêm `ring-1 ring-inset ring-input` để bảo đảm ranh giới non-text ≥ 3:1 trên cả Light & Dark.)
- **Success criteria:** Token `--vocab-lv-1..5` và utility `bg-vocab-lv-1..5` có mặt cho cả Light và Dark, tách biệt rõ với `--muted`/`--card`, không có bất kỳ giá trị hex nào được thêm vào.
- **Verify:** `pnpm exec biome check packages/ui/src/styles/globals.css` exits 0.

### Task 2.2 — Viết test TDD cho `vocab-overview-helpers.ts` (Red)
- **Goal:** Viết bộ unit test bao phủ đủ 5 hero states, chọn `topDueDeck`/`topNewDeck`, guard `total === 0`, lọc/sort bộ từ không dấu, chuẩn hóa URL search, format nhãn nguồn và nhãn 7 ngày theo `vietnamTodayISO`.
- **Target files and symbols:**
  - `apps/student/src/components/vocab/vocab-overview-helpers.test.ts`
- **Steps:**
  1. Tạo `vocab-overview-helpers.test.ts` test:
     - `parseVocabOverviewSearch` & `buildVocabOverviewSearch`: bỏ `f="all"` / `f="invalid"`, nhận `lv=3` (number từ TanStack Router `JSON.parse`) và `lv="3"` (string), bỏ `lv=0`/`6`/`1.5`, giữ `q` dạng số (`?q=18` → `"18"`), loại bỏ Bidi/control `[\p{Cc}\p{Cf}]`, cắt 200 ký tự, bỏ chuỗi rỗng.
     - `resolveVocabHeroState`: kiểm đủ 5 trạng thái (`no-decks` với `librarySummary` null vs non-null không chứa `"bên dưới"` khi null; `due` chỉ khi `dueCount > 0 && topDueDeck != null`, chọn `topDueDeck = sorted.find(d => d.dueCount > 0)` và `topNewDeck = sorted.find(d => d.newCount > 0)` ngay cả khi `sorted[0]` có `newCount === 0`; `new-only` khi `dueCount === 0 && totalNewCount > 0 && nextDueAt === null`; `caught-up` khi `dueCount === 0 && nextDueAt !== null`; `empty-decks` làm fallback bao phủ mọi trường hợp `decks.length > 0` còn lại kể cả deck `total === 0` hoặc `dueCount > 0` nhưng không có deck khớp).
     - `getVocabDeckLearnedCount`, `getVocabDeckProgressPercent`, `isVocabDeckDone`, `getVocabDeckStatus`: verify `total === 0` trả `pct = 0`, `isDone = false`, status `"learning"` (không trả `NaN` hay `"done"`); verify deck có `dueCount > 0` không bị gắn `"done"`.
     - `filterVocabDecks` & `sortVocabDecks`: sort ưu tiên `dueCount DESC, newCount DESC`, lọc theo status, lọc theo cấp trí nhớ (`level 1..5`), và tìm kiếm tiếng Việt không dấu (`"khoa hoc"`, `"tu vung"`, `"đ"`/`"d"`).
     - `formatVocabDeckSourceLabel`: `suggested` → `"Gợi ý"`, `library` → `"Khóa ..."`, `class` → `"Lớp ..."`.
     - `buildStreakWeekDays`: truyền `"2026-11-27"` (Thứ Sáu) và mảng 7 boolean → trả đúng nhãn `["T7", "CN", "T2", "T3", "T4", "T5", "Nay"]` và SR labels `["Thứ Bảy", "Chủ Nhật", ..., "Hôm nay"]` bất kể timezone OS.
  2. Chạy Vitest để xác nhận fail (module chưa tồn tại).
- **Success criteria:** Test file biên dịch rõ ràng và fail đúng lý do thiếu `vocab-overview-helpers.ts`.
- **Verify:** `pnpm --filter student test -- vocab-overview-helpers.test.ts` exits non-zero because `./vocab-overview-helpers` does not exist yet.

### Task 2.3 — Triển khai `vocab-overview-helpers.ts` (Green)
- **Goal:** Cài đặt toàn bộ helper thuần trong `apps/student/src/components/vocab/vocab-overview-helpers.ts` theo đúng spec để mọi test ở Task 2.2 xanh.
- **Target files and symbols:**
  - `apps/student/src/components/vocab/vocab-overview-helpers.ts`
- **Steps:**
  1. Tái dùng `addDaysISO` từ `@teacher-os/api/vietnam-date` và `normalizeVietnameseSearch` từ `@/components/class/class-detail-helpers`.
  2. Định nghĩa `VOCAB_MEMORY_LEVELS`, `VOCAB_DECK_FILTERS`, `VocabDeckFilter`, `VocabMemoryLevel`, `VocabOverviewSearchState`, `VocabHeroState`.
  3. Cài đặt `parseVocabOverviewSearch`, `buildVocabOverviewSearch`, `getVocabDeckLearnedCount`, `getVocabDeckProgressPercent`, `isVocabDeckDone`, `getVocabDeckStatus`, `sortVocabDecks`, `filterVocabDecks`, `formatVocabDeckSourceLabel`, `resolveVocabHeroState`, `buildStreakWeekDays`.
  4. Chạy lại unit test và typecheck.
- **Success criteria:** Toàn bộ assertions trong `vocab-overview-helpers.test.ts` pass 100%, không dùng `new Date().getDay()`, không chia cho 0.
- **Verify:** `pnpm --filter student test -- vocab-overview-helpers.test.ts && pnpm --filter student check-types` exits 0.

## Verification
- `pnpm exec biome check packages/ui/src/styles/globals.css apps/student/src/components/vocab/vocab-overview-helpers.ts apps/student/src/components/vocab/vocab-overview-helpers.test.ts && pnpm --filter student test -- vocab-overview-helpers.test.ts && pnpm --filter student check-types`

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
