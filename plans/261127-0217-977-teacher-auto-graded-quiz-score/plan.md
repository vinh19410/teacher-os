---
title: "Hiển thị điểm tự chấm bài trắc nghiệm phía giáo viên (#977)"
description: "Trả về correctCount, totalQuestions (JSON1 đếm phần tử object có lọc kỹ năng tự chấm), hasGradableTask và submittedAt fallback trong kernel snapshot; hiển thị điểm tự chấm X/Y trên panel bài tập lớp và tab Bài tập trang chi tiết học viên (đổi nhãn cột Band → Điểm); đồng thời sửa chỉ số Bài tập chưa có điểm trên Dashboard chỉ đếm bài tự luận giao lớp đang mở đã nộp chờ chấm."
status: completed
priority: P1
effort: "4.5h"
issue: 977
branch: vinh19410/i-m-t-ch-m-b-i-tr-c-nghi-m-kh-ng-hi-n-th-b-t-k-u
tags: [bugfix, server, web, grading, assignments, dashboard, issue-977]
created: 2026-11-27
---

# Hiển thị điểm tự chấm bài trắc nghiệm phía giáo viên (#977)

## Overview

<!-- Updated: Red-Team Session 1 & Validation Session 1 - apply 11 findings and 2 confirmed decisions -->
Khi học viên nộp bài trắc nghiệm tự chấm (`reading`, `listening`, `grammar`, `vocabulary`, hoặc phần trắc nghiệm của bài gộp `+ Writing`), server (`apps/server/src/routes/student.ts:3092-3126`) đã chấm tự động và lưu `quiz_attempt.correct_count` cùng `quiz_attempt.questions_snapshot`. Tuy nhiên phía giáo viên không thấy điểm tự chấm ở bất kỳ bề mặt nào do 4 nguyên nhân gốc đã chứng minh trong codebase:

1. **Server snapshot bỏ sót điểm tự chấm, cờ `hasGradableTask` và fallback `submittedAt` (`apps/server/src/routes/snapshot.ts:523-612`):**
   - `submittedAttemptRows` chỉ lấy 5 cột (`id`, `assignmentId`, `studentId`, `gradeScores`, `gradedAt`), bỏ qua `correctCount`, số câu hỏi trong `questionsSnapshot`, và `quizAttempt.submittedAt` (khiến cửa sổ flip-first bị lệch giữa cổng học viên và giáo viên so với `student-class.ts:270-273`).
   - Đề Writing/Speaking thuần vẫn được `student.ts:3107` ghi `correctCount = 0` với `questionsSnapshot = "[]"`, và `parseQuizQuestions` (`student.ts:331-345`) chỉ đếm phần tử kiểu `'object'`. Do đó cần `INNER JOIN assignment_prompt` để chỉ chạy SQLite JSON1 trên kỹ năng tự chấm (`reading`, `listening`, `grammar`, `vocabulary` — không đọc overflow page của bài Writing/Speaking) và đếm `(SELECT COUNT(*) FROM json_each(...) WHERE type = 'object')` khớp 100% `parseQuizQuestions`.
   - `snapshot.ts:363` lọc `isNull(assignmentPrompt.libraryRef)`, trong khi `POST /api/classes/:id/assignments` không chặn prompt `libraryRef != null`; truyền thêm `hasGradableTask` từ server trên `classAssignments[]` (join `assignmentPrompt` không lọc `libraryRef`) và thêm `notLike(..., "demo-student:%")` bịt kín ranh giới dữ liệu ở cả 3 bề mặt giáo viên.
2. **Panel bài tập lớp (`apps/web/src/components/classes/class-assignments-tab.tsx:84-90,143-154,375-396`):** Chỉ render `<TargetGradeActions>` khi `gradable === true`; bài trắc nghiệm tự chấm thuần chỉ hiện `"Đã nộp"`, bài hybrid chưa hiện `"Trắc nghiệm · X/Y"`, `defaultOpenIds` chưa lọc `gradable` và thiếu `data.assignmentPrompts` trong `useMemo` deps, `TargetGradeActions` chưa kiểm chuẩn `isBandStep`/`Date.parse(gradedAt)`, và `sm:shrink-0` ở dòng `383` phá vỡ `flex-wrap` khi dòng có nhiều tag trên `640px–1024px`.
3. **Trang chi tiết học viên → tab Bài tập (`apps/web/src/lib/repos/student-assignments.ts`, `apps/web/src/routes/_auth/students/$studentId.tsx:80-153,417`):** `StudentAssignmentRow` thiếu `correctCount`, `totalQuestions`, `hasGradableTask`, `submitted`; tiêu đề cột 4 là `"Band"` (không phù hợp với điểm thô `3/3` theo #957/#977); nhánh render chỉ xử lý `hasGradedBand` và rơi về `"—"` cho bài trắc nghiệm.
4. **Dashboard → Toàn trung tâm (`apps/web/src/routes/_auth/dashboard.tsx:171`, `apps/web/src/components/dashboard/org-stats-section.tsx:44-49`):** `const ungraded = data.assignments.filter((a) => a.status !== "graded").length` chỉ đọc bảng legacy `assignment` (chỉ có trạng thái `"not-submitted" | "late" | "graded"`, không có `"submitted"`), bỏ qua toàn bộ `data.classAssignments`.

Kế hoạch này tuân thủ hợp đồng TDD bàn giao (`--tdd --advice`).

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - **Shared helpers & Contracts (`packages/api`):**
    - Tạo `packages/api/src/lib/objective-score.ts` + `packages/api/src/lib/objective-score.test.ts` (`ObjectiveScore`, `normalizeObjectiveScore` dùng `Number.isSafeInteger`, `formatObjectiveScore`, và helper dùng chung `hasValidGradedBand` nếu cần — hoặc để ở `ielts-band.ts` / `objective-score.ts` để thống nhất `isBandStep` + `Date.parse(gradedAt)` trên mọi consumer).
    - Mở rộng `KernelClassAssignmentRow` (`packages/api/src/contracts.ts:2266-2290`) thêm optional `hasGradableTask?: boolean` trên row và optional `correctCount?: number | null`, `totalQuestions?: number | null` trên từng phần tử `targets[]`.
  - **Server snapshot (`apps/server`):**
    - Cập nhật `apps/server/src/routes/snapshot.ts:523-612`: join `assignmentPrompt` tính `hasGradableTask` cho `classAssignmentRows`, lọc `notLike(..., "demo-student:%")` ở `classAssignmentTargetRows` & `submittedAttemptRows`, chọn thêm `submittedAt: quizAttempt.submittedAt`, `correctCount: quizAttempt.correctCount`, và `totalQuestions` bằng JSON1 chỉ chạy cho `AUTO_GRADABLE_SKILLS` đếm phần tử `type = 'object'` khớp `parseQuizQuestions`; fallback `submittedAt: target.submittedAt ?? (attempt?.submittedAt ? attempt.submittedAt.toISOString() : null)`; chuẩn hóa điểm bằng `normalizeObjectiveScore`.
    - Cập nhật exact `.toEqual` ở `apps/server/src/kernel.test.ts:6650-6667` và thêm block `describe("Snapshot objective score (#977)")` độc lập (in-memory DB riêng) trong `apps/server/src/routes/grading.test.ts`.
  - **Web data & mappers (`apps/web`):** cập nhật `apps/web/src/lib/mock-data.ts:120-139` (`hasGradableTask?`, `correctCount?`, `totalQuestions?`) và `apps/web/src/lib/repos/class-assignments.ts` + `class-assignments.test.ts`.
  - **Class Assignments Panel (`apps/web`):** cập nhật `apps/web/src/components/classes/class-assignments-tab.tsx` + `class-assignments-tab.test.tsx` (hiện `Tự chấm · X/Y`, giữ `Đã nộp · trễ hạn` nếu trễ, hiện `Trắc nghiệm · X/Y` cho hybrid, đồng bộ flip-first + `hasValidBandGrade`, gỡ `sm:shrink-0` chống tràn/cắt tên 640px–1024px, sửa `defaultOpenIds` thêm `data.assignmentPrompts` vào deps, xóa import thừa `isGradableSkill`).
  - **Student Detail tab Bài tập (`apps/web`):** cập nhật `apps/web/src/lib/repos/student-assignments.ts` + `student-assignments.test.ts` và `apps/web/src/routes/_auth/students/$studentId.tsx` + `$studentId.test.tsx` (header `"Band"` → `"Điểm"`, hỗ trợ pure MCQ, `0/N`, nộp trễ, flip-first kể cả hybrid, hybrid trước/sau chấm Writing, giữ nguyên `"5.5"`, `"6.5"`, `"0.0"` cho Writing/Speaking thuần).
  - **Dashboard Toàn trung tâm (`apps/web`):** thêm pure selector `ungradedAssignmentsCount` ở `apps/web/src/lib/dashboard-from-kernel.ts` + `dashboard-from-kernel.test.ts` (chỉ đếm bài `hasGradableTask` giao lớp đang mở đã nộp chưa chấm hợp lệ; bỏ đếm bảng legacy `not-submitted`/`late` và loại trừ bài trắc nghiệm tự chấm), nối vào `apps/web/src/routes/_auth/dashboard.tsx:171`, cập nhật `apps/web/src/components/dashboard/org-stats-section.tsx` (`<span>` tách biệt cho `"Bài tập chưa có điểm"` + dòng phụ `"Writing & Speaking giao lớp chờ chấm"` + `data-testid="org-stats-ungraded-count"`) + `dashboard.test.tsx`.
  - **Verification & POT:** toàn bộ gate tĩnh/unit, mở rộng `apps/e2e/specs/teacher-grade-submission.spec.ts` (seed Grammar `part: "g1"`, dùng `${TEACHER_BASE_URL}`, verify `defaultOpenIds` không có `?tab=assignments`, selector thực tế `AttemptScoreCard`, timeout 180s, chụp đủ 18 ảnh POT 3 viewport × 2 theme cho cả 3 bề mặt + kiểm tra 320px reflow & keyboard focus), và chạy `pnpm design:compare --screens t-dashboard,t-class-detail --force`.
- **Explicit Non-Goals:**
  - Không thêm Drizzle migration DB ở PR này (theo quyết định Validation Session 1 — giữ zero-migration, dùng SQLite JSON1 có lọc `AUTO_GRADABLE_SKILLS` + đếm `type = 'object'`).
  - Không thay đổi luồng Study Pack (`classStudyPackId IS NOT NULL`), Practice (`mode = "practice"`), `/grading/$attemptId` cho pure MCQ (`grading.ts:661`), hay wire contract `/api/dashboard/reminders` (`dashboard-reminders.ts:344-347`).
  - Không thêm điểm vào accordion header của `ClassAssignmentsTab`, `session-materials-modal.tsx`, hay thẻ stat `"bài chờ nộp"` trên `classes/$classId.tsx`.
  - Không chạy full E2E suite ở local (theo `AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Trả về `correctCount`, `totalQuestions` (JSON1 đếm phần tử object chỉ cho kỹ năng tự chấm), `hasGradableTask` và `submittedAt` fallback trong kernel snapshot mà không thêm migration DB và không phát `0/0` | P1 |
| 2 | Hiển thị điểm tự chấm `X/Y` rõ ràng, responsive từ 320px–1440px và nhất quán flip-first trên panel bài tập lớp và tab Bài tập của học viên (đổi nhãn `"Band"` → `"Điểm"`) | P1 |
| 3 | Sửa chỉ số `"Bài tập chưa có điểm"` trên Dashboard chỉ đếm bài tự luận (`hasGradableTask`) giao lớp đang mở đã nộp chờ chấm, bỏ bảng legacy chưa nộp, loại trừ bài trắc nghiệm tự chấm và minh bạch phạm vi | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Objective Score Helper, Server Snapshot & Mapper (TDD)](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Teacher UI Surfaces & Dashboard Ungraded Selector (TDD)](./phase-02-teacher-ui-surfaces-and-dashboard-ungraded.md) | Completed |
| 3 | [Phase 3: Verification Gates, Targeted E2E, Design Compare & Visual POT](./phase-03-verification-e2e-and-visual-pot.md) | Completed |

## Success Criteria

- [x] `normalizeObjectiveScore` và `formatObjectiveScore` (`packages/api/src/lib/objective-score.ts`) dùng `Number.isSafeInteger`, chấp nhận `0/N` (`0 <= correctCount <= totalQuestions`, `totalQuestions > 0`) và chuẩn hóa mọi giá trị `0/0`, `null`, âm, số thực, `NaN`, `Infinity`, `Number.MAX_SAFE_INTEGER + 1`, `correctCount > totalQuestions` về `null`.
- [x] `GET /api/kernel` trả về `hasGradableTask` trên mỗi `classAssignment` (vá khe hở `libraryRef`), lọc `demo-student:%`, fallback `submittedAt` từ `quizAttempt.submittedAt`, và trả `correctCount`/`totalQuestions` hợp lệ cho bài tự chấm (`0/3`, `3/3`) và bài hybrid — trả `null, null` cho Writing/Speaking thuần, bài chưa nộp, JSON hỏng, mảng chứa phần tử non-object (`[null, 123]`), và `correctCount > totalQuestions`.
- [x] Panel bài tập lớp (`ClassAssignmentsTab`): bài tự chấm thuần hiện `Tự chấm · 3/3` (`0/3`, giữ kèm `Đã nộp · trễ hạn` khi nộp trễ); bài hybrid hiện `Trắc nghiệm · 2/3` cạnh `Chấm bài` hoặc `Đã chấm · Band 6.5`; đồng bộ flip-first & `hasValidBandGrade` (`isBandStep` + `Date.parse`); `defaultOpenIds` chỉ mở bài `gradable` chờ chấm tay (có `data.assignmentPrompts` trong `useMemo` deps); bỏ `sm:shrink-0` chống tràn ngang/cắt tên ở `640px–1024px`.
- [x] Trang chi tiết học viên (`/teacher/students/$studentId`) → tab **Bài tập**: header cột 4 là `"Điểm"`; bài tự chấm thuần hiện `3/3` (`0/3`) + `<StatusTag tone="ok">Tự chấm</StatusTag>` (hoặc `Tự chấm · trễ hạn` với `tone="warn"` khi trễ); bài Writing/Speaking đã chấm giữ nguyên `"5.5"`, `"6.5"`, `"0.0"` + `"Đã chấm"`; bài hybrid hiện `"2/3"` + trạng thái nộp (`"Đã nộp"` kể cả flip-first) khi chưa chấm Writing và `"Band 6.5 · 2/3"` + `"Đã chấm"` khi đã chấm Writing; bài chưa nộp / Reading không có điểm giữ `"—"`.
- [x] Dashboard (`/teacher/dashboard`) → khối **Toàn trung tâm**: `"Bài tập chưa có điểm"` kèm dòng phụ `"Writing & Speaking giao lớp chờ chấm"` (bọc `<span>` tách biệt giữ `getByText("Bài tập chưa có điểm")` pass) chỉ đếm bài `hasGradableTask` giao lớp đang mở (`status !== "paused"`) đã nộp chưa chấm hợp lệ (bỏ đếm bảng legacy `not-submitted`/`late`, tuyệt đối không đếm bài trắc nghiệm tự chấm hay bài chưa nộp).
- [x] `pnpm exec biome check .`, `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `CI=1 pnpm --filter web test`, targeted E2E `specs/teacher-grade-submission.spec.ts` (ports 8100–8105, `4 passed`) và `pnpm design:compare --screens t-dashboard,t-class-detail --force` đều pass 100%, không tràn ngang ở `320px/375px/768px/1440px` cả Light & Dark, đủ 18 ảnh POT (3 màn × 3 viewport × 2 theme) trong `plans/reports/` và sạch file PNG lịch sử.

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model tầng thấp hơn: mỗi phase được phân rã thành các task tự chứa kèm đường dẫn tệp/symbol chính xác, điều kiện TDD đỏ/xanh rõ ràng, lệnh `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng + hỏi `kongming` ngay khi bất kỳ bước kiểm chứng nào thất bại.

## Validation Log

### Session 1 — 2026-11-27
**Trigger:** Thẩm định và chốt 11 phát hiện Red-Team (3 reviewer song song có bằng chứng `file:line`) cùng 2 quyết định sản phẩm/kiến trúc trước khi triển khai issue #977.
**Questions asked:** 3 (gộp Red-Team adjudication + 2 quyết định Validation trong 1 lượt `ask_question`).

#### Questions & Answers
1. **[Red-Team Adjudication]** Xử lý 11 phát hiện Red-Team (4 Critical, 4 High, 3 Medium) có bằng chứng `file:line`.
   - Options: `(Recommended) Đồng ý áp dụng toàn bộ 11 phát hiện Red-Team vào kế hoạch rồi triển khai luôn` | `Xem chi tiết từng phát hiện trước khi áp dụng` | `Bỏ qua các phát hiện Red-Team, giữ nguyên kế hoạch ban đầu`
   - **Answer:** `(Recommended) Đồng ý áp dụng toàn bộ 11 phát hiện Red-Team vào kế hoạch rồi triển khai luôn`
   - **Rationale:** Toàn bộ 11 phát hiện đều có bằng chứng mã nguồn cụ thể (`grading.test.ts` stateful DB, bash escape `$studentId.test.tsx`, thiếu `TEACHER_BASE_URL` & `part: "g1"` ở E2E, SQLite JSON1 object-count & lọc skill, đồng bộ flip-first & `isBandStep`, `hasGradableTask` cho `libraryRef` + lọc `demo-student:%`, bỏ legacy chưa nộp ở Dashboard, gỡ `sm:shrink-0`, `Number.isSafeInteger`, gỡ import thừa `isGradableSkill` + deps `useMemo`, đủ 3 viewport POT & compose `design:compare`).
2. **[Scope — Dashboard "Bài tập chưa có điểm"]** Phạm vi đếm của chỉ số `"Bài tập chưa có điểm"` trên khối Toàn trung tâm.
   - Options: `(Recommended) Chỉ đếm bài tự luận giao lớp đang mở đã nộp chờ chấm (bỏ bảng legacy not-submitted/late, loại trừ bài trắc nghiệm tự chấm) kèm dòng phụ "Writing & Speaking giao lớp chờ chấm"` | `Cộng thêm bảng legacy assignments (status !== "graded") để giữ tương thích dữ liệu cũ (chấp nhận đếm cả bản ghi legacy chưa nộp)` | `Mở rộng API server (hoặc /api/dashboard/reminders) để đếm toàn org gồm cả bài tự luyện Practice và Study Pack (tăng phạm vi sang server API mới)`
   - **Answer:** `(Recommended) Chỉ đếm bài tự luận giao lớp đang mở đã nộp chờ chấm (bỏ bảng legacy not-submitted/late, loại trừ bài trắc nghiệm tự chấm) kèm dòng phụ "Writing & Speaking giao lớp chờ chấm"`
   - **Rationale:** Bảng legacy `assignment` chỉ có `"not-submitted" | "late" | "graded"` (không có `"submitted"`); loại trừ legacy và ghi rõ dòng phụ `"Writing & Speaking giao lớp chờ chấm"` giúp con số hoàn toàn trung thực, không đếm bài chưa nộp hay bài trắc nghiệm tự chấm, và không mâu thuẫn ngữ nghĩa với thẻ nhắc việc Practice/Study Pack phía trên.
3. **[Architecture — Đếm totalQuestions trong snapshot]** Phương án tính `totalQuestions` trong `snapshot.ts`.
   - Options: `(Recommended) Không thêm migration DB ở PR này — join assignment_prompt lọc đúng kỹ năng tự chấm và đếm phần tử object trong SQLite JSON1 (không đọc blob bài Writing/Speaking, khớp 100% parseQuizQuestions)` | `Thêm Drizzle migration tạo cột integer total_questions + migration backfill cho quiz_attempt (tối ưu tuyệt đối chi phí đọc D1 cho org hàng nghìn attempt nhưng tăng rủi ro deploy migration)`
   - **Answer:** `(Recommended) Không thêm migration DB ở PR này — join assignment_prompt lọc đúng kỹ năng tự chấm và đếm phần tử object trong SQLite JSON1 (không đọc blob bài Writing/Speaking, khớp 100% parseQuizQuestions)`
   - **Rationale:** Giữ PR sửa lỗi gọn nhẹ, không rủi ro migration D1, vẫn loại bỏ hoàn toàn I/O đọc JSON blob trên bài Writing/Speaking và đồng nhất 100% ngữ nghĩa đếm câu với `parseQuizQuestions`.

#### Confirmed Decisions
- Áp dụng trọn vẹn 11 phát hiện Red-Team vào `plan.md`, `phase-01-start.md`, `phase-02-teacher-ui-surfaces-and-dashboard-ungraded.md`, `phase-03-verification-e2e-and-visual-pot.md`.
- Dashboard `"Bài tập chưa có điểm"`: chỉ đếm bài tự luận (`hasGradableTask`) giao lớp đang mở đã nộp chưa chấm, bỏ bảng legacy `not-submitted`/`late`, dùng dòng phụ `"Writing & Speaking giao lớp chờ chấm"`.
- Snapshot `totalQuestions`: giữ zero-migration, `INNER JOIN assignment_prompt` lọc `AUTO_GRADABLE_SKILLS` và đếm phần tử `type = 'object'` bằng SQLite JSON1.

#### Impact on Phases
- Phase 1: Dùng `Number.isSafeInteger`; thêm `hasGradableTask` & `submittedAt` fallback & `demo-student:%` filter & JSON1 object-count có lọc skill trong `snapshot.ts`; tách `describe("Snapshot objective score (#977)")` độc lập dùng `gradeScores` (không cột `band`) trong `grading.test.ts`; truyền `hasGradableTask` trong `mapClassAssignments`.
- Phase 2: Đồng bộ `isSubmitted` & `hasValidBandGrade` trên `ClassAssignmentsTab` / `studentAssignmentRows` / `$studentId.tsx` / `ungradedAssignmentsCount`; gỡ `sm:shrink-0`, xóa import thừa `isGradableSkill`, thêm `data.assignmentPrompts` vào `useMemo` deps; sửa escape `'src/routes/_auth/students/$studentId.test.tsx'`; bỏ đếm bảng legacy và đổi dòng phụ sang `"Writing & Speaking giao lớp chờ chấm"`.
- Phase 3: Đổi Grammar seed `part: "g1"`, dùng `${TEACHER_BASE_URL}` + SPA nav, kiểm chứng `defaultOpenIds` không gắn `?tab=assignments`, dùng selector `AttemptScoreCard`, đặt `test.setTimeout(180_000)`, chụp đủ 18 ảnh POT (3 màn × 3 viewport × 2 theme), và chạy `pnpm design:compare --screens t-dashboard,t-class-detail --force` (bỏ `--side app`).

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier — chạy song song qua 3 reviewer độc lập)
- **Claims checked:** 24
- **Verified:** 13 | **Failed (now fixed in plan):** 11 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-teacher-ui-surfaces-and-dashboard-ungraded.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 13 (11 phát hiện Red-Team + 2 quyết định Validation)
- Reconciled stale references: 13
- Unresolved contradictions: 0

## Red Team Review

### Session 1 — 2026-11-27
**Reviewers:** 3 parallel fresh-context `code-reviewer` subagents (`Security Adversary`, `Assumption Destroyer`, `Failure Mode Analyst`) — Standard tier (`Fact Checker + Contract Verifier`).
**Findings:** 11 deduplicated (11 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 4 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `grading.test.ts` stateful DB dùng chung gây false TDD Red với `-t "Snapshot kernel"`, ô nhiễm `org-1` và seed nhầm cột `band` (không tồn tại; phải dùng `gradeScores`) | Critical | Accept | `plan.md`, Phase 1 (Task 1.2) |
| 2 | Escape sai `\\$studentId.test.tsx` trong lệnh Verify Phase 2 Task 2.2 khiến bash mở rộng rỗng và Vitest âm thầm bỏ qua `$studentId.test.tsx` | Critical | Accept | Phase 2 (Task 2.2) |
| 3 | Phase 3 Task 3.2 thiếu `${TEACHER_BASE_URL}` (gây 404), seed Grammar `part: "tenses"` ngoài catalog `"g1"`, sai text `AttemptScoreCard`, thiếu `test.setTimeout`, và `?tab=assignments` bỏ qua `defaultOpenIds` | Critical | Accept | `plan.md`, Phase 3 (Task 3.2) |
| 4 | JSON1 `json_array_length` lệch `parseQuizQuestions` với phần tử non-object (`[null, 123]`) và quét `questions_snapshot` cả trên bài Writing/Speaking | Critical | Accept | `plan.md`, Phase 1 (Task 1.2) |
| 5 | Flip-first partial-write (`submittedAt: null, attemptId != null`) gây lệch Student↔Teacher và UI tự mâu thuẫn (`Chưa có bài nộp` / `Chưa nộp · quá hạn` cạnh điểm), cùng thiếu kiểm chuẩn `isBandStep`/`Date.parse` ở `ClassAssignmentsTab` | High | Accept | `plan.md`, Phase 1 (Task 1.2), Phase 2 (Tasks 2.1, 2.2) |
| 6 | Lệch ranh giới `libraryRef` (`snapshot.assignmentPrompts` lọc `libraryRef IS NULL` nhưng `classAssignments` có thể trỏ prompt thư viện) và thiếu lọc `demo-student:%` trên `classAssignmentTarget` / `quizAttempt` | High | Accept | `plan.md`, Phase 1 (Tasks 1.2, 1.3), Phase 2 (Tasks 2.1, 2.2, 2.3) |
| 7 | `ungradedAssignmentsCount` cộng bảng legacy `a.status !== "graded"` (gồm `"not-submitted"`/`"late"`) vi phạm Success Criterion và nhãn phụ chưa phản ánh phạm vi giao lớp so với `ReminderCards` | High | Accept | `plan.md`, Phase 2 (Task 2.3), Phase 3 (Task 3.2) |
| 8 | `sm:shrink-0` trên cụm action `.sub-row` (`class-assignments-tab.tsx:383`) phá vỡ `flex-wrap` gây tràn ngang / cắt tên học viên ở `640px–1024px` | High | Accept | `plan.md`, Phase 2 (Task 2.1) |
| 9 | `normalizeObjectiveScore` cần dùng `Number.isSafeInteger` thay vì `Number.isInteger` để chặn số vượt `MAX_SAFE_INTEGER` (`1e+21`) | Medium | Accept | `plan.md`, Phase 1 (Task 1.1) |
| 10 | `ClassAssignmentsTab` để sót import thừa `isGradableSkill` (lỗi Biome `noUnusedImports`) và thiếu `data.assignmentPrompts` trong `useMemo` deps của `defaultOpenIds` | Medium | Accept | `plan.md`, Phase 2 (Task 2.1) |
| 11 | Phase 3 thiếu ảnh POT `tablet`/`phone` cho `student-assignments` & `dashboard-org-stats` và `--side app` bỏ qua ghép ảnh đối chiếu `design:compare` | Medium | Accept | `plan.md`, Phase 3 (Files, Tasks 3.2, 3.3) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-teacher-ui-surfaces-and-dashboard-ungraded.md`, `phase-03-verification-e2e-and-visual-pot.md`
- Decision deltas checked: 13
- Reconciled stale references: 13
- Unresolved contradictions: 0

<!-- slug: 977-teacher-auto-graded-quiz-score -->
