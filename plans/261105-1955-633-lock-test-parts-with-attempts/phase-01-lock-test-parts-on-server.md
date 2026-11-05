---
phase: 1
title: "Khóa thay đổi part ở server"
status: done
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Khóa thay đổi part ở server

## Goal

`PUT /api/assignments/tests/:id/parts` từ chối mọi yêu cầu thay đổi (thêm, gỡ, đổi promptId, đổi qStartOverride) trên bộ đề đã có ít nhất một `quiz_attempt` cùng tổ chức, trả về mã lỗi HTTP 409 và `code: "TEST_PARTS_LOCKED"`. Khi danh sách part gửi lên giống hệt danh sách hiện có, route bỏ qua việc ghi đè và trả về HTTP 200.

## Files to Create / Modify

- `packages/api/src/contracts.ts`: Thêm `ASSIGNMENT_TEST_ERROR_CODES` và export type `AssignmentTestErrorCode`.
- `apps/server/src/routes/assignments/tests.ts`: Trong handler `PUT /:id/parts`, bổ sung kiểm tra `quiz_attempt` và so khớp khác biệt parts.
- `apps/server/src/routes/assignments/tests.test.ts`: Thêm bộ test TDD kiểm tra cơ chế khóa part của test.

## Tasks & Steps

### Task 1.1 — TDD Red: Viết test kiểm tra khóa part khi có quiz_attempt
- Goal: Bộ test mô tả toàn bộ hành vi khóa part và fail trước khi sửa logic nghiệp vụ.
- Target files: `apps/server/src/routes/assignments/tests.test.ts`
- Steps:
  1. Thêm helper tạo attempt cho test:
     - Chèn bản ghi `organization` (nếu cần), `student` (bảng `schema.student` với `orgId`), và `quiz_attempt` (`schema.quizAttempt`) với `studentId`, `testId: testId`, `orgId: ctx.orgId`, `mode: "practice"`, `assignmentId: null`, `status: "submitted"` hoặc `"in_progress"`.
     - Hỗ trợ ca test cách ly tổ chức: tạo `org-2` kèm student của `org-2` và attempt của `org-2`.
  2. Viết các ca kiểm thử:
     - Đổi prompt của một slot trên test đã có bài làm `submitted` -> trả về 409, body có `code: "TEST_PARTS_LOCKED"`, các bản ghi `assignment_test_part` trong DB giữ nguyên không bị thay đổi (giữ nguyên ID).
     - Đổi prompt khi test có bài làm `in_progress` -> trả về 409 `TEST_PARTS_LOCKED`.
     - Gỡ part (gửi ít slot hơn) khi có bài làm -> trả về 409 `TEST_PARTS_LOCKED`.
     - Thêm part (gửi thêm slot mới) khi có bài làm -> trả về 409 `TEST_PARTS_LOCKED`.
     - Đổi `qStartOverride` khi có bài làm -> trả về 409 `TEST_PARTS_LOCKED`.
     - Gửi lại danh sách part giống hệt (kể cả đảo thứ tự mảng) khi có bài làm -> trả về 200, row ID trong DB không đổi.
     - Test chưa có bài làm -> đổi part thành công (200).
     - Org khác có attempt gắn với cùng testId -> không gây khóa test của org hiện tại (200).
- Success criteria: Test file biên dịch được; các test mới chạy và fail với status 200 thay vì 409.
- Verify: `pnpm --filter server test -- tests.test.ts` thoát với mã lỗi khác 0 do assertion failure (Red phase).

### Task 1.2 — Khai báo hằng số mã lỗi API
- Goal: Xuất bản mã lỗi chuẩn `ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED` để server và client dùng chung.
- Target files: `packages/api/src/contracts.ts`
- Steps:
  1. Ngay sau hằng `ASSIGNMENT_PROMPT_ERROR_CODES`, định nghĩa:
     ```ts
     /**
      * Mã 409 khóa parts của PUT /assignments/tests/:id/parts (#633). Server trả
      * kèm `code` trong body lỗi; web tra ánh xạ thông báo theo mã này.
      */
     export const ASSIGNMENT_TEST_ERROR_CODES = {
       /** Bộ đề đã có học viên làm bài (quiz_attempt) — không được thay đổi hoặc gỡ part. */
       PARTS_LOCKED: "TEST_PARTS_LOCKED",
     } as const;
     export type AssignmentTestErrorCode =
       (typeof ASSIGNMENT_TEST_ERROR_CODES)[keyof typeof ASSIGNMENT_TEST_ERROR_CODES];
     ```
- Success criteria: `ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED === "TEST_PARTS_LOCKED"` có thể import được từ `@teacher-os/api/contracts`.
- Verify: `pnpm --filter api build` hoặc `pnpm check-types` không có lỗi liên quan tới contracts.

### Task 1.3 — Triển khai kiểm tra attempt và so sánh map parts trong PUT /:id/parts
- Goal: Handler kiểm tra khác biệt và từ chối 409 khi test đã có attempt.
- Target files: `apps/server/src/routes/assignments/tests.ts`
- Steps:
  1. Import `ASSIGNMENT_TEST_ERROR_CODES` từ `@teacher-os/api/contracts` và `quizAttempt` từ `@teacher-os/db/schema/quiz-attempt`.
  2. Trong `routes.put("/:id/parts", ...)`, sau bước validate slot và prompt hợp lệ:
     - Lấy danh sách part hiện có từ DB:
       ```ts
       const existingParts = await db
         .select({
           part: assignmentTestPart.part,
           promptId: assignmentTestPart.promptId,
           qStartOverride: assignmentTestPart.qStartOverride,
         })
         .from(assignmentTestPart)
         .where(eq(assignmentTestPart.testId, testId));
       ```
     - Xây dựng hai map so sánh theo `part`:
       Map hiện tại: `part -> { promptId, qStartOverride: qStartOverride ?? null }`
       Map mới: `part -> { promptId, qStartOverride: item.qStartOverride ?? null }`
     - Xác định `hasChange`:
       Nếu kích thước 2 map khác nhau, hoặc có bất kỳ part nào khác `promptId` hoặc khác `qStartOverride` -> `hasChange = true`.
     - Nếu `!hasChange`:
       Không cần thực thi `db.batch`, trả về `c.json({ id: testId } satisfies CreatedResponse, 200)` ngay lập tức.
     - Nếu `hasChange`:
       Query kiểm tra attempt:
       ```ts
       const [attempt] = await db
         .select({ id: quizAttempt.id })
         .from(quizAttempt)
         .where(
           and(
             eq(quizAttempt.orgId, ctx.orgId),
             eq(quizAttempt.testId, testId),
           ),
         )
         .limit(1);
       if (attempt) {
         return c.json(
           {
             error: "test parts locked",
             code: ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED,
           },
           409,
         );
       }
       ```
     - Nếu không có attempt, tiếp tục thực thi `db.batch` ghi dữ liệu như hiện tại.
- Success criteria: Handler trả 409 khi có attempt và có thay đổi; trả 200 khi không có attempt hoặc không thay đổi gì.
- Verify: `pnpm --filter server test -- tests.test.ts` thoát với mã 0 (Green phase).

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
