# Phase 1: Contracts & Server Payload

## Goal
Bổ sung trường `dueAt?: string | null` vào `studentQuizDetailSchema` và cập nhật backend endpoints trả về `dueAt` cho bài tập lớp và `dueAt: null` cho bài tự luyện, đảm bảo tương thích ngược và có test chứng minh.

## Files to Create / Modify
- `packages/api/src/contracts.ts` (symbol: `studentQuizDetailSchema`)
- `apps/server/src/routes/student.ts` (symbol: router handler `GET /assignments/:assignmentId/quiz`)
- `apps/server/src/routes/student-practice.ts` (symbol: router handler `GET /practice/:testId/quiz`)
- `packages/api/src/hybrid-writing.contracts.test.ts` (hoặc test file contract tương ứng)
- `apps/server/src/routes/student-quiz.test.ts` (test cases cho payload quiz detail)

## Tasks & Steps

### Task 1.1 — TDD Red: Viết contract test cho `studentQuizDetailSchema` với `dueAt`
- Goal: Chứng minh schema chấp nhận `dueAt` dạng ISO string, `dueAt: null`, và không có `dueAt` (optional).
- Target files: `packages/api/src/hybrid-writing.contracts.test.ts`
- Steps:
  1. Thêm test case vào `hybrid-writing.contracts.test.ts` (hoặc file contract test cho student quiz):
     - Payload 1: `due: "2026-11-10", dueAt: "2026-11-10T10:00:00.000Z"` -> parse thành công và giữ nguyên `dueAt`.
     - Payload 2: `due: "2026-11-10", dueAt: null` -> parse thành công với `dueAt: null`.
     - Payload 3: `due: "2026-11-10"` (không có `dueAt`) -> parse thành công với `dueAt: undefined`.
- Success criteria: Test fail trước khi sửa schema vì schema `.strict()` từ chối key lạ `dueAt`.
- Verify: `pnpm --filter @teacher-os/api test` fail với thông báo "Unrecognized key: dueAt" (Red state).

### Task 1.2 — TDD Green: Cập nhật `studentQuizDetailSchema` trong `packages/api`
- Goal: `studentQuizDetailSchema` chấp nhận `dueAt: z.string().nullable().optional()`.
- Target files: `packages/api/src/contracts.ts`
- Steps:
  1. Trong `packages/api/src/contracts.ts`, tại định nghĩa `studentQuizDetailSchema`, sau dòng `due: z.string(),`:
     Thêm:
     ```ts
     /** ISO datetime hạn nộp (UTC, tính từ giờ VN lúc giao); null/undefined trên dữ liệu cũ hoặc bài tự luyện (#572, #587). */
     dueAt: z.string().nullable().optional(),
     ```
- Success criteria: `studentQuizDetailSchema` parse thành công cả 3 payload.
- Verify: `pnpm --filter @teacher-os/api test` exits 0 (Green state).

### Task 1.3 — TDD Red & Green: Cập nhật endpoint server trả `dueAt`
- Goal: Endpoint `GET /api/student/assignments/:assignmentId/quiz` trả `dueAt: string | null`, và `GET /api/student/practice/:testId/quiz` trả `dueAt: null`.
- Target files:
  - `apps/server/src/routes/student.ts`
  - `apps/server/src/routes/student-practice.ts`
  - `apps/server/src/routes/student-quiz.test.ts`
- Steps:
  1. Trong `apps/server/src/routes/student.ts`, tại query `db.select`:
     Thêm `dueAt: classAssignment.dueAt` vào object select.
  2. Tại lúc khởi tạo `detail: StudentQuizDetail`:
    Thêm `dueAt: row.dueAt instanceof Date && Number.isFinite(row.dueAt.getTime()) ? row.dueAt.toISOString() : null,`.
  3. Trong `apps/server/src/routes/student-practice.ts`, tại lúc khởi tạo detail cho bài tự luyện:
     Thêm `dueAt: null,` cùng chỗ với `due: "",`.
  4. Trong `apps/server/src/routes/student-quiz.test.ts`:
     Thêm test case kiểm tra:
     - Bài tập có `dueAt` trả về đúng chuỗi ISO.
     - Bài tập không có `dueAt` (chỉ có `due`) trả về `dueAt: null`.
- Success criteria: Server trả đúng `dueAt` và các test case liên quan pass.
- Verify: `pnpm --filter server test student-quiz && pnpm --filter server test student-practice` exits 0.

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
