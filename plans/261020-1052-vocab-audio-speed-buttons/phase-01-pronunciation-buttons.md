---
phase: 1
title: "Component VocabPronunciationButtons + thay 2 vị trí"
status: pending
effort: 2h
---

# Phase 1 — Component VocabPronunciationButtons + thay 2 vị trí

## Context

- `apps/student/src/components/vocab/vocab-session-view.tsx` (~dòng 635–646): `<audio data-testid="vocab-intro-audio" controls>` trong thẻ "Làm quen từ mới", kèm `Volume2Icon` trang trí bên trái.
- `apps/student/src/components/vocab/prompt-listening-choice.tsx` (~dòng 60–83): `<audio data-testid="vocab-audio-player" controls>` + nhánh loading/error.
- UI token: `DESIGN.md`, `packages/ui/src/styles/globals.css`; `Button` từ `@teacher-os/ui/components/button`; icon `lucide-react` (`Volume2Icon`, `SnailIcon`).

## Files

| File | Action |
|---|---|
| `apps/student/src/components/vocab/vocab-pronunciation-buttons.tsx` | create |
| `apps/student/src/components/vocab/vocab-session-view.tsx` | modify (thay khối audio intro) |
| `apps/student/src/components/vocab/prompt-listening-choice.tsx` | modify (thay `<audio>` ở nhánh có `audioUrl`) |

## Steps

1. Tạo `vocab-pronunciation-buttons.tsx`:
   - Props: `src: string`, `testIdPrefix: string`, `disabled?: boolean`.
   - Hằng số `PLAYBACK_RATES = { normal: 1, slow: 0.6 } as const`.
   - `useRef<HTMLAudioElement>` trỏ tới `<audio src preload="auto">` ẩn (không `controls`, giữ `biome-ignore lint/a11y/useMediaCaption` như cũ).
   - State `playing: "normal" | "slow" | null`; listener `ended`/`pause` → `null`.
   - `play(speed)`: `audio.pause()`, `audio.currentTime = 0`, `audio.playbackRate = rate`, `audio.preservesPitch = true` (+ `webkitPreservesPitch` nếu có), `setPlaying(speed)`, `audio.play().catch(() => setPlaying(null))`.
   - Đổi `src` → pause + reset state (effect theo `src`).
   - Render wrapper `div` `data-testid={testIdPrefix}` `role="group"` `aria-label="Phát âm"`, 2 `Button variant="outline"`:
     - `data-testid={`${testIdPrefix}-normal`}`, icon `Volume2Icon`, chữ "Nghe", `aria-label="Nghe phát âm tốc độ bình thường"`.
     - `data-testid={`${testIdPrefix}-slow`}`, icon `SnailIcon`, chữ "Nghe chậm", `aria-label="Nghe phát âm tốc độ chậm"`.
     - `aria-pressed={playing === speed}`; khi active đổi viền/chữ sang `text-hot`/`border-hot`; min-height 44px.
2. `vocab-session-view.tsx`: thay khối `<div className="flex items-center justify-center gap-2 pt-2">…<audio …/></div>` bằng `<div className="flex justify-center pt-2"><VocabPronunciationButtons src={audioUrl} testIdPrefix="vocab-intro-audio" disabled={disabled} /></div>`; bỏ `Volume2Icon` trang trí nếu không còn dùng (giữ import nếu nơi khác cần).
3. `prompt-listening-choice.tsx`: trong `flex items-center gap-3`, bỏ `Volume2Icon` trang trí trước player khi đã có audio; nhánh `audioUrl` render `<VocabPronunciationButtons src={audioUrl} testIdPrefix="vocab-audio-player" />` (không truyền `disabled` — sau khi chọn đáp án vẫn được nghe lại). Nhánh loading/error giữ nguyên.

## Validation

- `pnpm check` (biome) sạch.
- `pnpm check-types` sạch.
- Chạy dev student app, mở 1 session có audio, bấm 2 nút nghe khác tốc độ.

## Risk / rollback

Thay đổi thuần UI trong 3 file; rollback = revert commit.
