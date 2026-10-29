---
phase: 2
title: "UI Speaking trên màn [7]"
status: pending
effort: 0.5d
---

# Phase 2 — UI Speaking trên màn [7]

## Files

- Sửa `apps/web/src/components/grading/submission-media-player.tsx`: nhóm nút tốc độ 1x / 1.25x / 1.5x (`aria-pressed`, phím Tab tới được).
- Sửa `apps/web/src/components/grading/ai-draft-panel.tsx` (từ TOS-30): Speaking hiện nhãn `SPEAKING_AI_LIMIT_LABEL` cố định đầu panel + khối "Văn bản gỡ băng"; `errorCode = E-009` → banner cảnh báo (thông điệp spec) thay cho điểm gợi ý.
- `apps/server/src/routes/grading.ts`: `GET /:attemptId` trả `transcript` trong `aiDraft` (chỉ API giáo viên).

## Tests

- Test component: nhãn luôn hiện với Speaking, không hiện với Writing; đổi tốc độ set `playbackRate`; banner E-009.

## Verify

- `pnpm --filter web test -- grading`; screenshot 3 viewport + `pnpm design:compare`.
