# Phase 1: API Contracts và Backend Endpoint

## Goal
Bổ sung schema `studentScheduleLessonSchema` và `studentScheduleResponseSchema` vào `@teacher-os/api/contracts`, triển khai endpoint `GET /api/student/schedule` trong `apps/server/src/routes/student.ts`, và viết integration tests đảm bảo bảo mật IDOR và tính đúng đắn của dữ liệu.

## Target files and symbols
- `packages/api/src/contracts.ts`:
  - `studentScheduleLessonSchema`
  - `StudentScheduleLesson`
  - `studentScheduleResponseSchema`
  - `StudentScheduleResponse`
- `apps/server/src/routes/student.ts`:
  - `router.use("/schedule", requireStudent)` và `router.use("/schedule/*", requireStudent)`
  - Thêm router handler `GET /api/student/schedule`
- `apps/server/src/routes/student-schedule.test.ts`:
  - Test suite mới độc lập hoặc mở rộng từ pattern `student.test.ts` bao phủ 6 trường hợp: 401 unauthenticated, 200 empty, IDOR org/student isolation, cùng lớp khác học viên (không rò rỉ trạng thái `absent`), loại trừ invited enrollment, và sắp xếp theo ngày giờ (dated trước, undated sau).

## Tasks & Steps

### Task 1.1 — Bổ sung API Contracts
- Goal: Định nghĩa kiểu dữ liệu và Zod schema cho endpoint lịch học học viên trong package dùng chung `@teacher-os/api`.
- Target files: `packages/api/src/contracts.ts`
- Steps:
  1. Trong `packages/api/src/contracts.ts`, ngay sau `studentClassLessonSchema`, xuất thêm:
     ```ts
     export const studentScheduleLessonSchema = studentClassLessonSchema.extend({
       classId: z.string(),
       className: z.string(),
     });
     export type StudentScheduleLesson = z.infer<typeof studentScheduleLessonSchema>;

     export const studentScheduleResponseSchema = z.object({
       classes: z.array(studentClassSchema),
       lessons: z.array(studentScheduleLessonSchema),
     });
     export type StudentScheduleResponse = z.infer<typeof studentScheduleResponseSchema>;
     ```
  2. Đảm bảo types được export rõ ràng cho các workspace packages khác import.
- Success criteria: `pnpm --filter @teacher-os/api check-types` exits 0.
- Verify: `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 1.2 — Triển khai Server Endpoint GET /api/student/schedule
- Goal: Tạo handler cho `GET /api/student/schedule` trong server trả về danh sách lớp và bài học gộp của chính học viên trong org hiện tại, đảm bảo không rò rỉ enrollmentId hay dữ liệu của bạn cùng lớp.
- Target files: `apps/server/src/routes/student.ts`
- Steps:
  1. Thêm middleware bảo vệ `router.use("/schedule", requireStudent);` và `router.use("/schedule/*", requireStudent);`.
  2. Thêm route handler `router.get("/schedule", async (c) => { ... })`:
     - Lấy `studentCtx`: `{ student: s, orgId }`.
     - Lấy `db = deps.getDb()`.
     - Lấy danh sách các lớp mà học viên có `enrollment.status = 'active'` trong `orgId`:
       ```ts
       const classRows = await db
         .select(studentClassColumns)
         .from(enrollment)
         .innerJoin(classTable, eq(enrollment.classId, classTable.id))
         .where(
           and(
             eq(enrollment.orgId, orgId),
             eq(enrollment.studentId, s.id),
             eq(enrollment.status, "active"),
           ),
         );
       ```
     - Nếu `classRows.length === 0`: trả về `c.json({ classes: [], lessons: [] }, 200)`.
     - Nạp `teacher` một lần duy nhất bằng `await loadOrgTeacher(db, orgId)`.
     - Lấy `now = new Date()`.
     - Lấy `nextSession` cho từng lớp: `await Promise.all(classRows.map(r => loadNextSession(db, orgId, r.id, now)))`.
     - Xây dựng `classes: StudentClass[] = classRows.map((r, i) => toStudentClass(r, nextSessions[i], teacher))`.
     - Lấy danh sách bài học thuộc các active enrollment của học viên:
       ```ts
       const lessonRows = await db
         .select({
           id: lesson.id,
           classId: lesson.classId,
           className: classTable.name,
           enrollmentId: lesson.enrollmentId,
           date: lesson.date,
           day: lesson.day,
           time: lesson.time,
           dur: lesson.dur,
           status: lesson.status,
           topic: lesson.topic,
         })
         .from(lesson)
         .innerJoin(enrollment, eq(lesson.enrollmentId, enrollment.id))
         .innerJoin(classTable, eq(lesson.classId, classTable.id))
         .where(
           and(
             eq(lesson.orgId, orgId),
             eq(enrollment.studentId, s.id),
             eq(enrollment.status, "active"),
           ),
         );
       ```
     - Xử lý sắp xếp và chuẩn hóa dữ liệu:
       - Gom `lessonRows` theo từng lớp (`classId`).
       - Với mỗi lớp: chạy qua `orderStudentLessons` để lớp legacy được xếp đúng thứ tự heuristic.
       - Tách các bài học có `date != null` và bài học legacy có `date == null`.
       - Các bài học có ngày: sắp xếp toàn cục theo `(date ASC, time ASC, classId ASC, id ASC)`.
       - Các bài học không có ngày (legacy): ghép nối tiếp sau các bài học có ngày theo thứ tự lớp.
       - Loại bỏ trường `enrollmentId` khỏi mỗi item trước khi trả về để khớp chuẩn `StudentScheduleLesson`.
     - Trả về JSON theo `studentScheduleResponseSchema`.
- Success criteria: Endpoint biên dịch thành công và tuân thủ schema contract.
- Verify: `pnpm --filter server check-types` exits 0.

### Task 1.3 — Viết Integration Tests cho Server Endpoint
- Goal: Viết bộ test suite kiểm tra toàn diện endpoint `GET /api/student/schedule` trong `apps/server/src/routes/student-schedule.test.ts`.
- Target files: `apps/server/src/routes/student-schedule.test.ts`
- Steps:
  1. Tạo file test `apps/server/src/routes/student-schedule.test.ts`, áp dụng fixture `setupIntegration` / `createTestApp` tương tự như `student.test.ts`.
  2. Test 1 (401): Gọi không có session token / cookie trả về HTTP 401.
  3. Test 2 (200 rỗng): Học viên chưa tham gia lớp nào trả về HTTP 200 với `{ classes: [], lessons: [] }`.
  4. Test 3 (Sắp xếp thời gian): Học viên có 2 lớp active với các buổi xen kẽ, các buổi có ngày được sắp xếp toàn cục tăng dần theo `date` và `time`.
  5. Test 4 (Loại trừ invited): Lớp ở trạng thái `enrollment.status = 'invited'` không xuất hiện trong `classes` và bài học của lớp đó không có trong `lessons`.
  6. Test 5 (IDOR isolation): Bài học của học viên khác hoặc org khác không bao giờ bị trả về. Đặc biệt: học viên B trong cùng lớp A có trạng thái điểm danh `absent` trên buổi học không làm ảnh hưởng hay rò rỉ sang học viên A.
  7. Test 6 (Lớp legacy): Lớp có bài học `date: null` được xử lý an toàn, xuất hiện ở cuối danh sách mà không gây lỗi runtime.
- Success criteria: Toàn bộ 6 test cases pass 100%.
- Verify: `pnpm --filter server test src/routes/student-schedule.test.ts` exits 0.

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
