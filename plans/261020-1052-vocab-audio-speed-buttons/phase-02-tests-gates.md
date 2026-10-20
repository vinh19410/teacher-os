---
phase: 2
title: "Tests, gates & screenshot"
status: pending
effort: 1h
---

# Phase 2 — Tests, gates & screenshot

## Files

| File | Action |
|---|---|
| `apps/student/src/components/vocab/vocab-pronunciation-buttons.test.tsx` | create |
| `apps/student/src/components/vocab/vocab-session-view.test.tsx` | modify nếu assertion cũ đụng `<audio>` |

## Steps

1. Test component (vitest + Testing Library, jsdom):
   - Stub `HTMLMediaElement.prototype.play` (`vi.fn().mockResolvedValue(undefined)`) và `pause`.
   - Render với `src="blob:x"`: có 2 nút, không phần tử nào có thuộc tính `controls`.
   - Click "Nghe" → `play` được gọi, `audio.playbackRate === 1`, nút normal `aria-pressed="true"`.
   - Click "Nghe chậm" → `playbackRate === 0.6`, `currentTime === 0`, nút slow active, nút normal hết active.
   - Dispatch `ended` → cả 2 nút `aria-pressed="false"`.
   - `play` reject → không throw, trạng thái active reset.
   - `disabled` → 2 nút disabled.
2. `vocab-session-view.test.tsx`: thêm case thẻ intro có `hasAudio: true` render `vocab-intro-audio-normal` và `vocab-intro-audio-slow`; test #361 (nút "Bỏ qua" khi CDN lỗi) vẫn pass không sửa.
3. Gates:
   ```bash
   pnpm check
   pnpm check-types
   pnpm --filter student test
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- vocab-srs
   ```
4. Screenshot thẻ "Làm quen từ mới" ở 1440×900, 768×1024, 375×812 + kiểm tra focus ring khi Tab qua 2 nút (theo `REVIEW.md`).

## Validation

Mọi lệnh ở bước 3 pass; acceptance criteria trong `plan.md` tick đủ.
