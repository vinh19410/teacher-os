---
phase: 4
title: "Phase 4: E2E Docs and POT"
status: done
priority: P1
effort: "45m"
dependencies: [2, 3]
---

# Phase 4: E2E Docs and POT

## Goal
Cập nhật 4 E2E specs bị ảnh hưởng + `helpers-quiz.ts`, cập nhật `DESIGN.md`, chạy toàn bộ local gates, chụp ảnh POT 3 viewport Light/Dark bằng số GitHub issue thật và kiểm tra không tràn ngang.

## Files to Create / Modify
- Modify: `apps/e2e/specs/helpers-quiz.ts`
- Modify: `apps/e2e/specs/study-pack.spec.ts`
- Modify: `apps/e2e/specs/student-class-detail.spec.ts`
- Modify: `apps/e2e/specs/student-classmates.spec.ts`
- Modify: `apps/e2e/specs/student-practice.spec.ts`
- Modify: `DESIGN.md`

## Tasks & Steps

### Task 4.1 — Cập nhật `helpers-quiz.ts` và 4 E2E specs liên quan
- Goal: Đồng bộ fixture và assertions E2E với hành vi mới (Tab `Bài tập` chỉ hiển thị bộ đề tự học kèm ngày dự kiến, cho làm trước; homework mở từ `Hành trình học`).
- Target files and symbols:
  - `apps/e2e/specs/helpers-quiz.ts` (`QuizSeedPrompt`, `seedQuizFixture`)
  - `apps/e2e/specs/study-pack.spec.ts`
  - `apps/e2e/specs/student-class-detail.spec.ts`
  - `apps/e2e/specs/student-classmates.spec.ts`
  - `apps/e2e/specs/student-practice.spec.ts`
- Steps:
  1. `helpers-quiz.ts`: thêm `sessionDate?: string` vào `QuizSeedPrompt` và optional `studyPack` vào `seedQuizFixture`.
  2. `study-pack.spec.ts`:
     - Test 1: đổi Day 2 `/quiz` từ `404` → `200`; mở `/student/classes/${classId}?tab=assignments` xác nhận **cả Day 1 và Day 2** cùng hiển thị kèm ngày dự kiến, làm trước & nộp Day 2 thành công; xác nhận Day 2 xuất hiện ở `/`; ở bước 10 sau khi học viên 2 kích hoạt ghi danh, cập nhật assertion tiến độ nộp cho Day 1 và Day 2 đều là `"1/2 đã nộp"` (vì Học viên 1 đã nộp cả Day 1 lẫn nộp sớm Day 2, thay cho `"0/2 đã nộp"` cũ).
     - Test 2 (Course Foun/GT1 69 ngày): đổi Day 2 `/audio` từ `404` → `200`; mở `/student/classes/${classId}?tab=assignments` xác nhận hiển thị toàn bộ bộ đề tự học + ngày dự kiến; khi `CAPTURE_POT_ISSUE` được truyền số issue thật (tạo ở Step 5 Vibe), chụp ảnh POT 3 viewport (`1440×900`, `768×1024`, `375×812`) Light/Dark + check overflow (gồm 320px) lưu vào `plans/reports/${potIssue}-student-study-pack-tab-${vp.key}-${theme}.png`.
  3. `student-class-detail.spec.ts`: gắn `sessionDate` cho bài homework Reading để mở từ `Hành trình học`, và seed thêm bộ đề tự học 2 ngày để test Tab `Bài tập` chỉ hiện bộ đề tự học (không hiện homework gắn buổi) và mở làm trước được Ngày 2.
  4. `student-classmates.spec.ts`: cập nhật empty state `"Chưa có bộ đề tự học"`.
  5. `student-practice.spec.ts`: xác nhận `/classes/${fixture.classId}?tab=assignments` không chứa `practiceTestTitle`, và `/assignments` chứa `classQuizTitle` ở trạng thái `"Chưa nộp"`.
- Success criteria: Cả 4 spec phản ánh trung thực contract mới và chụp đủ 6 ảnh POT (3 viewport × Light/Dark) với tên file mang số issue thật.
- Verify: `CAPTURE_POT_ISSUE=<issue_number> E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/study-pack.spec.ts specs/student-class-detail.spec.ts specs/student-classmates.spec.ts specs/student-practice.spec.ts` exits 0.

### Task 4.2 — Cập nhật `DESIGN.md` và chạy toàn bộ local gates
- Goal: Tài liệu `DESIGN.md` khớp giao diện mới và toàn bộ lint, typecheck, test suite đều xanh.
- Target files and symbols: `DESIGN.md` (dòng 115–116).
- Steps:
  1. Cập nhật đoạn mô tả `Hành trình học` (nút làm bài 1-click trực tiếp trên bài tập gắn buổi) và `Bài tập` (chỉ hiển thị bộ đề tự học kèm ngày dự kiến, cho phép làm trước).
  2. Chạy `pnpm exec biome check .` (nếu có lỗi format thì chạy `pnpm check:fix` rồi chạy lại `pnpm exec biome check .`), `pnpm check-types`, và `pnpm test`.
- Success criteria: `biome check`, `check-types`, `pnpm test` đều exit 0, không sót process nền.
- Verify: `pnpm exec biome check . && pnpm check-types && pnpm test` exits 0 with 0 failures.

## Todo
- [x] Task 4.1: Update E2E specs & capture POT screenshots
- [x] Task 4.2: Update `DESIGN.md` and pass all local gates

## Verification
- `pnpm exec biome check . && pnpm check-types && pnpm test`
- Targeted 4 E2E specs pass with port overrides `8100/8101/8103/8104/8105`

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
