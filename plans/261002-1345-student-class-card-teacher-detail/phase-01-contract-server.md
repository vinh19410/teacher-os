---
phase: 1
title: "Contract + server: teacher trên overview, endpoint chi tiết lớp"
status: completed
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: Contract + server

## Goal
`GET /api/student/overview` trả thêm `teacher` cho mỗi lớp. Endpoint mới `GET /api/student/classes/:classId` trả chi tiết lớp (lớp, buổi học của học viên, bài tập của lớp) và chỉ trả cho học viên có enrollment `active` trong lớp đó.

## Bối cảnh
- Contract: `packages/api/src/contracts.ts`. `studentClassSchema` ở `:1594`, `studentAssignmentSchema` ở `:1625`, `studentOverviewSchema` ở `:1637`.
- Route: `apps/server/src/routes/student.ts`.
  - `requireStudent` được gắn bằng `router.use(...)` ở `:550-563`.
  - Overview ở `:596-728`, gồm query enrollment rồi `nextSession` theo từng lớp, tiếp theo là `class_assignment` targets và grading.
- Giáo viên: `membership` (`packages/db/src/schema/membership.ts`) với `role = "teacher"` join `user` (`name`, `email`, `image`). Org được bootstrap với đúng 1 membership giáo viên (`apps/server/src/app.ts:84-93`).
- `lesson.day`: Monday = 1 (convention trong `apps/web/src/lib/class-sessions*.test.ts`).
- Test server: `apps/server/src/student.test.ts`. Test này đã seed `u-teacher` / `mem-teacher` cho `org-1`, cùng `class-1` (active) và `class-inv` (invited).

## Files to Create / Modify
- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/student.ts`
- Create (chỉ khi `student.ts` vượt khoảng 1400 dòng sau khi sửa): `apps/server/src/routes/student-class.ts` chứa các helper bên dưới
- Modify: `apps/server/src/student.test.ts`

## Tasks & Steps

### 1.1 Contract
- [x] Thêm ngay trước `studentClassSchema`:
  ```ts
  /** Giáo viên phụ trách lớp = giáo viên sở hữu org (membership role 'teacher' sớm nhất). */
  export const studentTeacherSchema = z.object({
  	name: z.string(),
  	email: z.string(),
  	image: z.string().nullable().catch(null),
  });
  export type StudentTeacher = z.infer<typeof studentTeacherSchema>;
  ```
- [x] `studentClassSchema` thêm `teacher: studentTeacherSchema.nullable().catch(null)`, kèm docblock một dòng: null nghĩa là org không có membership giáo viên, còn `.catch` để tương thích server cũ.
- [x] Thêm sau `studentOverviewSchema`:
  ```ts
  export const studentClassLessonSchema = z.object({
  	id: z.string(),
  	/** yyyy-mm-dd; null = lớp legacy (null theo cả lớp). */
  	date: z.string().nullable(),
  	/** Thứ trong tuần, Monday = 1. */
  	day: z.number().int(),
  	time: z.string(),
  	dur: z.number().int(),
  	status: z.string(),
  	topic: z.string(),
  });
  export const studentClassDetailSchema = z.object({
  	class: studentClassSchema.extend({ startDate: z.string() }),
  	lessons: z.array(studentClassLessonSchema),
  	assignments: z.array(studentAssignmentSchema),
  });
  ```
  Export type `StudentClassLesson` và `StudentClassDetail`.

### 1.2 Helper dùng chung (server)
Mục tiêu là overview và detail cùng gọi một nguồn, nên không có hai bản logic map lớp và map bài tập.
- [x] `loadOrgTeacher(db, orgId): Promise<StudentTeacher | null>`:
  - `select user.name, user.email, user.image from membership inner join user on membership.userId = user.id where membership.orgId = ? and membership.role = 'teacher' order by membership.createdAt asc, membership.id asc limit 1`.
  - Comment ghi giả định: mỗi org có 1 giáo viên, nên khi có giáo viên theo lớp thì chuyển sang cột trên `class`.
- [x] `loadNextSession(db, orgId, classId, todayISO)`: chuyển nguyên khối query `nextSessions` của overview sang, giữ nguyên hành vi.
- [x] `toStudentClass(row, nextSession, teacher)`: chuyển nguyên phần map trong overview (`formatSchedule`, cast `enrollmentStatus`) sang và thêm `teacher`.
- [x] `loadClassAssignmentItems(db, orgId, studentId, classId?)`:
  - Chuyển nguyên query `targetRows` cùng phần map `classAssignmentItems`.
  - Khi có `classId` thì thêm `eq(classAssignment.classId, classId)` vào `where`.
- [x] Overview: gọi `loadOrgTeacher` **một lần** trước `Promise.all`, rồi dùng các helper trên. Không đổi thứ tự lớp hay bài tập, không đổi field nào khác.

### 1.3 Endpoint `GET /classes/:classId`
- [x] Đăng ký `router.use("/classes/:classId", requireStudent);` cạnh các `router.use` khác ở `:550-553`. Không cần `quizWriteGuard` vì đây là GET.
- [x] Handler:
  1. Lấy `{ student: s, orgId }` từ `studentCtx`.
  2. Query lớp: `enrollment inner join class` với các cột như overview, thêm `classTable.startDate` và `enrollment.id`. Điều kiện: `enrollment.orgId = orgId`, `enrollment.studentId = s.id`, `enrollment.classId = :classId`, `enrollment.status = 'active'`. Không có row thì trả `c.json({ error: "class not found" }, 404)`.
  3. Chạy song song (`Promise.all`) bốn việc: `loadOrgTeacher`, `loadNextSession`, lessons và `loadClassAssignmentItems(db, orgId, s.id, classId)`.
  4. Lessons: `select id, date, day, time, dur, status, topic from lesson where orgId = orgId and enrollmentId = <enrollment.id> order by date asc, day asc, time asc`. `date` null theo cả lớp nên không cần xử lý NULLS LAST.
  5. Trả JSON `StudentClassDetail`. Type response bằng `satisfies StudentClassDetail` hoặc annotate như overview.

### 1.4 Test server (`apps/server/src/student.test.ts`)
- [x] Overview: `classes[0].teacher` bằng `{ name: "Teacher One", email: "teacher@test.local", image: null }` (seed sẵn). Lớp thuộc `org-2` (org không có membership giáo viên) có `teacher === null`. Nếu fixture chưa có lớp nào ở `org-2` thì seed thêm.
- [x] `describe("GET /api/student/classes/:classId")`:
  - 200 cho `class-1`. Assert `class.id`, `class.startDate`, `class.teacher.name`. `lessons` chỉ chứa lesson của enrollment học viên, đúng thứ tự. Seed thêm một lesson của học viên khác cùng lớp và assert nó không có mặt. `assignments` chỉ chứa bài có `classId === "class-1"` và không có bài grading.
  - 404 cho `class-inv` (enrollment invited).
  - 404 cho lớp của `org-2` hoặc lớp học viên không ghi danh (IDOR).
  - 404 cho id không tồn tại.
  - 401 khi không có session (theo pattern test 401 sẵn có trong file).
- [x] Các test overview hiện có (`(a)`, `(k)`, enrollment) phải giữ nguyên xanh, không sửa expectation cũ.

## Validation
- `pnpm --filter server test -- student.test.ts`, sau đó `pnpm --filter server test`.
- `pnpm check-types`.

## Risks / Rollback
- Refactor overview sang helper có thể làm lệch thứ tự hoặc field. Test `(a)` và `(k)` khoá hành vi này, nên phải chạy trước khi viết endpoint mới.
- Rollback: revert commit. Không có migration DB.
