---
phase: 3
title: "Phase 3: Verify & Quality Gates"
status: completed
priority: P1
effort: "30m"
dependencies: [2]
---

# Phase 3: Verify & Quality Gates

## Goal
Kiểm tra toàn diện để đảm bảo không có regression trong luồng chấm bài và đáp ứng toàn bộ các quality gate của dự án (biome, typecheck, tests), bao gồm bổ sung integration test cho luồng in-flight pending.

## Files to Create / Modify
- Modify: `apps/web/src/routes/_auth/grading/index.test.tsx`
- Read/Verify: `apps/web/src/routes/_auth/grading/$attemptId.tsx`

## Tasks & Steps

### Task 3.1 — Thêm integration test cho in-flight pending và chạy test route grading
- **Goal:** Xác nhận ở cấp route (`GradingRoute`), khi một mutation lưu điểm hoặc lưu nháp đang ở trạng thái pending, các input bị disabled và sau khi resolve, form remount với dữ liệu mới từ server.
- **Target files and symbols:** `apps/web/src/routes/_auth/grading/index.test.tsx`.
- **Steps:**
  1. Thêm test case mô phỏng mutation `saveDraft` hoặc `saveGrade` trả về một `Promise` treo (pending).
  2. Bấm "Lưu bản nháp" hoặc "Lưu điểm".
  3. Assert `#grade-feedback` và các slider bị disabled trong lúc request đang pending.
  4. Resolve promise của mutation và verify `data-testid="grade-saved"` hiển thị.
  5. Chạy vitest cho file `src/routes/_auth/grading/index.test.tsx`.
- **Success criteria:** Tất cả các test trong file pass, bao gồm test integration mới.
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/grading/index.test.tsx` exits 0.

### Task 3.2 — Chạy Biome linter/formatter check
- **Goal:** Đảm bảo code tuân thủ convention và format sạch sẽ.
- **Target files and symbols:** Toàn bộ repository (`apps/web/src/components/grading/*`, `apps/web/src/routes/_auth/grading/*`).
- **Steps:**
  1. Chạy Biome check.
- **Success criteria:** Không có lỗi lint hoặc formatting.
- **Verify:** `pnpm exec biome check apps/web/src/components/grading apps/web/src/routes/_auth/grading` exits 0.

### Task 3.3 — Chạy Typecheck toàn bộ repo
- **Goal:** Đảm bảo TypeScript compilation không phát sinh lỗi kiểu.
- **Target files and symbols:** Toàn bộ dự án.
- **Steps:**
  1. Chạy `pnpm check-types`.
- **Success criteria:** Type check exits 0 không có lỗi.
- **Verify:** `pnpm check-types` exits 0.

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