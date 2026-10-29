---
title: "Phase 4: Session Engines + Quiz Generator"
status: todo
---

# Phase 4: Session Engines + Quiz Generator

## Context Links

- Spec: `docs/srs-spec.md` §3 (Review session — 8 rule), §3b (Learn session — 10 rule), §4 (Minigames), §5 (derived values dùng trong session).
- Đối chiếu port: `ios/Flinto/Data/ReviewSession.swift:1-343`, `LearnSession.swift:1-372`, `QuizGenerator.swift:1-183`; Android mirror `ReviewQueue.kt:1-219`, `LearnQueue.kt:1-327`, `QuizGenerator.kt:1-184` (repo Flinto).
- Vectors sections liên quan: `learnSteps`, `learnQueue`, `learnCommit` (đã có fixture từ Phase 1).

## Overview

Port 3 cỗ máy runtime của Flinto sang TS thuần (tiếp tục trong `packages/api/src/srs/`): `ReviewSession` (queue ôn tập), `LearnSession` (học từ mới theo bước), `QuizGenerator` (chọn minigame + sinh options). Tất cả pure class/function với RNG injectable — không depend React/fetch; Phase 5 chỉ wrap UI quanh đây.

## Key Insights

- **State machine 2 vòng khác nhau rõ rệt**: Review có requeue 4–5 + evict 2-forgot + wrong-streak overlay; Learn **KHÔNG** có 3 thứ đó (spec §3b rule 10) mà sai → nối **cuối queue**, commit per word khi bước cuối rời queue. Đừng dùng chung một queue engine — port 2 class riêng như Flinto.
- **Prompt sinh khi card lên đầu** theo level **hiện tại** của card (level có thể đã đổi sau first result sớm hơn trong phiên) — generator nhận card state tươi, không cache prompt per card.
- **Input Review build đã lọc `state="review" && dueAt <= now`** (red-team F5): engine nhận cards từ caller (server/client đã filter theo pool rule spec §5); engine không tự query. Learn build nhận card `state="new"` của deck.
- **Pool distractor chỉ text**: `{ wordId, word, translation, lang, deckId }` (field list `vocabSessionDataSchema` Phase 2 — KHÔNG hasAudio; audio eligibility của `listeningChoice` đọc từ card đang hỏi).
- **Engine expose `removeCard(cardId)`** (red-team F14): khi UI nhận 404 giữa phiên (deck bị teacher xoá), UI gọi `removeCard` để gỡ các bước còn lại của card — port rule §3b.9 theo mô hình remote (Flinto là local-store callback, teacher-os là UI-driven).
- **Chọn kind strict priority không loop**: (a) E trừ {kind cuối của card này, kind của turn trước} → (b) E trừ {kind cuối của card này} → (c) E → non-empty đầu, random trong đó; tất cả rỗng → `selfCheck`.
- **Distractor partial Fisher–Yates** (không full shuffle): `i=0; while collected<k && i<n { j = i + rand(n-i); swap(i,j); if key chưa thấy thì collect }` — same-deck trước, other-deck sau; loại card chính nó, text trắng, normalized key trùng đáp án. Không đủ k=3 → dùng tất cả tìm được (min 2 options nhờ eligibility).
- **Eligibility**: `meaningChoice`/`wordChoice` cần `level <= 4` + translation không trắng + ≥ 1 distractor (wordChoice: cùng `lang`); `listeningChoice` cần audio + ≥ 1 word distractor; `typing` cần `typingEligible(word)` + translation không trắng; `selfCheck` chỉ là fallback.
- Summary recall % = `round-half-away-from-zero` (KHÔNG phải Math.round của JS — JS round-half-up; viết helper riêng cho đúng vector).

## Requirements

- [ ] `ReviewSession`: build (due → sort dueAt asc → cap → shuffle Fisher–Yates), prompt đầu queue, first-result-only (response sau của cùng card không ghi gì), feedback → Continue (double-tap an toàn), wrong streak overlay chặn input tới dismiss, requeue `min(4 + rand(2), rest.count)`, evict 2 forgot, end khi queue rỗng, summary (reviewed/firstTryCorrect/recall%/levelUps/levelDowns).
- [ ] `LearnSession`: chọn card new uncapped sort dueAt asc, learnSteps (intro + listen + produce deterministic), queue theo bước, sai nối cuối queue giữ kind (options sinh lại khi lên đầu), intro cần lật ≥ 1 lần mới Continue, commit `learned()` khi bước cuối của từ rời queue + durationMs = tổng first-attempt + intro, gỡ bước khi card bị delete giữa phiên.
- [ ] `QuizGenerator`: eligibility 4 kind + selfCheck fallback, strict priority choice, distractor k=3 partial FY cùng deck trước khác deck sau, options = đáp án + distractors shuffle, đáp án meaningChoice = translation / các kind khác = word.
- [ ] `RandomSource` interface (`nextInt(bound)`) + impl `cryptoRandom` (browser + workers) + `SeededRandom` (test).
- [ ] Test chống vectors `learnSteps` + `learnQueue` + model tests Review (theo kịch bản `ReviewQueueTest.kt`: correct rời queue / wrong requeue 4–5 / forgot×2 evict / streak overlay / first-result-only).

## Architecture

```
packages/api/src/srs/
├── rng.ts               # RandomSource + cryptoRandom + SeededRandom
├── quiz-generator.ts    # eligibleKinds(card, pool) + chooseKind(state) + buildPrompt(card, kind, pool, rng)
├── review-session.ts    # class ReviewSession { build(cards, cap, rng); respond(); continue_(); summary() }
├── learn-session.ts     # class LearnSession { build(cards, pool, rng); respond(); continue_(); reveal(); commit hooks }
└── *-session.test.ts, quiz-generator.test.ts
```

Callback giao tiếp UI/persistence: session không fetch — nhận hàm `onFirstResult(card, correct, durationMs)` / `onCommit(card, gradeGood, durationMs)` injected (Phase 5 nối vào repos POST; Phase 3 endpoint). Session không biết HTTP.

## Related Code Files

- Create: 4 file src + 3 file test (cây trên).
- Modify: không (chỉ thêm).

## Implementation Steps

1. Viết `rng.ts`: interface + `cryptoRandom` (`crypto.getRandomValues`, rejection sampling cho uniform) + `SeededRandom` (mulberry32 hoặc LCG — chỉ dùng test).
2. Port `quiz-generator.ts` từ `QuizGenerator.swift`/`.kt` + spec §4. `pool` type: `{ wordId, word, translation, lang, deckId }[]`. Prompt: `{ kind, question (word/translation/ipa), options[], answer, hint? }` — eligibility `listeningChoice` đọc `audioKey != null` từ card đang hỏi.
3. Port `review-session.ts` theo 8 rule spec §3. Estado: queue, current prompt, feedback, wrongStreak, forgotCount map, firstResult map, done/total, summary. `respond(result)` chỉ áp first-result; `continue_()` chỉ hiệu lực khi feedback != null. Input build = cards đã lọc `state="review" && dueAt <= now` (caller lo), sort `dueAt` asc → cap param (teacher-os v1 truyền uncapped/Infinity cho per-deck session — xem plan.md KD1) → shuffle Fisher–Yates. Expose `removeCard(cardId)` (gỡ card + mọi tham chiếu prompt).
4. Port `learn-session.ts` theo 10 rule §3b. Lưu ý intro: `reveal()` toggle + latch `introRevealedOnce`; Continue disabled tới khi lật; durationMs cộng `max(0, now − stepShownAt)` chỉ ở first response (feedback/retry không cộng). Expose `removeCard(cardId)` — gỡ mọi bước còn lại của card, KHÔNG emit commit cho card đó (không persist gì — §3b.9).
5. Viết vectors tests (`learnSteps`, `learnQueue` — vectors mô phỏng action sequence `["continue","correct",...]` assert total/shown/done/commits) + model tests Review với `SeededRandom` (requeue index ∈ {4,5}, clamp cuối queue).
6. Chạy `pnpm --filter @teacher-os/api run test`.

## Todo

- [ ] rng + seeded test
- [ ] quiz-generator + test
- [ ] review-session + model test
- [ ] learn-session + vectors test
- [ ] round-half-away-from-zero helper + test

## Success Criteria

- Vectors `learnSteps` + `learnQueue` pass (đây là hợp đồng conformance của vòng Learn).
- Model test Review chứng minh: requeue index 4 hoặc 5 (không khác), forgot 2 lần evict, streak 5 → overlay + reset, response thứ 2 của card không phát sinh onFirstResult.
- Không import react/hono/fetch trong 4 file src (grep).

## Risk Assessment

- **Vectors `learnQueue` mô phỏng engine riêng của Flinto** (self-contained sim trong generator .mjs): nếu port TS lệch chi tiết hành vi (vd. reset `isRevealed`), vector bắt được — đó chính là mục đích; nếu vector fail oan do khác biệt đại diện dữ liệu (vd. key `"w1:intro"`), kiểm tra mapping id trước khi đổi engine.
- **Overlay wrong-streak + selfCheck timer 240ms**: port logic dismiss; timer duration thuộc UI (Phase 5) — session chỉ track trạng thái chặn.

## Security Considerations

- Không có (pure domain). RNG prod dùng `crypto.getRandomValues` (không `Math.random` — tránh predictable distractor, tuy không nhạy cảm an ninh).
