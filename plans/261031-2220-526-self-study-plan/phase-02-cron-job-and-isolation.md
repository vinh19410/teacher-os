---
phase: 2
title: "Phase 2: Cron Job, Notifications & Snapshot/200-Cap Isolation"
status: done
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Cron Job, Notifications & Snapshot/200-Cap Isolation

## Goal

Hiện thực hàm `runSelfStudyPlanTick` trong `apps/server/src/lib/self-study-plan.ts` (export subpath trong `apps/server/package.json`), builder sự kiện thông báo `selfStudyReleasedEvents`, nối `scheduled` handler ở `apps/server/src/index.ts` và `crons: ["*/5 * * * *"]` ở `packages/infra/alchemy.run.ts`, đồng thời lọc `isNull(classAssignment.planItemId)` khỏi giới hạn 200 bài giao tay (`kernel.ts`) và cả 3 truy vấn bài giao/target/attempt trong `loadSnapshot` (`snapshot.ts`), được kiểm chứng bằng bộ unit test đầy đủ. <!-- Updated: Red Team RT-1, RT-6 -->

## Files to Create / Modify

- Modify: `apps/server/package.json`
- Modify: `apps/server/src/lib/notifications/templates.ts`
- Create: `apps/server/src/lib/self-study-plan.ts`
- Create: `apps/server/src/lib/self-study-plan.test.ts`
- Modify: `apps/server/src/routes/holidays.ts`
- Modify: `apps/server/src/routes/kernel.ts`
- Modify: `apps/server/src/routes/snapshot.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`

## Tasks & Steps

### Task 2.1 — Viết unit test TDD (Red) cho `runSelfStudyPlanTick` và cô lập 200-cap / snapshot

- **Goal:** Tạo file `apps/server/src/lib/self-study-plan.test.ts` phủ toàn bộ các kịch bản của job định kỳ và quy tắc cô lập dữ liệu trong issue #526.
- **Target files and symbols:**
  - `apps/server/src/lib/self-study-plan.test.ts` (gọi `runSelfStudyPlanTick`, `loadSnapshot`, và `POST /api/classes/:id/assignments`)
- **Steps:**
  1. Tạo `apps/server/src/lib/self-study-plan.test.ts` khởi tạo libsql `:memory:` chạy đủ migrations (`packages/db/src/migrations`), kiểm tra 10 kịch bản:
     - **T1 (Trước giờ giao & đúng giờ giao):** Trước `releaseAt` (05:55) tick không tạo `class_assignment`; đến `releaseAt` (06:00) tick tạo `class_assignment` với id tất định `"ca_ssp_" + item.id`, `dueAt = day.dueAt`, `planItemId = item.id`, targets cho mọi học viên `active`, chuyển ngày sang `released`, gửi thông báo `self_study_released` (1 thông báo / học viên / ngày) và ghi `notifiedAt`.
     - **T2 (Chạy lại & chạy chồng — idempotent):** Gọi `runSelfStudyPlanTick` 2 lần liên tiếp hoặc `Promise.all([runSelfStudyPlanTick(...), runSelfStudyPlanTick(...)])` cùng mốc `now` (kể cả khi `mailer.send` có độ trễ bất đồng bộ) không tạo trùng `class_assignment`, không tạo trùng `class_assignment_target`, và không gửi trùng email/thông báo. <!-- Updated: Red Team RT-2 -->
     - **T3 (Bù lượt lỡ — catch-up):** Tick chạy trễ lúc 06:15 (vẫn `<= dueAt` 17:00) tự động bù và giao đủ bài của ngày có `releaseAt = 06:00`.
     - **T4 (Quá `dueAt` — missed):** Tick chạy lúc 17:05 (`now > dueAt`) không giao bài, chuyển ngày sang `status = 'missed'` kèm `warning`, không gửi thông báo.
     - **T5 (Ngày nghỉ & `holidayOverride`):** Ngày nằm trong `organization_holiday` (scope `org` hoặc `classes`) có `holidayOverride = false` tự chuyển sang `skipped` và không gửi thông báo; ngày có `holidayOverride = true` vẫn được giao bài bình thường.
     - **T6 (Học viên vào giữa ngày):** Học viên mới chuyển `active` lúc 10:00 (trước `dueAt` 17:00 của ngày đã `released`, kể cả khi ngày đó là ngày cuối cùng làm plan chuyển sang `completed` lúc 06:00) được tick lúc 10:05 thêm `class_assignment_target` cho bài hôm nay và gửi 1 thông báo `self_study_released` riêng cho học viên mới mà không gửi trùng cho học viên cũ; các ngày đã qua không được giao bù.
     - **T7 (Đề mất trạng thái `ready`):** Ngày có 2 đề nhưng lúc 06:00 đề đầu tiên (position 0) bị chuyển về `draft` → bỏ đề `draft`, vẫn giao đề `ready` thứ hai, `linkPath` thông báo trỏ đúng vào đề `ready` thứ hai đã tạo, ghi `warning` lên ngày; nếu tất cả đề trong ngày mất `ready` → ngày chuyển `skipped` kèm `warning` và không gửi thông báo. <!-- Updated: Red Team RT-2 -->
     - **T8 (Phục hồi khi lỗi gửi thông báo & quét `queued` quá hạn > 5 phút):** Nếu `notifiedAt` chưa được ghi hoặc bản ghi `notification_record` của `self_study_released` đang ở `queued` quá 5 phút (`createdAt <= now - 5 * 60_000`) do lỗi mạng tạm thời, lượt tick kế tiếp tự enqueue/deliver bù và cập nhật `notifiedAt` + `status = 'sent'`. <!-- Updated: Red Team RT-2 -->
     - **T9 (Tự động `completed`):** Khi ngày `pending` cuối cùng của plan chuyển sang `released`/`skipped`/`missed` và `vietnamTodayISO(now) >= plan.endDate`, `self_study_plan.status` tự chuyển sang `completed` để lớp có thể công bố plan mới; nếu `vietnamTodayISO(now) < plan.endDate` (còn ngày tương lai trong plan nhiều tuần) thì plan giữ nguyên `published`. <!-- Updated: Red Team RT-5 -->
     - **T10 (Cô lập mức 200 bài giao tay & `loadSnapshot`):** Lớp có 205 `class_assignment` sinh từ plan (`planItemId IS NOT NULL`) kèm targets và attempts đã nộp vẫn cho phép giáo viên giao tay qua `POST /api/classes/:id/assignments`, và `loadSnapshot` không trả về hay quét các bài/targets/attempts có `planItemId IS NOT NULL`. <!-- Updated: Red Team RT-1 -->
- **Success criteria:** Test chạy và fail vì `apps/server/src/lib/self-study-plan.ts` chưa tồn tại.
- **Verify:** `pnpm --filter server exec vitest run src/lib/self-study-plan.test.ts` exits non-zero (Red phase).

### Task 2.2 — Hiện thực `selfStudyReleasedEvents`, `runSelfStudyPlanTick`, cô lập 200-cap/snapshot và nối Worker `scheduled` + Alchemy `crons` (Green)

- **Goal:** Hiện thực đầy đủ engine job định kỳ, template thông báo, bộ lọc `isNull(classAssignment.planItemId)`, và cấu hình cron để tất cả test ở Task 2.1 xanh.
- **Target files and symbols:**
  - `apps/server/package.json` (thêm `"./lib/self-study-plan": "./src/lib/self-study-plan.ts"` vào `"exports"`)
  - `apps/server/src/lib/notifications/templates.ts` (`selfStudyReleasedEvents`)
  - `apps/server/src/routes/holidays.ts` (export `loadExistingHolidayDates`, chunk `inArray` theo `D1_IN_ARRAY_CHUNK = 50`)
  - `apps/server/src/lib/self-study-plan.ts` (`sspAssignmentId`, `sspTargetId`, `runSelfStudyPlanTick`, `checkAndCompletePlan`)
  - `apps/server/src/routes/kernel.ts` (lọc `isNull(classAssignment.planItemId)` ở dòng 764)
  - `apps/server/src/routes/snapshot.ts` (lọc `isNull(classAssignment.planItemId)` ở `classAssignmentRows`, `classAssignmentTargetRows`, `submittedAttemptRows`)
  - `apps/server/src/index.ts` (`export async function scheduled`, `Object.assign(app, { scheduled })`)
  - `packages/infra/alchemy.run.ts` (`crons: ["*/5 * * * *"]`)
- **Steps:**
  1. Trong `apps/server/package.json`, thêm `"./lib/self-study-plan": "./src/lib/self-study-plan.ts"` vào `"exports"`. <!-- Updated: Red Team RT-6 -->
  2. Trong `apps/server/src/lib/notifications/templates.ts`, thêm `selfStudyReleasedEvents(input: { dayId: string; className: string; date: string; dueTime: string; itemCount: number; firstAssignmentId: string; studentIds: string[] }): NotificationEvent[]` tạo sự kiện có `eventType: "self_study_released"`, `idempotencyKey: "self_study_released:${input.dayId}:${studentId}"`, `linkPath: "/learn/quizzes/${input.firstAssignmentId}"`, `refType: "self_study_plan_day"`, `refId: input.dayId`.
  3. Trong `apps/server/src/routes/holidays.ts`, export hàm `loadExistingHolidayDates` và chia chunk `inArray(organizationHolidayClass.holidayId, slice)` theo `D1_IN_ARRAY_CHUNK = 50` (dòng 184-195). <!-- Updated: Red Team RT-3 -->
  4. Tạo `apps/server/src/lib/self-study-plan.ts`:
     - Hàm `sspAssignmentId(itemId: string): string` trả `"ca_ssp_" + itemId` (tuyệt đối không dùng `randomUUID` cho header).
     - Hàm `sspTargetId(itemId: string, studentId: string): string` trả `"cat_ssp_" + itemId + "_" + studentId`.
     - Hàm `checkAndCompletePlan(db: Db, planId: string, orgId: string, now: Date)`: kiểm tra nếu plan đang `status = 'published'`, số dòng `self_study_plan_day` có `planId` và `status = 'pending'` bằng `0`, **và** `vietnamTodayISO(now) >= plan.endDate`, thì cập nhật `self_study_plan` sang `status = 'completed'`, `completedAt = now` với điều kiện `and(eq(selfStudyPlan.id, planId), eq(selfStudyPlan.orgId, orgId), eq(selfStudyPlan.status, "published"))`. <!-- Updated: Red Team RT-5 -->
     - Hàm `runSelfStudyPlanTick(deps: { db: Db; now?: Date; mailer: Mailer; studentOrigin: string; retryDelaysMs?: number[]; maxDaysPerTick?: number })`:
       - Mọi truy vấn join/lookup trên `selfStudyPlan`, `classTable`, `selfStudyPlanItem`, `assignmentPrompt`, `enrollment`, `classAssignment`, `classAssignmentTarget` đều lọc tường minh `eq(<table>.orgId, day.orgId)`. <!-- Updated: Red Team RT-4 -->
       - **Bước 1:** Quét tối đa `maxDaysPerTick` (mặc định 50) dòng `self_study_plan_day` có `status = 'pending' AND releaseAt <= now` thuộc `self_study_plan` có `status = 'published'`, sắp xếp `releaseAt ASC, date ASC, id ASC`. Xử lý từng ngày trong `try/catch` độc lập:
         - Quá `dueAt` (`now.getTime() > day.dueAt.getTime()`) → cập nhật `status = 'missed'` (`WHERE id = day.id AND status = 'pending'`), gọi `checkAndCompletePlan`.
         - Ngày nghỉ không override → cập nhật `status = 'skipped'`, gọi `checkAndCompletePlan`.
         - Lọc đề `ready` + ghi `warning`; nếu 0 đề `ready` hoặc 0 học viên `active` → cập nhật `status = 'skipped'`, gọi `checkAndCompletePlan`.
         - Khi giao bài: chia chunk `INSERT INTO class_assignment` ($\le 8$ dòng/câu lệnh) + `INSERT INTO class_assignment_target` ($\le 15$ dòng/câu lệnh) với `onConflictDoNothing()` + `UPDATE self_study_plan_day SET status = 'released', released_at = now, warning = ... WHERE id = day.id AND status = 'pending'` trong một `db.batch`. Gọi trực tiếp `enqueueNotifications`, cập nhật `notifiedAt = now`, và nếu `createdIds.length > 0` thì gọi `deliverNotifications` với đúng `createdIds` đó (ghi nhận `createdIds` vào tập `processedNotificationIds` của tick). Gọi `checkAndCompletePlan`. <!-- Updated: Red Team RT-2, RT-3 -->
       - **Bước 2:** Quét các ngày đã `released` của plan chưa huỷ (`plan.status IN ('published', 'completed')`) có `day.dueAt >= now` (để bù học viên mới `active` giữa ngày bằng chunk `INSERT INTO class_assignment_target ... onConflictDoNothing()`) hoặc `day.notifiedAt IS NULL` (trong vòng 24h quanh `now`). Luôn lấy `firstAssignmentId` và `itemCount` từ các dòng `class_assignment` thực tế đã tạo cho ngày đó (sắp theo `selfStudyPlanItem.position ASC`). Khi có học viên mới hoặc `day.notifiedAt === null`, gọi `enqueueNotifications`, cập nhật `day.notifiedAt = now` nếu chưa có, và nếu `createdIds.length > 0` thì gọi `deliverNotifications(..., createdIds, ...)` (thêm vào `processedNotificationIds`). <!-- Updated: Red Team RT-2 -->
       - **Bước 3:** Quét tối đa `50` (`D1_IN_ARRAY_CHUNK = 50`) bản ghi `notification_record` có `eventType = 'self_study_released' AND status = 'queued' AND createdAt <= new Date(now.getTime() - 5 * 60_000)` (loại trừ `processedNotificationIds` vừa xử lý trong Bước 1 & 2) và gọi `deliverNotifications` để đảm bảo không có thông báo `queued` bị kẹt mà không bao giờ gửi trùng với lượt gửi đang bay. <!-- Updated: Red Team RT-2, RT-3 -->
  5. Trong `apps/server/src/routes/kernel.ts` (kiểm tra giới hạn 200 bài giao tay cho lớp, dòng 764), thêm `isNull(classAssignment.planItemId)`. Trong `apps/server/src/routes/snapshot.ts` (`loadSnapshot`, dòng 434-466), thêm `isNull(classAssignment.planItemId)` ở `classAssignmentRows` và inner-join `classAssignment` kèm `isNull(classAssignment.planItemId)` ở cả `classAssignmentTargetRows` và `submittedAttemptRows`. <!-- Updated: Red Team RT-1 -->
  6. Trong `apps/server/src/index.ts`, export hàm `scheduled(controller: ScheduledController, _env?: unknown, ctx?: ExecutionContext)` gọi `runSelfStudyPlanTick({ db: (db ??= createDb() as unknown as Db), mailer: getMailer(), studentOrigin: parseCORSOrigins(env.STUDENT_ORIGINS)[0] ?? "" })` (bọc trong `ctx?.waitUntil` nếu có) và gắn `scheduled` vào default export `Object.assign(app, { scheduled })`. <!-- Updated: Red Team RT-6 -->
  7. Trong `packages/infra/alchemy.run.ts`, thêm `crons: ["*/5 * * * *"]` vào `Cloudflare.Worker("server", ...)`.
- **Success criteria:** Tất cả 10 kịch bản unit test trong `apps/server/src/lib/self-study-plan.test.ts` đều pass, typecheck của `apps/server` và `packages/infra` pass.
- **Verify:** `pnpm --filter server exec vitest run src/lib/self-study-plan.test.ts && pnpm --filter server check-types && pnpm --filter @teacher-os/infra check-types` exits 0.

## Verification

- `pnpm --filter server exec vitest run src/lib/self-study-plan.test.ts` exits 0.
- `pnpm --filter server check-types && pnpm --filter @teacher-os/infra check-types` exits 0.

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
