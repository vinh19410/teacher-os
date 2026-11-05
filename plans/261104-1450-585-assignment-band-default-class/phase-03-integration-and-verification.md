# Phase 3: Integration, Regression Verification và Quality Gates

## Goal
Bổ sung đầy đủ các kịch bản kiểm thử tích hợp (integration tests) cho flow tạo bài tập theo lớp, chạy toàn bộ bộ test hồi quy của ứng dụng web, server, admin và xác thực các gates chất lượng repo.

## Target files and symbols
- `apps/web/src/routes/_auth/assignments/new.test.tsx`:
  - Test case: Mở `/assignments/new?classId=cls-55` (lớp Band 5.5) -> chip 5.5 được active
  - Test case: Mở `/assignments/new?classId=cls-range` (lớp "IELTS 5.0–6.0") -> chip 6.0 được active (mục tiêu)
  - Test case: Mở `/assignments/new?classId=cls-toeic` (lớp "TOEIC 550") -> fallback chip 7.0 (không nhầm sang band 5.0)
  - Test case: Mở `/assignments/new?classId=cls-unknown` -> fallback chip 7.0
  - Test case: Mở `/assignments/new` không có query param -> fallback chip 7.0
  - Test case: Khôi phục draft đã lưu có band 6.5 -> draft thắng class default
  - Test case: Bấm "Tạo bài khác" sau khi tạo thành công giữ đúng band mặc định của lớp
  - Test case: Bấm bỏ qua draft banner (`discardDraftBanner`) đặt lại band về đúng band của lớp
- `apps/web/src/components/classes/class-assignments-tab.test.tsx`:
  - Test case: Kiểm tra link "Thêm đề mới" có search param chứa `classId` tương ứng

## Tasks & Steps

### Task 3.1 — Bổ sung test cases trong `new.test.tsx`
- Goal: Đảm bảo mọi kịch bản edge case của `classId` và `band` mặc định được bảo vệ bằng test.
- Target files: `apps/web/src/routes/_auth/assignments/new.test.tsx`
- Steps:
  1. Thêm mock các lớp học với các dạng trình độ khác nhau vào context kernel harness trong test:
     - `class-band-55`: `level: "Band 5.5"`, `type: "ielts"`
     - `class-range`: `level: "IELTS 5.0–6.0"`, `type: "ielts"`
     - `class-toeic`: `level: "TOEIC 550"`, `type: "communication"`
  2. Test 1: Render `NewAssignmentRoute` với `search = { classId: "class-band-55" }`. Kiểm tra chip "5.5" được chọn.
  3. Test 2: Render với `search = { classId: "class-range" }`. Kiểm tra chip "6.0" được chọn.
  4. Test 3: Render với `search = { classId: "class-toeic" }`. Kiểm tra chip "7.0" được chọn (không bị nhận diện nhầm).
  5. Test 4: Render với `search = { classId: "class-nonexistent" }`. Kiểm tra chip "7.0" được chọn.
  6. Test 5: Render không có `search`. Kiểm tra chip "7.0" được chọn.
  7. Test 6: Giả lập có saved draft với `band: "6.0"`, mở form với `classId: "class-band-55"`. Kiểm tra chip "6.0" được khôi phục từ draft (draft wins over class default).
  8. Test 7: Bỏ qua draft banner (click nút bỏ nháp). Kiểm tra form reset về band của lớp "5.5".
  9. Test 8: Tạo bài thành công với `classId: "class-band-55"`, bấm nút "Tạo bài khác". Kiểm tra form mới có band mặc định "5.5".
- Success criteria: Toàn bộ suite `new.test.tsx` pass.
- Verify: `pnpm --filter web test src/routes/_auth/assignments/new.test.tsx` exits 0.

### Task 3.2 — Bổ sung test case link trong `class-assignments-tab.test.tsx`
- Goal: Xác minh link "Thêm đề mới" liên kết đúng với `classId`.
- Target files: `apps/web/src/components/classes/class-assignments-tab.test.tsx`
- Steps:
  1. Mở view "assign" của `ClassAssignmentsTab`.
  2. Tìm phần tử link "Thêm đề mới".
  3. Assert `href` hoặc router navigation chứa `classId: classGroup.id`.
- Success criteria: Test trong `class-assignments-tab.test.tsx` pass.
- Verify: `pnpm --filter web test src/components/classes/class-assignments-tab.test.tsx` exits 0.

### Task 3.3 — Toàn bộ kiểm thử chất lượng và gates
- Goal: Đảm bảo không phát sinh lỗi types, lint, format hoặc test gãy ở bất kỳ package nào trong monorepo.
- Target files: Toàn bộ repo
- Steps:
  1. Chạy `pnpm check-types` trên toàn bộ workspace.
  2. Chạy `pnpm exec biome check .` để kiểm tra lint & format.
  3. Chạy `pnpm test` trên toàn bộ workspace (api, web, admin, server).
- Success criteria: Tất cả các lệnh đều exit 0 không có cảnh báo/lỗi.
- Verify: `pnpm check-types && pnpm exec biome check . && pnpm test` exits 0.

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
