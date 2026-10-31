---
phase: 3
title: "Phase 3: Teacher Self Study Plan API Routes"
status: done
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Teacher Self Study Plan API Routes

## Goal

Xây dựng bộ API cho giáo viên quản lý Self Study Plan của lớp (`apps/server/src/routes/self-study-plan.ts`, mount tại `kernel.route("/", selfStudyPlanRoutes(deps))`), đảm bảo kiểm tra sở hữu `orgId` (`findOrgClass`, `findClassPlan`), role gate (`canPublishGrade` cho các route ghi, `canReviewGrade` cho route đọc), `readBody` (`415`/`400`), hỗ trợ tạo/sửa plan nháp, công bố plan với chunked `db.batch` (trần 366 ngày, ngày không có đề là `skipped`), đọc tiến độ phân trang theo khoảng ngày kèm tính trước ngày nghỉ tương lai và trạng thái nộp trễ từ `quiz_attempt.submittedAt` vs `dueAt`, đổi giờ bằng 1 câu lệnh cập nhật có điều kiện cho các ngày tương lai chưa giao, sửa đề / `holidayOverride` cho ngày tương lai chưa giao, giao lại ngày `missed`, và huỷ plan. <!-- Updated: Red Team RT-4, RT-5 -->

## Files to Create / Modify

- Create: `apps/server/src/routes/self-study-plan.ts`
- Create: `apps/server/src/routes/self-study-plan.test.ts`
- Modify: `apps/server/src/routes/kernel.ts`

## Tasks & Steps

### Task 3.1 — Viết integration test TDD (Red) cho các endpoint Self Study Plan

- **Goal:** Tạo `apps/server/src/routes/self-study-plan.test.ts` kiểm tra toàn bộ vòng đời API, bảo mật phân quyền / cô lập org và các biên trạng thái của Self Study Plan.
- **Target files and symbols:**
  - `apps/server/src/routes/self-study-plan.test.ts`
- **Steps:**
  1. Tạo `apps/server/src/routes/self-study-plan.test.ts` kiểm tra:
     - Tạo plan nháp (`POST /api/classes/:classId/self-study-plan`) với giờ mặc định `06:00`-`17:00`, chỉ chấp nhận đề ngân hàng thuộc `ctx.orgId` có `status = 'ready'`, từ chối đề `draft` hoặc đề của org khác, từ chối khoảng ngày `> 366` ngày hoặc `dueTime <= releaseTime` hoặc quá `MAX_SELF_STUDY_ITEMS_PER_DAY` đề/ngày.
     - Công bố plan (`POST /api/classes/:classId/self-study-plan/:planId/publish`): từ chối nếu plan không có đề nào (`400`); sinh đầy đủ các dòng `self_study_plan_day` theo chunk ($\le 8$ dòng/câu lệnh) trong một `db.batch`; ngày có đề là `pending`, ngày không có đề là `skipped`; chặn công bố plan thứ hai khi lớp đang có plan `published` (`409`).
     - Đọc màn plan có phân trang theo khoảng ngày (`GET /api/classes/:classId/self-study-plan?from=YYYY-MM-DD&to=YYYY-MM-DD`): trả về thông tin plan, danh sách ngày trong trang kèm cờ `isHoliday` / `holidayName` tính lúc đọc cho cả ngày tương lai, danh sách đề, và thống kê tiến độ nộp (đúng hạn, nộp trễ tính từ `quiz_attempt.submittedAt > dueAt`, chưa nộp/quá hạn).
     - Đổi giờ (`PATCH /api/classes/:classId/self-study-plan/:planId/hours`): cập nhật `releaseTime` / `dueTime` trên plan và tính lại `releaseAt`, `dueAt` bằng 1 câu lệnh SQL cho các ngày tương lai chưa giao (`status IN ('pending', 'skipped') AND released_at IS NULL AND date > todayVN`); các ngày hôm nay trở về trước hoặc đã `released`/`missed` giữ nguyên `releaseAt`/`dueAt`. <!-- Updated: Red Team RT-5 -->
     - Sửa ngày tương lai (`PUT /api/classes/:classId/self-study-plan/:planId/days/:date`): cho phép đổi danh sách đề `ready` (thuộc `ctx.orgId`) và bật/tắt `holidayOverride` khi `date > todayVN` và ngày chưa giao (`pending` hoặc `skipped` với `releasedAt IS NULL`), luôn tính lại `releaseAt`/`dueAt` theo giờ hiện tại của plan; từ chối (`400`) nếu `date <= todayVN`, ngày đã `released`/`missed`, hoặc xoá trắng đề của ngày `pending` cuối cùng trên plan đang `published`. <!-- Updated: Red Team RT-4, RT-5 -->
     - Giao lại ngày `missed` (`POST /api/classes/:classId/self-study-plan/:planId/days/:date/release-missed`): cho phép giáo viên chủ động giao lại ngày `missed` (kể cả khi ngày đó là ngày cuối cùng đã làm plan chuyển sang `completed`) với `dueAt` mới hợp lệ (`> now`), đồng bộ `class_assignment.due` theo ngày VN của `dueAt` mới. <!-- Updated: Red Team RT-5 -->
     - Huỷ plan (`POST /api/classes/:classId/self-study-plan/:planId/cancel`): chuyển plan sang `cancelled`, dừng các ngày chưa giao, giữ nguyên các bài đã giao trước đó, và cho phép lớp tạo/công bố plan mới.
     - Bảo mật & biên: (a) Cross-org IDOR trên `:classId` hoặc `:planId` trả `404`; (b) Role `"ta"` gọi các route ghi (`POST`/`PUT`/`PATCH`) bị chặn `403`, gọi `GET` được `200`; (c) Thiếu `Content-Type: application/json` trên `POST`/`PUT`/`PATCH` trả `415`, JSON hỏng trả `400 { error: "invalid json" }`; (d) `buildApp` không chứa route `/__e2e/self-study-tick` (`404`). <!-- Updated: Red Team RT-4 -->
- **Success criteria:** Test chạy và fail (404) vì route chưa được tạo và mount.
- **Verify:** `pnpm --filter server exec vitest run src/routes/self-study-plan.test.ts` exits non-zero (Red phase).

### Task 3.2 — Hiện thực `apps/server/src/routes/self-study-plan.ts` và mount vào `kernel.ts` (Green)

- **Goal:** Hiện thực đầy đủ router Self Study Plan và mount vào `apps/server/src/routes/kernel.ts` để toàn bộ test ở Task 3.1 xanh.
- **Target files and symbols:**
  - `apps/server/src/routes/self-study-plan.ts` (`selfStudyPlanRoutes`)
  - `apps/server/src/routes/kernel.ts` (`kernel.route("/", selfStudyPlanRoutes(deps))`)
- **Steps:**
  1. Tạo `apps/server/src/routes/self-study-plan.ts` với các helper bảo mật và validation:
     - `findOrgClass(db, classId, orgId)`: kiểm tra `and(eq(classTable.id, classId), eq(classTable.orgId, orgId))` → `404` nếu không thuộc org.
     - `findClassPlan(db, planId, classId, orgId)`: kiểm tra `and(eq(selfStudyPlan.id, planId), eq(selfStudyPlan.classId, classId), eq(selfStudyPlan.orgId, orgId))` → `404` nếu không khớp.
     - `validateReadyOrgPrompts(db, orgId, promptIds)`: kiểm tra mọi `promptId` theo chunk `D1_IN_ARRAY_CHUNK = 50` với `and(eq(assignmentPrompt.orgId, orgId), inArray(assignmentPrompt.id, slice))` đều tồn tại và có `status === "ready"`.
     - `readBody(c, schema)`: kiểm tra `Content-Type: application/json` (`415`), `try/catch await c.req.json()` (`400 { error: "invalid json" }`), và `schema.safeParse` (`400 { error: "invalid body" }`).
     - Áp role gate `canReviewGrade(ctx.role)` cho `GET` và `canPublishGrade(ctx.role)` cho tất cả `POST`/`PUT`/`PATCH` (`403 { error: "forbidden" }`). <!-- Updated: Red Team RT-4 -->
  2. Hiện thực các route dưới `/classes/:classId/self-study-plan`:
     - `GET /classes/:classId/self-study-plan`: nhận query `from`, `to` (mặc định cửa sổ 14 ngày quanh hôm nay hoặc từ `startDate`), `planId` (mặc định plan `published`, `draft`, hoặc gần nhất của lớp, kèm danh sách tóm tắt các plan của lớp). Tính lịch nghỉ hiệu lực bằng `loadExistingHolidayDates(db, ctx.orgId, [classId])` lúc đọc để hiển thị trước các ngày tương lai sẽ bị bỏ qua. Join `class_assignment` (`planItemId`), `class_assignment_target` và `quiz_attempt` (lọc `eq(quizAttempt.orgId, ctx.orgId)`) để tính tiến độ nộp đúng hạn / nộp trễ (`submittedAtMs > dueAtMs` từ `quizAttempt.submittedAt ?? target.submittedAt`) / quá hạn / đã chấm cho từng đề.
     - `POST /classes/:classId/self-study-plan`: tạo hoặc cập nhật plan `draft` cho lớp; kiểm tra `1 <= daysBetweenInclusiveISO(startDate, endDate) <= MAX_SELF_STUDY_DAYS`, `dueTime > releaseTime`, gọi `validateReadyOrgPrompts`; chèn `self_study_plan_day` ($\le 8$ dòng/câu lệnh) và `self_study_plan_item` ($\le 10$ dòng/câu lệnh) theo chunk trong `db.batch`. <!-- Updated: Red Team RT-3, RT-5 -->
     - `POST /classes/:classId/self-study-plan/:planId/publish`: yêu cầu `plan.status === 'draft'`, lớp chưa có plan `published` khác (`409`), và plan có ít nhất 1 đề `ready` (`400`); tạo mảng toàn bộ ngày từ `startDate` đến `endDate`; chia chunk `INSERT INTO self_study_plan_day` ($\le 8$ dòng/câu lệnh, ngày có đề là `pending`, ngày không có đề là `skipped`, giữ `holidayOverride` đã chọn ở nháp) cùng lệnh cập nhật `self_study_plan.status = 'published'` trong một `db.batch` duy nhất.
     - `PATCH /classes/:classId/self-study-plan/:planId/hours`: yêu cầu `plan.status` thuộc `'draft' | 'published'`, kiểm tra `dueTime > releaseTime`; cập nhật `releaseTime`, `dueTime` trên `self_study_plan` và chạy 1 câu lệnh cập nhật có điều kiện cho các ngày chưa tới (`status IN ('pending', 'skipped') AND released_at IS NULL AND date > todayVN`):
       `sql\`cast(strftime('%s', ${selfStudyPlanDay.date}) as integer) * 1000 + ${releaseOffsetMs}\``
       trong một `db.batch`. <!-- Updated: Red Team RT-5 -->
     - `PUT /classes/:classId/self-study-plan/:planId/days/:date`: yêu cầu `plan.status` thuộc `'draft' | 'published'`, `date` nằm trong `[plan.startDate, plan.endDate]`; nếu `plan.status === 'published'`, bắt buộc `date > vietnamTodayISO()`, ngày chưa giao (`status` thuộc `'pending' | 'skipped'` và `releasedAt IS NULL`), và không cho phép xoá hết đề nếu đây là ngày `pending` cuối cùng của plan `published`. Gọi `validateReadyOrgPrompts`, cập nhật `holidayOverride`, tính lại `releaseAt`/`dueAt` từ `plan.releaseTime`/`plan.dueTime`, thay thế các dòng `self_study_plan_item` của ngày đó (chunk $\le 10$ dòng/câu lệnh), và cập nhật `status` của ngày (`'pending'` nếu có đề, `'skipped'` nếu 0 đề).
     - `POST /classes/:classId/self-study-plan/:planId/days/:date/release-missed`: yêu cầu `plan.status` thuộc `'published' | 'completed'` và `day.status === 'missed'`. Tính `newDueAtMs` (mặc định `dueTime` hôm nay nếu `> now`, ngược lại `dueTime` ngày mai; từ chối `400` nếu `newDueAtMs <= now`), kiểm tra đề `ready` và học viên `active`, chèn `class_assignment` (`due = vietnamDateKeyOf(new Date(newDueAtMs))`, `dueAt = new Date(newDueAtMs)`) + `class_assignment_target` theo chunk và cập nhật `self_study_plan_day` (`WHERE id = day.id AND status = 'missed'`) trong `db.batch`, sau đó gọi `enqueueNotifications` -> set `notifiedAt` -> `deliverNotifications` (giữ nguyên `plan.status`). <!-- Updated: Red Team RT-5 -->
     - `POST /classes/:classId/self-study-plan/:planId/cancel`: yêu cầu `plan.status` thuộc `'draft' | 'published'`, chuyển `self_study_plan.status = 'cancelled'`, `cancelledAt = new Date()`.
  3. Mount `kernel.route("/", selfStudyPlanRoutes(deps))` trong `apps/server/src/routes/kernel.ts`. <!-- Updated: Red Team RT-4 -->
- **Success criteria:** Toàn bộ test trong `apps/server/src/routes/self-study-plan.test.ts` pass và `pnpm --filter server check-types` pass.
- **Verify:** `pnpm --filter server exec vitest run src/routes/self-study-plan.test.ts && pnpm --filter server check-types` exits 0.

## Verification

- `pnpm --filter server exec vitest run src/routes/self-study-plan.test.ts` exits 0.
- `pnpm --filter server test && pnpm --filter server check-types` exits 0.

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
