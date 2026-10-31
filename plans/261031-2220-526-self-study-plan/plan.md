---
title: "#526: Self study plan — tự động giao đề hằng ngày cho lớp theo khung giờ"
description: "Thêm module Self Study Plan dài hạn cho lớp với job định kỳ */5 phút, thông báo chủ động, đánh dấu nộp trễ theo dueAt và quiz_attempt.submittedAt, bỏ qua ngày nghỉ có override, tách khỏi giới hạn 200 bài/snapshot và màn quản lý tiến độ giáo viên."
status: pending
priority: P1
effort: 10h
issue: 526
branch: feat/526-self-study-plan
tags: [feature, database, api, backend, frontend, infra]
blockedBy: []
blocks: []
created: 2026-10-31
---

# Plan: #526 — Self study plan: tự động giao đề hằng ngày cho lớp theo khung giờ

## Overview

Hiện tại trung tâm vận hành kế hoạch tự học (self study plan) thủ công từ thứ 2 đến chủ nhật (giao lúc 06:00, hạn nộp 17:00 cùng ngày theo giờ Việt Nam `Asia/Ho_Chi_Minh`). Kế hoạch này bổ sung module Self Study Plan vào Teacher OS theo hướng kỹ thuật đã chốt trong issue #526:

1. **Dữ liệu (`packages/db`):**
   - Tạo 3 bảng mới:
     - `self_study_plan` (`id`, `org_id`, `class_id`, `title`, `start_date`, `end_date`, `release_time` mặc định `'06:00'`, `due_time` mặc định `'17:00'`, `status` thuộc `'draft' | 'published' | 'completed' | 'cancelled'`, `published_at`, `completed_at`, `cancelled_at`, `created_at`, `updated_at`), kèm partial unique index `self_study_plan_class_published_uq` trên `(class_id) WHERE status = 'published'` để mỗi lớp chỉ có tối đa một plan đang chạy.
     - `self_study_plan_day` (`id`, `org_id`, `plan_id`, `date`, `release_at`, `due_at`, `status` thuộc `'pending' | 'released' | 'skipped' | 'missed'`, `holiday_override`, `warning`, `notified_at`, `released_at`), unique `(plan_id, date)`.
     - `self_study_plan_item` (`id`, `org_id`, `plan_id`, `date`, `prompt_id`, `position`, `note`), tham chiếu `assignment_prompt.id` ở trạng thái `ready`.
   - Thêm cột nullable `due_at` (`timestamp_ms`) và `plan_item_id` (`text`) vào `class_assignment`, giữ nguyên cột `due` (`YYYY-MM-DD`).
2. **Hạn nộp & trạng thái trễ (`packages/api`, `apps/server`, `apps/student`, `apps/web`):**
   - Bổ sung additive `dueAt?: string | null` vào `studentAssignmentSchema`, thêm event type `self_study_released` vào `NOTIFICATION_EVENT_TYPES` (nhóm `assignment`, nhãn `"Bài tự học"` trong `apps/web/src/routes/_auth/notifications/index.tsx`), và thêm contract cho Self Study Plan (trần `MAX_SELF_STUDY_DAYS = 366`, trần `MAX_SELF_STUDY_ITEMS_PER_DAY = 10`). <!-- Updated: Red Team RT-6 -->
   - Trong `loadClassAssignmentItems` (`apps/server/src/routes/student-class.ts`), lọc thêm `eq(quizAttempt.orgId, orgId)`, lấy `submittedAt` từ `quiz_attempt.submittedAt` (fallback `class_assignment_target.submittedAt` nếu null) và trả kèm `dueAt` từ `class_assignment.dueAt`. <!-- Updated: Red Team RT-4 -->
   - Trong `deriveAssignmentStatus` (`apps/student/src/lib/assignment-status.ts`), ưu tiên `dueAt` khi có: hiển thị hạn `HH:MM dd/MM` nhất quán ở mọi nhánh trạng thái; từ đúng mốc `dueAt` (17:00 cùng ngày) bài chưa nộp hiện `"Quá hạn"` (không bao giờ hiển thị `"quá 0 ngày"`); bài nộp sau `dueAt` (`submittedAtMs > dueAtMs`) vẫn được nhận và gắn nhãn trễ (`"Đã nộp · Trễ hạn"` / `"Đã nộp trễ — Đang chờ giáo viên chấm"` / `"Điểm: X · Nộp trễ"`), bài nộp đúng hạn (`submittedAtMs <= dueAtMs`) không bị gắn nhãn trễ sai quanh mốc 17:00. <!-- Updated: Red Team RT-6 -->
3. **Job định kỳ & Cô lập Snapshot / Giới hạn 200 bài (`apps/server`, `packages/infra`):**
   - Logic job đặt tại `apps/server/src/lib/self-study-plan.ts` (export subpath `"./lib/self-study-plan"` trong `apps/server/package.json`), nhận `now: Date` qua tham số. `apps/server/src/index.ts` export `scheduled` (dùng `(db ??= createDb() as unknown as Db)`, `getMailer()`, `parseCORSOrigins(env.STUDENT_ORIGINS)[0] ?? ""`) và gắn vào default export; `packages/infra/alchemy.run.ts` khai báo `crons: ["*/5 * * * *"]`. <!-- Updated: Red Team RT-6 -->
   - Job quét các ngày `pending` có `releaseAt <= now` của plan `published` theo thứ tự `releaseAt ASC`, có trần số ngày mỗi tick (`maxDaysPerTick = 50`), lỗi một ngày không làm hỏng ngày khác:
     - Nếu `now > dueAt`: chuyển ngày sang `missed`, không tự giao trễ.
     - Nếu ngày trùng lịch nghỉ (`organization_holiday` phạm vi `org` hoặc `classes`, chunk `inArray` theo `D1_IN_ARRAY_CHUNK = 50`) và `holidayOverride = false`: chuyển sang `skipped`, không gửi thông báo. <!-- Updated: Red Team RT-3 -->
     - Nếu không có đề hoặc mọi đề đều mất trạng thái `ready` hoặc lớp chưa có học viên `active`: chuyển sang `skipped` (ghi `warning` nếu có đề mất `ready`). Nếu một số đề mất `ready` nhưng còn đề `ready`: bỏ đề mất `ready`, ghi `warning`, và vẫn giao các đề `ready` còn lại.
     - Khi giao bài: `class_assignment.id` suy ra tất định từ `item.id` (`"ca_ssp_" + item.id`, không dùng `randomUUID`), targets chèn theo chunk ($\le 15$ dòng/câu lệnh) bằng `onConflictDoNothing()`, cập nhật ngày sang `released` (`WHERE id = day.id AND status = 'pending'`) trong cùng một `db.batch`. <!-- Updated: Red Team RT-2, RT-3 -->
     - Bù học viên mới `active` vào giữa ngày cho các ngày đang mở (`status = 'released' AND dueAt >= now` của plan chưa huỷ), và phục hồi các ngày `status = 'released' AND notifiedAt IS NULL` (kể cả vừa qua `dueAt` trong 24h) dựa trên các dòng `class_assignment` thực tế đã tạo. <!-- Updated: Red Team RT-2 -->
     - Gọi trực tiếp `enqueueNotifications` và chỉ truyền `createdIds` vừa chèn sang `deliverNotifications` (không qua `emitNotifications`), chỉ ghi `notifiedAt` sau khi `enqueueNotifications` thành công, và ở bước 3 chỉ quét lại tối đa 50 thông báo `queued` quá hạn (`createdAt <= now - 5 phút`, loại trừ ID vừa xử lý trong tick) để không gửi trùng email khi 2 tick chạy chồng. <!-- Updated: Red Team RT-2, RT-3 -->
     - Tự động chuyển plan từ `published` sang `completed` khi không còn ngày `pending` và không còn ngày tương lai (`vietnamTodayISO(now) >= plan.endDate`). <!-- Updated: Red Team RT-5 -->
   - Lọc `isNull(classAssignment.planItemId)` ở chỗ đếm giới hạn 200 bài (`apps/server/src/routes/kernel.ts`) và ở cả 3 câu truy vấn `classAssignmentRows`, `classAssignmentTargetRows`, `submittedAttemptRows` trong `loadSnapshot` (`apps/server/src/routes/snapshot.ts`). <!-- Updated: Red Team RT-1 -->
4. **API Giáo viên, Màn hình Plan & E2E (`apps/server`, `apps/web`, `apps/e2e`):**
   - Endpoint riêng có phân trang theo khoảng ngày (`GET /api/classes/:classId/self-study-plan?from=...&to=...`), kiểm tra chặt quyền sở hữu `orgId` (`findOrgClass`, `findClassPlan`), role gate (`canPublishGrade` cho các route ghi, `canReviewGrade` cho route đọc) và `readBody` (`Content-Type: application/json` -> `415`, `try/catch` JSON -> `400`), tính sẵn lịch nghỉ dự kiến lúc đọc và tiến độ nộp/trễ từng bài, cùng các endpoint tạo/cập nhật nháp, công bố (chunked `db.batch`, yêu cầu ít nhất 1 đề `ready`), đổi giờ (`UPDATE ... WHERE plan_id = ? AND org_id = ? AND status IN ('pending', 'skipped') AND released_at IS NULL AND date > todayVN`), sửa đề/override ngày tương lai (`date > todayVN` và chưa giao), giao lại ngày `missed`, và huỷ plan. <!-- Updated: Red Team RT-4, RT-5 -->
   - Giao diện quản lý Self Study Plan trong chi tiết lớp (`/classes/$classId`) dùng nút chuyển `<button type="button" aria-pressed={...}>` (không thêm `role="tab"` và chỉ fetch khi mở khu vực `"Kế hoạch tự học"` để bảo toàn các test hiện hữu của `$classId`), đạt chuẩn `DESIGN.md` và `REVIEW.md` trên 3 viewport (`1440×900`, `768×1024`, `375×812`). <!-- Updated: Red Team RT-6 -->
   - Endpoint `/__e2e/self-study-tick` chỉ đăng ký trong `apps/e2e/src/boot.ts` (không nằm trong `buildApp`), hỗ trợ dịch `dueAt` phục vụ kiểm thử quá hạn/nộp trễ độc lập giờ hệ thống, kèm E2E spec kiểm chứng luồng đầy đủ trên libsql. <!-- Updated: Red Team RT-6 -->

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - 3 bảng `self_study_plan`, `self_study_plan_day`, `self_study_plan_item` + 2 cột nullable `class_assignment.due_at`, `class_assignment.plan_item_id`.
  - Cron `*/5 * * * *` trong `packages/infra/alchemy.run.ts` + `scheduled` handler trong `apps/server/src/index.ts` + logic `runSelfStudyPlanTick` trong `apps/server/src/lib/self-study-plan.ts`.
  - Lọc `isNull(classAssignment.planItemId)` tại giới hạn 200 bài giao tay và toàn bộ truy vấn bài giao/target/attempt của `loadSnapshot`.
  - Tính hạn và nộp trễ ưu tiên `dueAt` và `quiz_attempt.submittedAt` trong `loadClassAssignmentItems`, `deriveAssignmentStatus` và màn tiến độ plan.
  - Bộ API và UI Self Study Plan trong trang lớp của giáo viên + endpoint tick E2E chỉ trong `apps/e2e/src/boot.ts`.
- **Explicit Non-Goals:**
  - Việc tự do như học từ, đọc trang sách, xem video.
  - Giao full test (`assignment_test`) qua plan.
  - Plan riêng hoặc chỉnh bài cho từng học viên.
  - Khoá nộp bài sau hạn.
  - Kênh Zalo hoặc push notification.

## Phases

| # | Phase | Status | Effort | Dependencies |
|---|-------|--------|--------|--------------|
| 1 | [Phase 1: Schema, Contracts & Late Status](./phase-01-schema-contracts-and-late-status.md) | Pending | 2.5h | — |
| 2 | [Phase 2: Cron Job, Notifications & Snapshot/200-Cap Isolation](./phase-02-cron-job-and-isolation.md) | Pending | 3h | Phase 1 |
| 3 | [Phase 3: Teacher Self Study Plan API Routes](./phase-03-teacher-api-routes.md) | Pending | 2h | Phase 1, Phase 2 |
| 4 | [Phase 4: Teacher UI, E2E Tick & End-to-End Verification](./phase-04-teacher-ui-and-e2e.md) | Pending | 2.5h | Phase 2, Phase 3 |

## Extension Trace

- **Boundary:** `runSelfStudyPlanTick` (`apps/server/src/lib/self-study-plan.ts`) và bảng `self_study_plan_item` / `class_assignment`.
- **Credible next variant:** Mở rộng giao tự động sang một loại học liệu ngân hàng khác hoặc khung giờ riêng theo ca học.
- **Stable contract:** `self_study_plan_day` giữ nguyên thời điểm tuyệt đối `release_at` / `due_at` (`timestamp_ms`) và trạng thái máy (`pending` → `released | skipped | missed`), còn `runSelfStudyPlanTick` chỉ quét `status = 'pending' AND release_at <= now` mà không phụ thuộc cách tính giờ ở tầng cấu hình.
- **Pieces that would change:** Thêm cột tham chiếu loại học liệu hoặc helper quy đổi giờ lúc công bố/sửa giờ; không phải sửa cơ chế claim, retry thông báo hay cô lập snapshot.

## Red Team Review

| # | Lens | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|---|
| RT-1 | Assumption Destroyer | Critical | `loadSnapshot` vẫn quét toàn bộ `class_assignment_target` và `quiz_attempt` của bài tự học nếu chỉ lọc bảng `class_assignment` | `apps/server/src/routes/snapshot.ts:439-466` | **Accept** — Inner-join `classAssignment` kèm `isNull(classAssignment.planItemId)` trên cả `classAssignmentTargetRows` và `submittedAttemptRows` trong Phase 2. |
| RT-2 | Failure Mode Analyst & Assumption Destroyer | Critical | Hai tick chạy chồng (`Promise.all`) hoặc Bước 3 quét `status = 'queued' AND createdAt <= now` ngay lập tức sẽ gọi `deliverNotifications` lần 2 khi `mailer.send` đang bay | `apps/server/src/lib/notifications/deliver.ts:132-186`, `enqueue.ts:62,94-100` | **Accept** — Bước 1 & 2 chỉ truyền `createdIds` từ `enqueueNotifications` sang `deliverNotifications`; Bước 3 chỉ quét bản ghi `queued` quá hạn (`createdAt <= now - 5 phút`), loại trừ ID vừa xử lý và giới hạn 50 ID. |
| RT-3 | Failure Mode Analyst | Critical | Vượt trần 100 biến bind của D1 khi chèn `class_assignment_target`, `self_study_plan_item`, quét 100 ID ở `deliverNotifications` hoặc `inArray` ở `loadExistingHolidayDates` | `apps/server/src/lib/notifications/enqueue.ts:10`, `holidays.ts:35,184-195`, `deliver.ts:146-151` | **Accept** — Chunk mọi lệnh `INSERT` (`day` $\le 8$, `item` $\le 10$, `assignment` $\le 8$, `target` $\le 15$ dòng/câu lệnh) và mọi `inArray` ($\le 50$ ID) trong Phase 2 & Phase 3. |
| RT-4 | Security Adversary | Critical | Thiếu kiểm tra sở hữu `classId`/`planId` theo `ctx.orgId`, thiếu role gate `canPublishGrade` chặn `ta`, thiếu `readBody` (`415`/`400`) trên `POST`/`PUT`/`PATCH`, và lỗi mount trùng `/classes/classes` | `apps/server/src/routes/kernel.ts:161-172,261-276,2116`, `packages/auth/src/role.ts:116-142` | **Accept** — Bắt buộc `findOrgClass`, `findClassPlan`, `validateReadyOrgPrompts`, `canPublishGrade`/`canReviewGrade`, `readBody(c, schema)`, và mount `kernel.route("/", selfStudyPlanRoutes(deps))` trong Phase 3. |
| RT-5 | Failure Mode Analyst & Assumption Destroyer | Critical | Tự động `completed` sớm khi ngày tương lai chưa gắn đề, sót cập nhật `releaseAt`/`dueAt` cho ngày tương lai đang `skipped` khi đổi giờ, và hạn mặc định của `release-missed` rơi vào quá khứ | `packages/api/src/vietnam-date.ts:25-40`, `packages/db/src/schema/class-assignment.ts:32` | **Accept** — Chỉ tự chuyển `completed` khi hết ngày `pending` và `todayVN >= plan.endDate`; `PATCH .../hours` cập nhật cả ngày tương lai `status IN ('pending', 'skipped') AND released_at IS NULL`; `release-missed` tính `newDueAt > now` và đồng bộ `class_assignment.due`. |
| RT-6 | Assumption Destroyer & Security Adversary | Critical | Thiếu `self_study_released` trong `EVENT_TYPE_LABELS`, thiếu export `./lib/self-study-plan` trong `apps/server/package.json`, `mailer` bị `undefined` trên cold cron isolate, vỡ test `$classId.test.tsx` nếu thêm `role="tab"` hoặc fetch lúc mount mặc định, và E2E phụ thuộc giờ máy chạy | `apps/web/src/routes/_auth/notifications/index.tsx:116-124`, `apps/server/package.json:5-11`, `apps/server/src/index.ts:38-55`, `apps/web/src/routes/_auth/classes/$classId.test.tsx:161-174` | **Accept** — Cập nhật `notifications/index.tsx`, `apps/server/package.json`, `getMailer()` trong `index.ts`, dùng `<button type="button" aria-pressed>` + lazy mount `SelfStudyPlanSection`, và hỗ trợ `setReleasedDueAt` trong `/__e2e/self-study-tick`. |

### Whole-Plan Consistency Sweep (Red-Team)
- Đã rà soát toàn bộ `plan.md` và `phase-01`..`phase-04` để đồng bộ cả 6 quyết định RT-1..RT-6, không còn mâu thuẫn giữa mô tả tổng quan, chi tiết từng task và điều kiện kiểm chứng.

## Validation Log

### Verification Results
- Claims checked: 40
- Verified: 40 | Failed: 0 | Unverified: 0
- Tier: Standard (4 phases — Fact Checker + Contract Verifier)
- Failures: None (all file paths, exports, Drizzle schemas, and route contracts verified against worktree `/root/projects/worktrees/teacher-os-526-self-study-plan`).

### Whole-Plan Consistency Sweep (Validation)
- Tất cả tên bảng (`self_study_plan`, `self_study_plan_day`, `self_study_plan_item`), cột mới (`due_at`, `plan_item_id`), endpoint (`/api/classes/:classId/self-study-plan*`, `/__e2e/self-study-tick`), và lệnh `Verify` nhất quán xuyên suốt 4 phase.

## Success Criteria

- [ ] Giáo viên tạo, sửa, công bố và huỷ được plan dài hạn của lớp, với giờ mặc định 06:00-17:00.
- [ ] Đến `releaseAt`, mọi học viên `active` nhận đủ bài của ngày; trước giờ đó học viên không thấy bài.
- [ ] Chạy lại hoặc chạy chồng job không tạo trùng bài và không gửi trùng thông báo.
- [ ] Đổi giờ của plan chỉ ảnh hưởng các ngày chưa tới và không cần deploy.
- [ ] Bài nộp sau `dueAt` vẫn được nhận và hiện nhãn trễ; bài nộp đúng hạn không bị gắn nhãn sai quanh mốc 17:00.
- [ ] Từ 17:00 cùng ngày, bài chưa nộp hiện "Quá hạn" ở app học viên.
- [ ] Ngày nghỉ được bỏ qua và hiện trên plan; giáo viên chọn vẫn giao được.
- [ ] Giao tay vẫn hoạt động khi lớp có nhiều hơn 200 bài từ plan.
- [ ] Payload snapshot không tăng theo số bài tự học.
- [ ] Unit test phủ: chạy lại, chạy chồng, bù lượt lỡ, quá `dueAt`, ngày nghỉ, học viên vào giữa ngày, đề mất `ready`.
- [ ] E2E chạy trên libsql và kích hoạt được tick.
- [ ] 99% ngày được giao trong vòng 10 phút sau `releaseAt`, và không có thông báo `queued` quá 30 phút.

<!-- slug: 526-self-study-plan -->
