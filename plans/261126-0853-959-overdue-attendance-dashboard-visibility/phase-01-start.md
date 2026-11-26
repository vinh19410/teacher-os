---
phase: 1
title: "Phase 1: Contracts, Shared Overdue Query & Server API (TDD)"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Contracts, Shared Overdue Query & Server API (TDD)

## Goal

Mở rộng contract nhắc việc điểm danh (`dashboardRemindersResponseSchema` an toàn deploy-skew 2 chiều qua opt-in `?v=2`), thêm contract & endpoint chuyên biệt `GET /api/attendance/overdue` dùng chung helper 4-bảng cô lập `orgId` với `computeReminders`, truy vấn Bước 2 theo lô 25 cặp `(classId, date)` ăn trực tiếp `lesson_class_date_idx` kèm guard TOCTOU để lưu điểm danh quá khứ không bao giờ gặp `422 incomplete-roster`.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts`
- Modify: `packages/api/src/attendance.test.ts`
- Modify: `apps/server/src/routes/dashboard-reminders.ts`
- Modify: `apps/server/src/routes/dashboard-reminders.test.ts`
- Modify: `apps/server/src/routes/daily-attendance.ts`
- Modify: `apps/server/src/routes/daily-attendance.test.ts`

## Tasks & Steps

### Task 1.1 — Viết test đỏ (TDD Red) cho contract `overdueAttendanceResponseSchema` và field mở rộng trên `dashboardRemindersResponseSchema`
- **Goal:** Định nghĩa trước bằng test thất bại mọi bất biến schema cho reminders có `today`/`overdue`/`items[].date` và response của `GET /api/attendance/overdue`.
- **Target files and symbols:** `packages/api/src/attendance.test.ts` (import `dashboardRemindersResponseSchema`, `overdueAttendanceResponseSchema` từ `./contracts`).
- **Steps:**
  1. Mở `packages/api/src/attendance.test.ts`, thêm describe block cho `dashboardRemindersResponseSchema` kiểm:
     - chấp nhận payload v2 có `attendance.today`, `attendance.overdue`, `items[i].date` (`"2026-10-20"`);
     - chấp nhận payload v1 không có `today`, `overdue`, `items[i].date` (backward-compatible cho deploy skew & legacy item);
     - từ chối `items[i].date` sai định dạng (`"20-10-2026"`), `overdue < 0`, hoặc field lạ (`.strict()`).
  2. Thêm describe block cho `overdueAttendanceResponseSchema` kiểm:
     - parse thành công `{ today: "2026-10-26", totalCount: 2, hasMore: false, sessions: [...] }` với `mode: "dated"`, `recorded: false`, `date: "2026-10-24"`, `students` có ít nhất 1 phần tử và `lessonId` là chuỗi non-empty;
     - từ chối `students: []` (`.min(1)`), `mode: "legacy"`, `recorded: true`, `students[].lessonId: null`, `date` sai định dạng, hoặc field thừa (`.strict()`).
     <!-- Updated: Validation Session 1 - thêm kiểm `.min(1)` cho `overdueAttendanceSessionSchema.students` (Red-Team #6) -->
- **Success criteria:** Test mới biên dịch/chạy và thất bại vì `overdueAttendanceResponseSchema` và các field mới chưa tồn tại trong `packages/api/src/contracts.ts`.
- **Verify:** `pnpm --filter @teacher-os/api test src/attendance.test.ts` exits non-zero (lỗi export thiếu / assertion failure; pass trước khi sửa `contracts.ts` là thất bại).

### Task 1.2 — Cập nhật `packages/api/src/contracts.ts` để test contract chuyển xanh (TDD Green)
- **Goal:** Hiện thực chính xác các schema contract trong `@teacher-os/api/contracts` mà không làm vỡ `dailyAttendanceResponseSchema`.
- **Target files and symbols:** `packages/api/src/contracts.ts` (`dashboardReminderItemSchema` lines 3081-3089, `dashboardRemindersResponseSchema` lines 3095-3122, thêm `overdueAttendanceSessionSchema`, `OverdueAttendanceSession`, `overdueAttendanceResponseSchema`, `OverdueAttendanceResponse`).
- **Steps:**
  1. Tại `dashboardReminderItemSchema` (`packages/api/src/contracts.ts:3081-3089`), thêm `date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`. Giữ `.strict()`.
  2. Tại `dashboardRemindersResponseSchema.attendance` (`packages/api/src/contracts.ts:3098-3103`), thêm `today: z.number().int().min(0).optional()` và `overdue: z.number().int().min(0).optional()`. Giữ `.strict()`.
  3. Ngay sau `dailyAttendanceResponseSchema` (`packages/api/src/contracts.ts:1742`), định nghĩa và export:
     - `overdueAttendanceSessionSchema` (`.strict()`): `{ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), classId: z.string().min(1), className: z.string(), time: z.string(), dur: z.number().int().min(1), mode: z.literal("dated"), recorded: z.literal(false), students: z.array(z.object({ lessonId: z.string().min(1), studentId: z.string().min(1), studentName: z.string(), attendance: attendanceStatusSchema.nullable(), note: z.string() }).strict()).min(1) }`.
     <!-- Updated: Validation Session 1 - bổ sung `.min(1)` trên `students` (Red-Team #6) -->
     - `overdueAttendanceResponseSchema` (`.strict()`): `{ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), totalCount: z.number().int().min(0), hasMore: z.boolean(), sessions: z.array(overdueAttendanceSessionSchema) }`.
     - Export types `OverdueAttendanceSession` và `OverdueAttendanceResponse`.
  4. Không sửa bất kỳ field nào của `dailyAttendanceResponseSchema` (`packages/api/src/contracts.ts:1705-1739`).
- **Success criteria:** Toàn bộ test cũ và mới trong `@teacher-os/api` pass.
- **Verify:** `pnpm --filter @teacher-os/api test` exits 0 và in `passed`.

### Task 1.3 — Viết test đỏ (TDD Red) cho `computeReminders` (overdue + today + `?v=2`) và `computeOverdueAttendance` / `GET /api/attendance/overdue`
- **Goal:** Đóng chốt hành vi server bằng test thất bại trước khi sửa logic truy vấn, bảo đảm test cô lập sạch DB.
- **Target files and symbols:**
  - `apps/server/src/routes/dashboard-reminders.test.ts` (`computeReminders — attendance`, `computeReminders — ReminderScope`, `GET /api/dashboard/reminders`, describe mới `computeReminders — overdue attendance`)
  - `apps/server/src/routes/daily-attendance.test.ts` (describe mới `computeOverdueAttendance — GET /api/attendance/overdue`)
- **Steps:**
  1. Trong `apps/server/src/routes/dashboard-reminders.test.ts`:
     - Cập nhật 2 assertion `toEqual` hiện có (`lines 263-267` và `lines 528-530`) để kỳ vọng `date: today` trên item `class-dated` (giữ `class-legacy` không có field `date`).
     - Thêm một block `describe("computeReminders — overdue attendance", ...)` **dùng in-memory `db` tạo mới trong `beforeEach`** (KHÔNG dùng chung `db` từ `beforeAll` để tránh làm bẩn `"org-1"` của các block phía sau).
     <!-- Updated: Validation Session 1 - cô lập DB bằng `beforeEach` trong `dashboard-reminders.test.ts` (Red-Team #10) -->
     - Trong describe cô lập đó, viết test kiểm:
       - 6 buổi quá khứ (`date < today`, `status = "upcoming"`) và 0 buổi hôm nay → `attendance.pending === 6`, `attendance.today === 0`, `attendance.overdue === 6`, `items` dài 3 sắp `date DESC, time ASC`, mỗi item có `date` đúng ISO.
       - 1 ca hôm nay + 4 ca quá hạn → `pending === 5`, `today === 1`, `overdue === 4`, `items[0]` là ca hôm nay, `items[1..2]` là 2 ca quá hạn mới nhất.
       - Loại trừ đúng: buổi quá khứ `completed`/`absent`/`cancelled`/`holiday`, lớp `paused`, enrollment không `active`, `student` thuộc org khác (IDOR), `date: ""` (chuỗi rỗng) hoặc `date: "2026-02-30"` (sai lịch), org khác; lớp `legacy` (`date: null`) chỉ đếm `today` theo thứ, không vào `overdue`.
       - Ca quá hạn điểm danh dở dang (1 HV `completed`, 1 HV `upcoming`) vẫn đếm `overdue` tăng 1.
       - Scope `assigned` với 65 `classIds` (vượt `D1_IN_ARRAY_CHUNK = 50`) chạy an toàn cho cả `attendance` lẫn `overdueGrading`; `classIds: []` trả `pending: 0, today: 0, overdue: 0, items: []`.
       <!-- Updated: Validation Session 1 - thêm test 65 classIds cho `computeReminders` gồm cả `overdueGrading` (Red-Team #9) -->
     - Trong `describe("GET /api/dashboard/reminders")`: thêm test kiểm opt-in deploy-skew 2 chiều:
       - `GET /api/dashboard/reminders` (không có `?v=2`) trả `200` với `attendance.pending` đã gồm quá hạn nhưng **không** chứa key `"today"`, `"overdue"` trên `attendance` và **không** chứa key `"date"` trên bất kỳ phần tử nào của `attendance.items` (tương thích tuyệt đối schema `.strict()` cũ);
       - `GET /api/dashboard/reminders?v=2` trả `200` đầy đủ `today`, `overdue`, `items[].date` khớp `dashboardRemindersResponseSchema`.
       <!-- Updated: Validation Session 1 - thêm test HTTP `?v=2` vs v1 legacy shape (Red-Team #3) -->
  2. Trong `apps/server/src/routes/daily-attendance.test.ts`:
     - Import `computeOverdueAttendance` từ `./daily-attendance`.
     - Thêm describe `computeOverdueAttendance — GET /api/attendance/overdue` kiểm:
       - Trả đúng 6 ca quá hạn sắp `date DESC, time ASC, className ASC ("vi")`, `totalCount === 6`, `hasMore === false`, `today === vietnamTodayISO(now)`.
       - Ca quá hạn điểm danh dở dang (1 HV `completed`, 1 HV `upcoming`) trả đủ cả 2 HV (`attendance: "present"` và `attendance: null`), gửi `PUT /api/classes/:id/sessions/:date/attendance` với đủ 2 `lessonId` trả `200`, sau đó cả `computeOverdueAttendance` và `computeReminders` giảm đúng 1.
       - Loại trừ đúng: buổi hôm nay (`date === today`), tương lai (`date > today`), `cancelled`, `holiday`, ca đã hoàn tất toàn bộ (`completed`/`absent`), lớp `paused`, enrollment không `active`, `student` khác `orgId`, lớp `legacy` (`date: null`), `date: ""`, `date: "2026-02-30"`, org khác.
       - Quy ước `?limit=` duy nhất: vắng mặt hoặc `?limit=` rỗng → mặc định `50`; `?limit=2` khi có 4 ca → `totalCount === 4`, `hasMore === true`, `sessions.length === 2`; `?limit=200` → clamp về `100` (200 OK); `?limit=0`, `?limit=-1`, `?limit=5abc`, `?limit=1.5`, `?limit=1e2` → `400 { error: "invalid limit", reason: "invalid-limit" }`.
       <!-- Updated: Validation Session 1 - chốt 1 quy ước `?limit=` nghiêm ngặt (Red-Team #9) -->
       - Hỗ trợ `scope: { kind: "assigned", classIds }` với 65 `classIds` (vượt `D1_IN_ARRAY_CHUNK = 50`).
       - HTTP endpoint `GET /api/attendance/overdue`: `401` khi chưa đăng nhập, `403 ACCOUNT_STUDENT_ROLE` cho student, `403 ACCOUNT_ADMIN_ROLE` cho admin, cô lập cross-org (teacher `org-1` không thấy ca quá hạn của `org-2`), `200` khớp `overdueAttendanceResponseSchema` cho teacher (hỗ trợ `deps.now` deterministic).
       <!-- Updated: Validation Session 1 - bổ sung HTTP 403 admin + cross-org IDOR + `deps.now` (Red-Team #4, #9) -->
- **Success criteria:** Các test mới chạy và fail (red) do server chưa triển khai logic quá hạn và route `/overdue`.
- **Verify:** `pnpm --filter server test src/routes/dashboard-reminders.test.ts src/routes/daily-attendance.test.ts` exits non-zero với lỗi assertion / missing export `computeOverdueAttendance`.

### Task 1.4 — Cài đặt shared overdue query helper, cập nhật `computeReminders` (`?v=2`) và thêm `GET /api/attendance/overdue` (TDD Green)
- **Goal:** Đưa toàn bộ test server & API lên xanh, bảo đảm 1 nguồn chân lý duy nhất cho predicate quá hạn 4-bảng cô lập `orgId`, tối ưu đọc D1 theo cặp `(classId, date)` và an toàn TOCTOU + deploy skew.
- **Target files and symbols:**
  - `apps/server/src/routes/dashboard-reminders.ts` (export `D1_IN_ARRAY_CHUNK`, `OverdueAttendanceBucket`, `queryOverdueAttendanceBuckets`, cập nhật `computeReminders`, cập nhật `dashboardReminderRoutes`)
  - `apps/server/src/routes/daily-attendance.ts` (export `DEFAULT_OVERDUE_LIMIT`, `MAX_OVERDUE_LIMIT`, `computeOverdueAttendance`, cập nhật `dailyAttendanceRoutes`)
- **Steps:**
  1. Trong `apps/server/src/routes/dashboard-reminders.ts`:
     - Import `parseStartDateStrict` từ `@teacher-os/api/skeleton` và `student` từ `@teacher-os/db/schema/index`.
     - Export `D1_IN_ARRAY_CHUNK = 50`.
     - Tạo helper 4-bảng dùng chung (có chunk `D1_IN_ARRAY_CHUNK = 50` khi `scope.kind === "assigned"`):
       - Join đầy đủ 4 bảng với predicate cô lập `orgId` ở mọi join:
         - `classTable`: `and(eq(classTable.id, lesson.classId), eq(classTable.orgId, orgId))`
         - `enrollment`: `and(eq(enrollment.id, lesson.enrollmentId), eq(enrollment.classId, lesson.classId), eq(enrollment.orgId, orgId), eq(enrollment.status, "active"))`
         - `student`: `and(eq(student.id, enrollment.studentId), eq(student.orgId, orgId))`
       - Select bao gồm `lessonId: lesson.id`, `classId: lesson.classId`, `className: classTable.name`, `time: lesson.time`, `dur: lesson.dur`, `date: lesson.date`.
       <!-- Updated: Validation Session 1 - bổ sung 4-table `orgId` join và `lessonId: lesson.id` trong `.select()` (Red-Team #4, #9) -->
       - Điều kiện `where`: `eq(lesson.orgId, orgId)`, `eq(classTable.status, "active")`, `eq(lesson.status, "upcoming")`, và:
         - nhánh reminders: `or(and(isNotNull(lesson.date), ne(lesson.date, ""), lte(lesson.date, today)), and(isNull(lesson.date), eq(lesson.day, todayWeekday)))`;
         - nhánh overdue-only (`queryOverdueAttendanceBuckets`): `and(isNotNull(lesson.date), ne(lesson.date, ""), lt(lesson.date, today))`.
     - Ở tầng JS, mọi dòng có `row.date !== null` PHẢI kiểm `parseStartDateStrict(row.date) !== null`.
     - Gom bucket `dated` theo `(classId, date)` (sort theo `time ASC || lessonId ASC` rồi lấy đại diện đầu tiên khớp `daily-attendance.ts:220-225`) và `legacy` theo `(classId, time)`.
     - Export `queryOverdueAttendanceBuckets(db, orgId, scope, todayISO)` trả danh sách `{ classId, className, date, time, dur }` đã sắp `date DESC, time ASC, className ASC ("vi")`.
     - Trong `computeReminders`:
       - Tách `todayGroups` (`date === today` hoặc `legacy`) và `overdueGroups` (`date !== null && date < today`).
       - Sắp `todayGroups` theo `time ASC, className ASC ("vi")`; sắp `overdueGroups` theo `date DESC, time ASC, className ASC ("vi")`.
       - `items = [...todayItems, ...overdueItems].slice(0, ATTENDANCE_PREVIEW_LIMIT)` (`dated` gắn `date`, `legacy` bỏ `date`).
       - Chunk `inArray(classAssignment.classId, scope.classIds)` tại `dashboard-reminders.ts:195-197` theo `D1_IN_ARRAY_CHUNK = 50` để an toàn trần bind param D1.
       <!-- Updated: Validation Session 1 - chunk D1 cho `assignmentRows` (Red-Team #9) -->
       - Trả `attendance: { pending: todayGroups.length + overdueGroups.length, today: todayGroups.length, overdue: overdueGroups.length, items }` (và cho `emptyScope`: `{ pending: 0, today: 0, overdue: 0, items: [] }`).
     - Trong `dashboardReminderRoutes(deps: { getDb(): Db; now?: () => Date })`:
       - Dùng `const now = deps.now ? deps.now() : new Date();`.
       - Nếu `c.req.query("v") === "2"`: trả `c.json(dashboardRemindersResponseSchema.parse(data))`.
       - Ngược lại (tương thích client `.strict()` cũ khi server deploy trước web): lược bỏ `today`, `overdue` và `item.date`:
         ```ts
         const legacyResponse = dashboardRemindersResponseSchema.parse({
           ...data,
           attendance: {
             pending: data.attendance.pending,
             items: data.attendance.items.map(({ classId, className, time, dur }) => ({
               classId,
               className,
               time,
               dur,
             })),
           },
         });
         return c.json(legacyResponse);
         ```
       <!-- Updated: Validation Session 1 - opt-in `?v=2` bảo vệ `.strict()` deploy-skew 2 chiều + `deps.now` (Red-Team #3, #9) -->
  2. Trong `apps/server/src/routes/daily-attendance.ts`:
     - Export `DEFAULT_OVERDUE_LIMIT = 50`, `MAX_OVERDUE_LIMIT = 100`. Định nghĩa `OVERDUE_BUCKET_BATCH = 25` (25 cặp × 2 bind params = 50 params/query, an toàn dưới trần D1).
     - Implement `computeOverdueAttendance(db, orgId, scope, now = new Date(), limit = DEFAULT_OVERDUE_LIMIT)`:
       - Sanitize `safeLimit = Number.isFinite(limit) ? Math.min(MAX_OVERDUE_LIMIT, Math.max(1, Math.floor(limit))) : DEFAULT_OVERDUE_LIMIT`.
       - Tính `today = vietnamTodayISO(now)`. Nếu `scope.kind === "assigned" && scope.classIds.length === 0`, trả `{ today, totalCount: 0, hasMore: false, sessions: [] }`.
       - **Bước 1:** Gọi `queryOverdueAttendanceBuckets(db, orgId, scope, today)`. Tính `rawTotalCount = buckets.length`, cắt lát `pageBuckets = buckets.slice(0, safeLimit)`. Nếu `pageBuckets.length === 0`, trả `{ today, totalCount: 0, hasMore: false, sessions: [] }`.
       - **Bước 2 (point-lookup theo cặp `(classId, date)` ăn vào `lesson_class_date_idx`):** Chia `pageBuckets` thành từng lô `OVERDUE_BUCKET_BATCH = 25`. Với mỗi lô, truy vấn đủ 4 bảng có đủ predicate `orgId` (`lesson.orgId = orgId`, `classTable.orgId = orgId`, `classTable.status = "active"`, `enrollment.orgId = orgId`, `enrollment.classId = lesson.classId`, `enrollment.status = "active"`, `student.orgId = orgId`), cộng `ne(lesson.status, "cancelled")`, `ne(lesson.status, "holiday")`, và `or(...batch.map((b) => and(eq(lesson.classId, b.classId), eq(lesson.date, b.date))))`. Sau đó vẫn cho qua `excludeNonTeachingSessions`.
       <!-- Updated: Validation Session 1 - batch 25 cặp `(classId, date)` + 4-table `orgId` join + SQL exclude `cancelled`/`holiday` (Red-Team #4, #5) -->
       - **Guard TOCTOU:** Nhóm rows Bước 2 theo `${row.classId}\u0000${row.date}`. Khi duyệt `pageBuckets` để dựng `sessions`, bỏ qua mọi bucket có `rows.length === 0 || !rows.some((r) => r.status === "upcoming")` và tăng `dropped += 1`. Với bucket hợp lệ, sort `rows` theo `time ASC || lessonId ASC` lấy `first.time`/`first.dur`/`first.className`, map `students` qua `coerceDisplayAttendance(row.status, row.attendance)` sắp `studentName.localeCompare(..., "vi") || lessonId.localeCompare(...)`. Cuối cùng tính `totalCount = Math.max(sessions.length, rawTotalCount - dropped)` và `hasMore = totalCount > sessions.length`.
       <!-- Updated: Validation Session 1 - guard TOCTOU bỏ bucket rỗng/đã xong và hiệu chỉnh `totalCount` / `hasMore` (Red-Team #6) -->
     - Trong `dailyAttendanceRoutes(deps: { getDb(): Db; now?: () => Date })`:
       - Đồng bộ `GET /daily` dùng `resolveReminderScope(ctx.role)` và `deps.now ? deps.now() : new Date()` (không đổi hợp đồng response).
       - Thêm `routes.get("/overdue", ...)`:
         - Kiểm `ctx = c.get("kernelCtx")` (`401` nếu thiếu).
         - Parse `rawLimit = c.req.query("limit")`: nếu `rawLimit === undefined || rawLimit === ""` dùng `DEFAULT_OVERDUE_LIMIT`; nếu `!/^[1-9]\d*$/.test(rawLimit)` trả `c.json({ error: "invalid limit", reason: "invalid-limit" }, 400)`; ngược lại dùng `Math.min(Number(rawLimit), MAX_OVERDUE_LIMIT)`.
         - Gọi `computeOverdueAttendance(deps.getDb(), ctx.orgId, resolveReminderScope(ctx.role), deps.now ? deps.now() : new Date(), limit)`, parse bằng `overdueAttendanceResponseSchema.parse(data)` rồi `c.json(response)`.
       <!-- Updated: Validation Session 1 - strict regex `/^[1-9]\d*$/` cho `?limit=` + `resolveReminderScope(ctx.role)` + `deps.now` (Red-Team #9) -->
- **Success criteria:** Toàn bộ test trong `packages/api` và toàn bộ suite `apps/server` pass (bao gồm `dashboard-reminders.test.ts`, `daily-attendance.test.ts`, `events.test.ts`, `holidays.test.ts`, `class-status.test.ts`, `hybrid-assignment.test.ts`, `require-finance-role.test.ts`, `grading.test.ts`), benchmark `computeReminders` vẫn `< 200ms`.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter server test` exits 0 và toàn bộ test pass.

## Verification

- `pnpm --filter @teacher-os/api test`
- `pnpm --filter server test`
- `pnpm check-types`

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
