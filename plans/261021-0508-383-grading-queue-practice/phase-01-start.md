---
phase: 1
title: "Phase 1: Contract & API hàng chờ chấm (GET /api/grading)"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Contract & API hàng chờ chấm (`GET /api/grading`)

<!-- Updated: Validation & Red-Team Session 1 - D1 50-id chunking, assignmentPrompt.part selection, loadGradingQueue branchLimit param -->

## Goal

Định nghĩa schema contract `gradingQueueItemSchema` / `gradingQueueResponseSchema` trong `@teacher-os/api/contracts` và triển khai handler `GET /api/grading` (cùng hàm `loadGradingQueue`) trong `apps/server/src/routes/grading.ts` theo quy trình TDD, đảm bảo đồng nhất nguồn `skill` và trạng thái `grade` với `loadGradableAttempt`, chống IDOR đa tổ chức, chia chunk tối đa 50 `testId` cho D1 khi truy vấn `assignmentPrompt.part`, không nhân bản dòng với đề nhiều part, và ưu tiên bài chờ chấm trước khi áp giới hạn dòng.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/grading.ts`
- Modify: `apps/server/src/routes/grading.test.ts`

## Tasks & Steps

### Task 1.1 — Thêm schema contract `gradingQueueItemSchema` và `gradingQueueResponseSchema`
- **Goal:** Khai báo kiểu dữ liệu và Zod schema cho từng dòng trong hàng chờ chấm và response của `GET /api/grading`.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts`: thêm `gradingQueueItemSchema`, `GradingQueueItem`, `gradingQueueResponseSchema`, `GradingQueueResponse` ngay sau `teacherSubmissionSchema`.
- **Steps:**
  1. Mở `packages/api/src/contracts.ts` tại khu vực `teacherSubmissionSchema` (khoảng dòng 1990–2010).
  2. Định nghĩa `gradingQueueItemSchema` với `.strict()` gồm:
     - `attemptId: z.string()`
     - `mode: z.enum(["assignment", "practice"])`
     - `classId: z.string()`
     - `className: z.string()`
     - `title: z.string()`
     - `due: z.string()`
     - `student: z.object({ id: z.string(), name: z.string() }).strict()`
     - `skill: z.enum(["writing", "speaking"])`
     - `part: z.string()`
     - `submittedAt: z.string()`
     - `grade: quizAttemptGradeSchema.nullable()`
  3. Định nghĩa `gradingQueueResponseSchema = z.object({ items: z.array(gradingQueueItemSchema) }).strict()` cùng type `GradingQueueItem` và `GradingQueueResponse`.
- **Success criteria:** `packages/api/src/contracts.ts` xuất khẩu đầy đủ `gradingQueueItemSchema`, `GradingQueueItem`, `gradingQueueResponseSchema`, `GradingQueueResponse` và typecheck không lỗi.
- **Verify:** `pnpm --filter @teacher-os/api check-types` thoát với exit code `0`.

### Task 1.2 — Viết unit tests cho `GET /api/grading` và `loadGradingQueue` (TDD Red Phase)
- **Goal:** Viết bộ test đầy đủ cho `GET /api/grading` và `loadGradingQueue` trong `apps/server/src/routes/grading.test.ts` trước khi cài đặt route handler.
- **Target files and symbols:**
  - `apps/server/src/routes/grading.test.ts`: thêm block `describe("GET /api/grading (queue)", ...)` kiểm tra toàn bộ điều kiện biên.
- **Steps:**
  1. Trong `apps/server/src/routes/grading.test.ts`, thêm các test case cho `GET /api/grading`:
     - Trả `401` khi chưa đăng nhập và `403` khi gọi bằng tài khoản học viên.
     - Trả danh sách hợp nhất cả bài nộp `mode='assignment'` (có `classId`, `className` của lớp, `due`) và bài nộp `mode='practice'` (`mode: "practice"`, `classId: ""`, `className: "Luyện tập"`, `due: ""`) thuộc kỹ năng `writing` và `speaking`.
     - Loại bỏ bài `status='in_progress'`, bài thuộc kỹ năng tự chấm (`reading`, `listening`), bài `practice` mà đề `assignment_test` đã bị xóa (`test_id` IS NULL), và bài của tổ chức khác (IDOR check).
     - Đề `practice` có 2 part (`assignment_test_part` position 1 gắn prompt `part='task1'`, position 2 gắn prompt `part='task2'`) chỉ xuất hiện **đúng 1 dòng** trong `items` với `part` là `"task1"` (từ `assignmentPrompt.part` của part có `position` nhỏ nhất); đề `practice` không có part nào vẫn xuất hiện với `part: ""`.
     - Khi có >50 đề `practice` khác nhau (ví dụ 55 đề), truy vấn chia chunk 50 `testId` vẫn lấy đủ `part` cho tất cả 55 dòng.
     - Thứ tự sắp xếp: bài chưa chấm (`grade: null`) luôn đứng trước bài đã chấm (`grade !== null`), trong từng nhóm sắp theo `submittedAt` giảm dần (mới nộp trước), tie-break theo `attemptId` giảm dần.
     - Bảo toàn bài chờ chấm khi cắt giới hạn (`loadGradingQueue(db, orgId, 2)`): khi có 1 bài chờ chấm nộp sớm hơn và 3 bài đã chấm nộp muộn hơn, gọi `loadGradingQueue(db, orgId, 2)` vẫn giữ bài chờ chấm ở vị trí đầu tiên.
- **Success criteria:** Test chạy và thất bại do `GET /api/grading` / `loadGradingQueue` chưa được cài đặt (Red phase).
- **Verify:** `pnpm --filter server test -- src/routes/grading.test.ts` thoát với exit code khác `0` (Red phase).

### Task 1.3 — Triển khai `loadGradingQueue` và `GET /api/grading` trong `apps/server/src/routes/grading.ts` (TDD Green Phase)
- **Goal:** Cài đặt `loadGradingQueue` và `routes.get("/", ...)` trong `apps/server/src/routes/grading.ts` để toàn bộ unit tests ở Task 1.2 xanh.
- **Target files and symbols:**
  - `apps/server/src/routes/grading.ts`: xuất khẩu `loadGradingQueue` và thêm `routes.get("/", ...)` trong `gradingRoutes`.
- **Steps:**
  1. Import `GradingQueueItem`, `GradingQueueResponse` từ `@teacher-os/api/contracts`, và `desc`, `inArray`, `sql` từ `drizzle-orm`.
  2. Định nghĩa hằng `GRADING_QUEUE_BRANCH_LIMIT = 500`, `D1_IN_ARRAY_CHUNK = 50`, và biểu thức sắp xếp ưu tiên chưa chấm trước: `sql` `(${quizAttempt.gradeScores} IS NOT NULL AND ${quizAttempt.gradedAt} IS NOT NULL) ASC` (kèm comment: POST `/grade` luôn ghi đủ 4 tiêu chí kèm `gradedAt`, còn chuẩn cuối cùng ở tầng ứng dụng vẫn đi qua `toQuizAttemptGrade`), tiếp theo `desc(quizAttempt.submittedAt)`, `desc(quizAttempt.id)`.
  3. Viết và export hàm `loadGradingQueue(db: Db, orgId: string, branchLimit: number = GRADING_QUEUE_BRANCH_LIMIT): Promise<GradingQueueItem[]>`:
     - Nhánh `assignment`: select từ `quizAttempt` `innerJoin` `classAssignment`, `assignmentPrompt`, `classTable`, `student` (mọi join đều kèm predicate `eq(..., orgId)`), lọc `eq(quizAttempt.orgId, orgId)`, `eq(quizAttempt.status, "submitted")`, `eq(quizAttempt.mode, "assignment")`, `inArray(assignmentPrompt.skill, ["writing", "speaking"])`, sắp xếp theo thứ tự ưu tiên chưa chấm trước rồi `limit(branchLimit)`.
     - Nhánh `practice`: select từ `quizAttempt` `innerJoin` `assignmentTest`, `student` (kèm predicate `eq(..., orgId)`), lọc `eq(quizAttempt.orgId, orgId)`, `eq(quizAttempt.status, "submitted")`, `eq(quizAttempt.mode, "practice")`, `inArray(assignmentTest.skill, ["writing", "speaking"])`, sắp xếp theo thứ tự ưu tiên chưa chấm trước rồi `limit(branchLimit)`.
     - Nếu nhánh `practice` có dòng, gom danh sách `testId` duy nhất, chia thành từng mảng con tối đa `D1_IN_ARRAY_CHUNK` (50) phần tử (tránh trần bind parameter của D1), và với mỗi chunk truy vấn `assignmentTestPart` `innerJoin` `assignmentPrompt` (`eq(assignmentPrompt.id, assignmentTestPart.promptId)` và `eq(assignmentPrompt.orgId, orgId)`) lấy `{ testId: assignmentTestPart.testId, part: assignmentPrompt.part }` với `inArray(assignmentTestPart.testId, chunk)`, `orderBy(asc(assignmentTestPart.position))`. Lưu `assignmentPrompt.part` đầu tiên của mỗi `testId` vào `Map<string, string>` (nếu đề không có part thì fallback `""`).
     - Chuyển từng dòng sang `GradingQueueItem` dùng `toQuizAttemptGrade(row)` làm nguồn duy nhất cho `grade` và `row.submittedAt ? row.submittedAt.toISOString() : ""`.
     - Gộp hai nhánh và sắp xếp lại trong bộ nhớ: bài `grade === null` đứng trước bài `grade !== null`; cùng nhóm thì so sánh `submittedAt` giảm dần, rồi `attemptId` giảm dần.
  4. Đăng ký `routes.get("/", async (c) => ...)` trước `routes.get("/:attemptId", ...)` trả `{ items } satisfies GradingQueueResponse`.
- **Success criteria:** Toàn bộ unit tests trong `apps/server/src/routes/grading.test.ts` vượt qua.
- **Verify:** `pnpm --filter server test -- src/routes/grading.test.ts` thoát với exit code `0` và in `passed`.

## Verification

- `pnpm --filter @teacher-os/api check-types`
- `pnpm --filter server test -- src/routes/grading.test.ts`
- `pnpm --filter server check-types`

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