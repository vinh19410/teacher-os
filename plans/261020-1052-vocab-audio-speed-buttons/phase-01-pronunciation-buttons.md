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
   - Props: `src: string`, `testIdPrefix: string`, `disabled?: boolean`. JSDoc ghi rõ contract: `src` là **blob object URL** do component cha tạo/revoke qua `fetchVocabAudioObjectUrl` — không truyền URL CDN/signed trực tiếp (RT-redteam F4).
   - Hằng số `PLAYBACK_RATES = { normal: 1, slow: 0.6 } as const`.
   - `useRef<HTMLAudioElement>` trỏ tới `<audio src preload="metadata">` ẩn (không `controls`, giữ `biome-ignore lint/a11y/useMediaCaption` như cũ; giữ `metadata` thay vì `auto` — file ~1s, tránh khác biệt preload không chủ đích — RT-redteam A4).
   - State `playing: "normal" | "slow" | null`; listener `ended` → `null`. **Không** listener `pause` (tự gây race với pause-then-play — RT-redteam F1/A1).
   - Chống race AbortError (RT-redteam F1/A1): `playTokenRef` tăng mỗi lần `play(speed)`; trong `.catch` chỉ `setPlaying(null)` nếu token vẫn là lần hiện hành.
   - Chống reset `playbackRate` khi media load (RT-redteam F2/A4): listener `playing` set lại `audio.playbackRate = rateRef.current`; click handler cũng set rate trước `play()`.
   - `play(speed)`: bump token, `audio.pause()`, `audio.currentTime = 0`, `audio.playbackRate = rate` (+ `rateRef.current = rate`), `audio.preservesPitch = true`, guard `"webkitPreservesPitch" in audio` với cast tường minh `{ webkitPreservesPitch: boolean }` (RT-redteam A8), `setPlaying(speed)`, `audio.play().catch(token-guarded reset)`.
   - Đổi `src` → bump token + pause + reset state (effect theo `src`).
   - Focus ring: giữ mặc định `focus-visible` của `Button` (`@teacher-os/ui`), **không** thêm `--focus-ring` riêng (RT-redteam A5).
   - Render wrapper `div` `data-testid={testIdPrefix}` `role="group"` `aria-label="Phát âm"`, 2 `Button variant="outline"`:
     - `data-testid={`${testIdPrefix}-normal`}`, icon `Volume2Icon`, chữ "Nghe", `aria-label="Nghe phát âm tốc độ bình thường"`.
     - `data-testid={`${testIdPrefix}-slow`}`, icon `SnailIcon`, chữ "Nghe chậm", `aria-label="Nghe phát âm tốc độ chậm"`.
     - `aria-pressed={playing === speed}`; khi active đổi viền/chữ sang `text-hot`/`border-hot`; min-height 44px (`min-h-11`).
2. `vocab-session-view.tsx`: thay khối `<div className="flex items-center justify-center gap-2 pt-2">…<audio …/></div>` bằng `<div className="flex justify-center pt-2"><VocabPronunciationButtons src={audioUrl} testIdPrefix="vocab-intro-audio" disabled={disabled} /></div>`; bỏ `Volume2Icon` trang trí nếu không còn dùng (giữ import nếu nơi khác cần). Lưu ý behavior change có chủ đích (RT-redteam A3): `<audio controls>` cũ không bao giờ disable, còn nút mới disable khi `persistStatus !== "idle"` — nhất quán với các nút khác của thẻ intro trong lúc persist; ghi rõ trong mô tả PR.
3. `prompt-listening-choice.tsx`: restructure tường minh (RT-redteam A6) — `Volume2Icon` hiện nằm NGOÀI ternary, hiển thị cho cả 3 nhánh. Cấu trúc mới:
   - Nhánh `audioUrl` → `<VocabPronunciationButtons src={audioUrl} testIdPrefix="vocab-audio-player" />` (không truyền `disabled` — sau khi chọn đáp án vẫn được nghe lại), không có icon trang trí (2 nút tự có icon).
   - Nhánh `audioError` / loading → giữ nguyên khối `flex items-center gap-3` với `Volume2Icon` + text lỗi/"Đang tải âm thanh…" (không mất chỉ báo trực quan; test #361 chỉ assert nút "Bỏ qua" nên phải tự audit mắt).

## Validation

- `pnpm check` (biome) sạch.
- `pnpm check-types` sạch.
- Chạy dev student app, mở 1 session có audio, bấm 2 nút nghe khác tốc độ.

## Risk / rollback

Thay đổi thuần UI trong 3 file; rollback = revert commit.
