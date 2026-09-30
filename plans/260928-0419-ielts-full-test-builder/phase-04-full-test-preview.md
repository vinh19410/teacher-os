---
phase: 4
title: "Full-Test Preview"
status: done
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: Full-Test Preview

## Goal
Preview trọn bộ đề (3 passages + questions đánh số liên tục 1–40) đúng format đề thi IELTS, handoff qua sessionStorage theo pattern preview hiện tại — dùng lại `computeTestRanges`, không logic đánh số mới.

## Key Insights
- Preview single-part hiện handoff draft qua sessionStorage (`apps/web/src/lib/assignment-preview-draft.ts` → route `apps/web/src/routes/_auth/assignments/preview.tsx`, component `student-preview-paper.tsx`) — test-preview làm theo pattern riêng, không nhồi vào draft single-part.
- Passage render dùng đúng dữ liệu prompt (`intro`, `passage`, questions từ JSON) — KHÔNG render answer trong preview học viên.
- Đánh số từng question = `computeTestRanges(...)[i].qStart + indexLocal` — mọi chỗ render số câu đều qua helper này.

## Files to Create / Modify

- Create: `apps/web/src/lib/assignment-test-preview-draft.ts` (handoff sessionStorage)
- Create: `apps/web/src/routes/_auth/assignments/tests/preview.tsx`
- Create: `apps/web/src/components/assignment-tests/test-preview-paper.tsx` + test
- Modify: `apps/web/src/components/assignment-tests/test-builder-shell.tsx` (nút "Xem trước")

## Tasks & Steps

### Task 4.1 — Handoff draft preview
- Goal: chuyển dữ liệu test (từ state đang soạn hoặc snapshot) sang route preview không qua server.
- Target files: `apps/web/src/lib/assignment-test-preview-draft.ts`.
- Steps:
  1. Export `saveTestPreviewDraft(test + prompts data)` / `loadTestPreviewDraft()` / `clearTestPreviewDraft()` sessionStorage theo pattern `assignment-preview-draft.ts`.
  2. Nếu tổng payload > ~1MB (3 passage lớn + option banks) thì fallback: chỉ truyền test id + slot map, route preview tự đọc snapshot repo (ưu tiên cách này nếu payload vượt).
- Success criteria: save→load round-trip giữ nguyên 40 câu + 3 passage.
- Verify: `pnpm -F web test -- assignment-test-preview-draft` exit 0.

### Task 4.2 — Preview paper component
- Goal: render paper đề thi hoàn chỉnh.
- Target files: `apps/web/src/components/assignment-tests/test-preview-paper.tsx` + test.
- Steps:
  1. Header: title test, time limit ("Time: 60 minutes"), collection/group nếu có.
  2. Mỗi part: heading "READING PASSAGE 1/2/3" (label từ preset slot), instruction line từ `intro`, passage text, rồi questions theo part với đánh số liên tục từ `computeTestRanges`.
  3. Question render theo type reuse-friendly: option bank (A–H / i–viii) render 1 lần đầu part; cloze `____` render như preview hiện tại; tfng/ynng/mcq/shortans hiển thị dạng điền — copy cách `student-preview-paper.tsx` đang làm, KHÔNG viết renderer mới nếu có thể extract dùng chung.
  4. KHÔNG hiển thị `answer`/`alts` bất kể đâu.
- Success criteria: preview 3 part 13/13/14 hiển thị câu 1→40 liên tục không nhảy số; case 12/14/14 cũng 1→40.
- Verify: `pnpm -F web test -- test-preview-paper` exit 0 với assertion "Questions 1-40" và 2 case phân bố.

### Task 4.3 — Nút Xem trước + route
- Goal: từ builder mở được preview và quay lại không mất state (draft store phase 3 lo phần còn lại).
- Target files: `apps/web/src/routes/_auth/assignments/tests/preview.tsx`, modify `test-builder-shell.tsx`.
- Steps:
  1. Route preview đọc draft handoff; nút "Xem trước" trên shell gọi save rồi navigate.
  2. Route preview có nút "Quay lại soạn" (history back) — không deep-link được khi thiếu draft thì hiện empty state thân thiện.
- Success criteria: luồng soạn → xem trước → quay lại giữ nguyên slot đã gán.
- Verify: `pnpm -F web test` exit 0; `pnpm check-types` exit 0.

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

## Risk Assessment
- **Render số câu trực tiếp `index + 1` mỗi part** (không qua ranges) → sai khi part 1 có 12 câu. Chỉ được lấy số từ helper `computeTestRanges`.
- **Payload sessionStorage tràn** — fallback bằng id + repo đọc snapshot (Task 4.1 bước 2).

## Security Considerations
- Preview KHÔNG render đáp án — đây là bản xem như học viên.

## Todo

- [x] Task 4.1 — Handoff draft preview (+ fallback id)
- [x] Task 4.2 — Preview paper 1–40 + 2 case phân bố
- [x] Task 4.3 — Nút Xem trước + route + quay lại an toàn
- [x] `pnpm -F web test` + `pnpm check-types` exit 0
