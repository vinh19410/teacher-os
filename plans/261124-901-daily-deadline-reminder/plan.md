# Plan: Email nhắc homework và self-study lúc 06:00 sáng mỗi ngày (#901)

- **Issue:** https://github.com/vinh19410/teacher-os/issues/901
- **Branch:** `vinh19410/Email-nhắc-bài-mỗi-ngày` → PR target `develop` (`--merge --beta`)
- **Status:** Done

## Objective
Tự động gửi 1 email tổng hợp lúc 06:00 sáng giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7) mỗi ngày nhắc học viên về các bài Homework (`class_assignment` giao tay) và Self-study (`class_study_pack`) chưa nộp có deadline rơi đúng ngày hôm đó. Bỏ qua hoàn toàn nếu học viên không có deadline trong ngày hoặc chưa có email. Tích hợp `notification_record` với `channels = "email"` (hiện trên Nhật ký thông báo `/notifications` của giáo viên, không vào chuông in-app của học viên).

## Implementation Notes
- Sau khi đồng bộ với `origin/develop` (PR #900 đã bổ sung cột `html_body` và `text_body` trên `notification_record` qua migration `0086_class_opening_email.sql`), tính năng tái sử dụng trực tiếp hai cột `htmlBody` / `textBody` có sẵn theo đúng chuẩn toàn repo — không cần thêm migration mới.

## Phases & File Ownership

1. **Shared Contracts, Web Label & Infra Cron**
   - Files: `packages/api/src/contracts.ts`, `packages/db/src/schema/notification-record.ts` (JSDoc), `apps/web/src/routes/_auth/notifications/index.tsx`, `apps/web/src/routes/_auth/notifications/index.test.tsx`, `packages/infra/alchemy.run.ts`, `scripts/topology-drift.test.mjs`
   - Deliverable: Thêm `"daily_deadline_reminder"` vào `NOTIFICATION_EVENT_TYPES` (`eventGroup: "assignment"`), nhãn `"Nhắc bài hằng ngày"` ở `/notifications`, khai báo cron `"0 23 * * *"` cạnh `"*/10 * * * *"` ở `alchemy.run.ts` kèm test.
2. **Notification Email-Only Core, Digest Renderer & Daily Cron Service**
   - Files: `apps/server/src/lib/notifications/templates.ts`, `templates.test.ts`, `enqueue.ts`, `deliver.ts`, `notifications.test.ts`, `daily-deadline-reminder.ts`, `daily-deadline-reminder.test.ts`, `apps/server/src/lib/scheduled.ts`, `scheduled.test.ts`, `apps/server/src/index.ts`, `apps/server/src/routes/notification-logs.test.ts`
   - Deliverable:
     - Hỗ trợ `channels: "email"` trong `enqueueNotifications` (bỏ qua nếu trống email) và `sendIntervalMs` + `[...new Set(ids)]` trong `deliverNotifications`.
     - Render `htmlBody`/`textBody` digest tách 2 mục **Bài tập về nhà** và **Bộ đề tự học**, kèm giờ hạn (`HH:MM` hoặc `Trong ngày`), giờ mở nếu sau 06:00, link `/learn/quizzes/:id`, CTA `/assignments` (giữ nguyên khi gửi lại `/resend`).
     - Service `runDailyDeadlineReminderCron` lọc đúng bài chưa nộp hạn hôm nay giờ VN, lớp `active`, `enrollment = active`, bỏ demo students, chạy 2 pha enqueue-rồi-deliver với giãn nhịp xuyên org, idempotent theo `(orgId, studentId, vnDate)`.
     - Định tuyến cron tách biệt qua `dispatchScheduledCron` trong `apps/server/src/lib/scheduled.ts` và `apps/server/src/index.ts`.
3. **Student Inbox Isolation**
   - Files: `apps/server/src/routes/student.ts` (`/inbox` & `/inbox/:id/read`), `apps/server/src/routes/student-inbox.test.ts`
   - Deliverable: Lọc `instr(',' || channels || ',', ',in_app,') > 0` để bản ghi `channels = "email"` không xuất hiện ở `/api/student/inbox` và không tính vào `unread`.

## Acceptance Criteria (Done means)
1. Cron `"0 23 * * *"` khai báo trong `packages/infra/alchemy.run.ts` và định tuyến tách biệt trong `apps/server/src/index.ts` không ảnh hưởng cron Zoom `"*/10 * * * *"`.
2. Unit/integration tests pass đủ: 1 digest/học viên/ngày tách 2 mục Homework & Self-study có link từng bài & giờ mở sau 06:00; bỏ qua khi không có deadline hôm nay, đã nộp, lớp `paused`, `enrollment = invited`, hoặc thiếu email; idempotent trong cùng ngày VN; gửi lại bản ghi `failed` giữ nguyên HTML digest và `channels = "email"`.
3. Bản ghi `daily_deadline_reminder` (`channels = "email"`) hiện đúng nhãn `"Nhắc bài hằng ngày"` ở `GET /api/notification-logs` và `/notifications`, và không xuất hiện ở `GET /api/student/inbox`.
4. Local gates pass, isolated review sạch, PR merge vào `develop`, Issue #901 gắn nhãn `shipped` kèm comment POT.
