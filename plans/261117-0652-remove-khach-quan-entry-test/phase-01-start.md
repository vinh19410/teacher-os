---
title: "Phase 1: Bỏ chữ \"khách quan\" trong UI & test entry test"
status: todo
---

# Phase 1: Bỏ chữ "khách quan" trong UI & test entry test

## Overview

Cập nhật toàn bộ các chuỗi hiển thị và test assertions của entry test đang chứa `"khách quan"` sang dạng bỏ `"khách quan"` tự nhiên, giữ nguyên nghĩa và cấu trúc DOM/test-id.

## Requirements

- [x] `apps/profile/public/kiem-tra-dau-vao/test.js`:
  - Line 577 & 661: ``Đã trả lời ${progress.answered}/${progress.total} câu khách quan`` -> ``Đã trả lời ${progress.answered}/${progress.total} câu``
  - Line 859: ``${objectiveStats.total} câu khách quan`` -> ``${objectiveStats.total} câu``
  - Line 3076: ``còn ${unansweredConfirmState.unansweredObjective} câu khách quan chưa trả lời`` -> ``còn ${unansweredConfirmState.unansweredObjective} câu chưa trả lời``
- [x] `apps/student/src/components/placement/placement-test-runner.tsx`:
  - Line 363: `{progress.total} câu khách quan` -> `{progress.total} câu`
  - Line 457: `Đã trả lời {progress.answered}/{progress.total} câu khách quan` -> `Đã trả lời {progress.answered}/{progress.total} câu`
  - Line 813: ``còn ${confirmUnanswered.unansweredObjective} câu khách quan chưa trả lời`` -> ``còn ${confirmUnanswered.unansweredObjective} câu chưa trả lời``
- [x] `apps/student/src/components/placement/placement-result-views.tsx`:
  - Line 387: `Điểm các phần khách quan` -> `Điểm các kỹ năng` (đồng bộ với `apps/profile/public/kiem-tra-dau-vao/ket-qua/result.js:305`)
- [x] `apps/web/src/components/leads/placement-submission-panel.tsx`:
  - Line 577: `Chấm tự động 3 phần khách quan • giáo viên chấm Writing & Speaking` -> `Chấm tự động 3 phần • giáo viên chấm Writing & Speaking`
- [x] Tests & specs:
  - `apps/profile/tests/placement-test.test.mjs:324-341`: bổ sung `"khách quan"` vào danh sách `forbiddenToken`
  - `apps/web/src/components/placement-test/content-model.test.ts:153`
  - `packages/api/src/placement-test-contracts.test.ts:694`
  - `apps/e2e/specs/profile-placement-test.spec.ts` (lines 427, 435, 455, 458 comment, 475, 1259, 1316, 1331)
  - `apps/e2e/specs/placement-test-editor.spec.ts` (lines 238 comment, 251, 270)
  - `apps/e2e/specs/placement-ai-grading.spec.ts` (line 145 comment)
  - Thêm/cập nhật assertions trong `apps/student/test/placement-test.test.tsx` (bao gồm cả case confirm nộp bài khi còn câu chưa trả lời để kiểm chứng dòng 813 và assert tiêu đề `"Điểm các kỹ năng"` ở graded view) và `apps/web/src/components/leads/placement-submission-panel.test.tsx` theo TDD để bảo vệ copy mới.

## Implementation Steps

1. Cập nhật/bổ sung unit test trước (TDD) tại `apps/profile/tests/placement-test.test.mjs`, `apps/student/test/placement-test.test.tsx`, `apps/web/src/components/leads/placement-submission-panel.test.tsx`, `apps/web/src/components/placement-test/content-model.test.ts`, `packages/api/src/placement-test-contracts.test.ts`.
2. Cập nhật UI copy trong `apps/profile/public/kiem-tra-dau-vao/test.js`, `apps/student/src/components/placement/placement-test-runner.tsx`, `apps/student/src/components/placement/placement-result-views.tsx`, `apps/web/src/components/leads/placement-submission-panel.tsx`.
3. Cập nhật assertions/comments trong `apps/e2e/specs/profile-placement-test.spec.ts`, `apps/e2e/specs/placement-test-editor.spec.ts`, `apps/e2e/specs/placement-ai-grading.spec.ts`.
4. Chạy grep kiểm chứng không còn `"khách quan"` ngoài `lesson_details.csv`.
5. Chạy `pnpm exec biome check .`, `pnpm check-types`, unit tests (`web`, `student`, `profile`, `api`) và chạy E2E specs lẻ (`profile-placement-test.spec.ts`, `placement-test-editor.spec.ts`, `student-placement-test.spec.ts`) với port override `8100/8101/8103/8104/8105`.

## Todo

- [x] TDD: bổ sung/cập nhật assertions kiểm tra copy không còn `"khách quan"` (profile, student, web, api)
- [x] Sửa UI copy trên `apps/profile`, `apps/student`, `apps/web`
- [x] Cập nhật E2E specs và test descriptions
- [x] Chạy toàn bộ gates kiểm tra (biome, typecheck, unit tests, targeted E2E)

## Verification

- `grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.turbo --exclude-dir=plans -i "khách quan" apps/ packages/api/` (expect: 0 matches)
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/api test && pnpm --filter web test && pnpm --filter student test && pnpm --filter profile test`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-placement-test.spec.ts specs/placement-test-editor.spec.ts specs/student-placement-test.spec.ts`

## Success Criteria

- Tất cả các chỗ hiển thị chữ `"khách quan"` trong bộ entry test đã được gỡ bỏ sạch sẽ và câu chữ tự nhiên.
- Unit tests, typecheck, biome check và các E2E spec liên quan pass.
