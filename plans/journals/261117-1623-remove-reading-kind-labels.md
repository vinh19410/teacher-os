# Journal: Remove redundant Vietnamese reading kind labels (#775)

- **Date:** 2026-11-17
- **Issue:** #775
- **Branch:** `fix/remove-reading-kind-labels` (target: `develop`)

## Context
Reading passage cards in the placement test (`apps/student` and `apps/profile/public/kiem-tra-dau-vao/`) displayed a Vietnamese pill label (`Biển báo / Thông báo`, `Tin nhắn / Email`, `Bài đọc hiểu`, `Đoạn văn điền từ`) above each passage. This duplicated the section overview, `Part` badges, English instructions, and passage styling.

## Changes
- Removed `PLACEMENT_READING_KIND_LABELS` from `apps/student/src/lib/placement-test-helpers.ts` and removed the pill badge + empty `<CardHeader>` from `apps/student/src/components/placement/placement-reading-step.tsx`.
- Added shared `normalizeReadingKind` helper (`trim().toLowerCase()`) in both `apps/student` and `apps/profile/public/kiem-tra-dau-vao/test.js` so `sign`/`message`/`cloze` behave consistently across header and body rendering.
- Removed `READING_KIND_LABELS` and `.question-tag` from `apps/profile/public/kiem-tra-dau-vao/test.js`, extracted `resolveReadingPassageHeaderState`, and omitted empty `.clip-badges` / `.passage-header` nodes.
- Kept teacher authoring labels in `apps/web/src/components/placement-test/reading-passage-card.tsx` untouched.

## Verification
- `pnpm --filter student test`, `pnpm --filter profile test`, `pnpm check-types`, `pnpm exec biome check .`, and focused Playwright E2E (`student-placement-test.spec.ts`, `profile-placement-test.spec.ts`) passed with 3-viewport + dark mode (`apps/student`) POT screenshots in `plans/reports/775-*.png`.
