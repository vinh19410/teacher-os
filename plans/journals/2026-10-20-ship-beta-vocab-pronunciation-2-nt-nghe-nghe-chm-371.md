---
title: "Ship Beta: Vocab pronunciation 2 nút Nghe / Nghe chậm (#371)"
date: 2026-10-20
---

# Ship Beta: Vocab pronunciation 2 nút Nghe / Nghe chậm (#371)

---
title: "Ship Beta: Vocab pronunciation 2 nút Nghe / Nghe chậm (#371)"
date: 2026-10-20
summary: "Thay <audio controls> mặc định bằng component VocabPronunciationButtons (Nghe 1x / Nghe chậm 0.6x giữ pitch) ở thẻ intro và câu hỏi listeningChoice của Student vocab; red-team 2 lens, 299 unit + 161 e2e pass, screenshot 3 viewport."
---

# Ship Beta: Vocab pronunciation 2 nút Nghe / Nghe chậm (#371)

## What happened

Thực thi `plans/261020-1052-vocab-audio-speed-buttons/plan.md` cho issue #371:

1. **Component mới `VocabPronunciationButtons` (`apps/student/src/components/vocab/vocab-pronunciation-buttons.tsx`)**: 1 `HTMLAudioElement` ẩn, 2 nút outline Nghe (`playbackRate = 1`) / Nghe chậm (`0.6`, `preservesPitch` + webkit guard). `playTokenRef` guard chống race AbortError giữa các lần bấm liên tiếp; listener `playing` re-assert rate từ `rateRef` chống engine reset khi load; `ended` reset `aria-pressed`; đổi `src` qua `prevSrcRef` effect; `pause()` trong cleanup unmount; touch target `min-h-11` (44px); focus ring mặc định của Button UI.
2. **Thay 2 callsite**: thẻ "Làm quen từ mới" (`vocab-session-view.tsx`, giữ testid `vocab-intro-audio`, nút disable khi persist — behavior change có chủ đích từ red-team A3) và câu hỏi "Nghe phát âm và chọn từ đúng" (`prompt-listening-choice.tsx`, testid `vocab-audio-player`, không disable sau khi chọn; nhánh loading/error giữ `Volume2Icon` + text).
3. **Kiểm chứng**: 10 unit test component mới (gồm race deferred-promise và unmount-pause); test #361 ("Bỏ qua" khi CDN lỗi) không đổi vẫn pass; 299/299 unit pass; full e2e suite 161 pass (1 flaky có sẵn unrelated); screenshot thật 3 viewport + focus-ring trên e2e stack.

## Decision

- Red-team 2 lens (Security Adversary + Assumption Destroyer) trước implement: 8 findings sau dedup, 7 accept — 2 High (race AbortError, playbackRate reset đầu lần phát) định hình thiết kế playTokenRef + listener `playing`.
- E2E giữ vai trò regression-smoke; hành vi player chứng minh bằng unit test + screenshot (finding A7 reject — non-goal thêm e2e assertion).
- Nút intro disable khi persist: chủ đích, nhất quán với nút khác trên thẻ, ghi rõ trong PR.

## Next steps

- Review PR vào `develop`; merge beta rồi theo dõi CI develop.
> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
