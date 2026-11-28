---
title: "Online session link notice in opening email & 2-hour before session email cron"
description: "Bổ sung callout thông báo link buổi học gửi trước 2 tiếng vào Email khai giảng cho lớp Online và xây dựng cron tự động gửi email link Zoom buổi học trước 2 tiếng."
status: completed
priority: P1
effort: "4h"
tags: [email, notifications, cron, zoom, classes, opening]
created: 2026-11-28
---

# Online session link notice in opening email & 2-hour before session email cron

## Overview

Thực hiện đồng thời hai phần khép kín cho lớp `Online`:
1. **Email thông báo khai giảng (`@teacher-os/api` & `ConfirmOpeningModal` preview):** Bổ sung khối callout nổi bật (emerald accent) ngay bên dưới bảng thông tin lịch học (trên `Lời nhắn từ giáo viên` và CTA `Mở cổng học viên`) với tiêu đề `Link buổi học` và nội dung `"Link buổi học sẽ được gửi đến bạn trước buổi học 2 tiếng."` cho lớp `Online` (ẩn hoàn toàn với lớp `Offline` / không phải `Online`).
2. **Cron tự động gửi email link buổi học trước 2 tiếng (`session_link_reminder`):** Tận dụng trigger `*/10 * * * *` hiện có trên Worker `server` (`dispatchScheduledCron`), tự động tìm các buổi học `upcoming` của lớp `Online` `active` bước vào cửa sổ `[startMs - 2h, startMs)` (giờ Việt Nam UTC+7), gửi email (`channels: "email"`) chứa nút CTA trực tiếp tới link Zoom buổi học (`joinUrl` từ `lesson.zoom` hoặc `class_session_meeting.join_url`) kèm link phụ tới trang chi tiết buổi học trên cổng học viên cho học viên `active` có email (bỏ qua `demo-student:%` và các buổi chưa có link Zoom hợp lệ để gửi bù khi có link).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bổ sung callout `"Link buổi học sẽ được gửi đến bạn trước buổi học 2 tiếng."` vào `renderClassOpeningEmail` (HTML, plain-text, iframe xem trước) chỉ cho lớp `Online` | P1 |
| 2 | Thêm loại sự kiện `session_link_reminder`, helper cửa sổ `T-2h`, và `renderSessionLinkEmail` tại `@teacher-os/api` | P1 |
| 3 | Xây dựng `runSessionLinkReminderCron` (`apps/server`) ghép vào `dispatchScheduledCron` (chạy trước `runRecordingSyncCron`), cập nhật nhãn web & runbook | P1 |
| 4 | Kiểm chứng đầy đủ local gates, code review độc lập, POT 3 viewport Light/Dark và ship `--both` (`develop` rồi `main` cherry-pick sạch) | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: API Contracts, Opening Callout & Session Link Email Renderer](./phase-01-api-and-templates.md) | Completed |
| 2 | [Phase 2: Cron Job, Scheduler, Web UI, Docs & Visual POT](./phase-02-cron-web-docs-pot.md) | Completed |

## Success Criteria

- [x] Email khai giảng (HTML, plain-text, iframe `ConfirmOpeningModal`) hiển thị khối lưu ý `Link buổi học: Link buổi học sẽ được gửi đến bạn trước buổi học 2 tiếng.` cho lớp `Online` (không phân biệt hoa/thường khoảng trắng) và ẩn với lớp `Offline`.
- [x] `evaluateSessionLinkReminderWindow` kiểm tra chính xác `[startMs - 2h, startMs)` theo `Asia/Ho_Chi_Minh` (gồm buổi qua nửa đêm và validate `date`/`time`).
- [x] `renderSessionLinkEmail` render email chuẩn thương hiệu (Light/Dark + `[data-ogsc]`), thoát HTML chống XSS, kiểm tra `isValidZoomJoinUrl` / `isSafeEmailUrl`, có nút chính `Tham gia buổi học` (link Zoom) và link phụ tới `/classes/:classId/sessions/:date`.
- [x] `runSessionLinkReminderCron` gửi đúng 1 email (`channels: "email"`) mỗi `(classId, date, time, studentId)` cho học viên `active` có email thuộc lớp `Online` `active` có link Zoom hợp lệ; bỏ qua không tạo bản ghi khi thiếu link Zoom để gửi bù ở tick sau khi giáo viên thêm link; `getMailer` chỉ resolve lazy khi có email cần gửi; giãn nhịp `550ms/email`.
- [x] `dispatchScheduledCron` chạy `executeSessionLinkReminder` trước `runZoomSync` trên mọi tick `*/10 * * * *` (và sau `executeDailyReminder` ở cửa sổ 23:00–23:09 UTC), cô lập lỗi giữa 3 tác vụ.
- [x] Màn `/notifications` hiển thị nhãn `"Nhắc link buổi học"` cho `session_link_reminder`; `docs/production-release-runbook.md` và `packages/infra/alchemy.run.ts` comment + `topology-drift.test.mjs` được cập nhật đồng bộ.
- [x] Toàn bộ local gates (`biome check`, `check-types`, `topology-drift.test.mjs`, tests `@teacher-os/api`/`web`/`server`, `build`) xanh; POT screenshots 3 viewport Light/Dark hoàn chỉnh; index `lesson(date, status)` tách sang issue #1053.

## Validation Log

### Session — 2026-11-28 (User Intake Decisions)
1. **Phạm vi:** Làm cả hai — bổ sung lưu ý vào Email khai giảng VÀ xây dựng cron tự động gửi email link buổi học trước 2 tiếng.
2. **Phạm vi hình thức lớp:** Chỉ áp dụng cho lớp `Online` (ẩn với lớp `Offline`).
3. **Vị trí trong Email khai giảng:** Khối lưu ý (callout) ngay dưới bảng thông tin lịch học.
4. **Đích link trong email nhắc trước 2 tiếng:** Gửi trực tiếp link Zoom buổi học (nút `Tham gia buổi học`) kèm link phụ tới trang chi tiết buổi học trên cổng học viên (`/classes/:classId/sessions/:date`), giữ nguyên rào 30 phút của cổng học viên (#840).
5. **Khi chưa có link Zoom lúc T-2h:** Bỏ qua không tạo bản ghi; nếu giáo viên bổ sung link trong khoảng `[T-2h, startMs)`, tick 10 phút kế tiếp tự động gửi.
6. **Kênh gửi:** Chỉ gửi Email (`channels: "email"`), giống `daily_deadline_reminder`, không tạo mục in-app.

### Verification Results
- **Tier:** Light (2 phases — source claims checked directly against files)
- **Claims verified:**
  - `packages/api/src/class-opening-email.ts:273-549` (`renderClassOpeningEmail`, `detailTableRowsHtml`, `teacherNoteHtml`, `ctaHtml`, dark CSS rules) — VERIFIED
  - `packages/api/src/contracts.ts:4864-4903` (`NOTIFICATION_EVENT_TYPES`, `NOTIFICATION_EVENT_GROUP_BY_TYPE`) — VERIFIED
  - `packages/api/src/zoom-window.ts:69-78` (`isValidZoomJoinUrl`) — VERIFIED
  - `packages/api/src/vietnam-date.ts:8-134` (`vietnamTodayISO`, `addDaysISO`, `vietnamDateTimeMs`, `vietnamSessionEndMs`, `formatVietnamTimeHHMM`, `formatViDateDisplay`, `formatViWeekdayDate`) — VERIFIED
  - `apps/server/src/lib/notifications/templates.ts:16-39, 464-523` (`NotificationEvent`, `dailyDeadlineReminderEvent`) — VERIFIED
  - `apps/server/src/lib/notifications/daily-deadline-reminder.ts:41-369` (`runDailyDeadlineReminderCron`, 2-phase enqueue + sequential paced delivery) — VERIFIED
  - `apps/server/src/lib/scheduled.ts:72-122` (`dispatchScheduledCron`) — VERIFIED
  - `apps/server/src/routes/kernel.ts:4503-4546` (manual `class_session` creation materializes `lesson` rows for all `active` enrollments) — VERIFIED
  - `apps/web/src/routes/_auth/notifications/index.tsx:116-127` (`EVENT_TYPE_LABELS`) — VERIFIED
  - `scripts/topology-drift.test.mjs:550-585` (`crons: ["*/10 * * * *"]` assertion) — VERIFIED
  - `docs/production-release-runbook.md:696, 1030-1032` — VERIFIED

## Red Team Review

### Session — 2026-11-28
**Findings:** 5 deduplicated (1 High, 3 Medium, 1 Low) — all 5 accepted into design:
1. **[High] Missing Zoom link at T-2h:** Creating a failed/skipped `notification_record` at T-2h would block `NOT EXISTS` / `idempotencyKey` if the teacher adds a Zoom link at T-1h30. **Resolution:** Skip without inserting any `notification_record` when neither `lesson.zoom` nor `class_session_meeting.join_url` is a valid `https://` URL.
2. **[Medium] `getMailer()` invoked on idle 10-minute ticks:** Calling `resolveMailer` unconditionally inside `dispatchScheduledCron` every 10 minutes logs `[mail] MAILER is in LOG-ONLY mode` or throws when `MAILER_IMPL=resend` lacks key even with 0 emails to send. **Resolution:** Pass a lazy `getMailer` callback into `runSessionLinkReminderCron` and only call it when `queuedByOrg` has `queuedEmailIds.length > 0`.
3. **[Medium] Midnight-crossing sessions (`00:00–01:59` VN):** Querying only `lesson.date = todayISO` misses a `00:30` session whose `T-2h` window starts at `22:30` the previous evening. **Resolution:** Query `inArray(lesson.date, [todayISO, tomorrowISO])` and validate exact `date === parseStartDateStrict(date)` before `evaluateSessionLinkReminderWindow`.
4. **[Medium] Rescheduled session time/date:** Keying `idempotencyKey` only by `(classId, date, studentId)` would prevent sending the updated Zoom/time notice if a teacher changes the session time on the same day. **Resolution:** Key `idempotencyKey` by `session_link_reminder:${classId}:${dateISO}:${time}:${studentId}` and match the exact key in the SQL `NOT EXISTS` filter.
5. **[Low] `scheduled.test.ts` uses `fakeDb = {} as Db`:** Adding `executeSessionLinkReminder` unconditionally to `*/10 * * * *` breaks existing tests in `scheduled.test.ts` unless they supply a `runSessionLinkReminder` mock. **Resolution:** Update existing `ZOOM_RECORDING_SYNC_CRON` cases in `scheduled.test.ts` with `runSessionLinkReminder` mocks and add dedicated ordering/isolation tests.

### Code Review Dispositions (ad7695ab)
- **Important #1 (`lesson(date, status)` index):** Tách sang follow-up issue #1053 để tránh đụng số thứ tự migration `0100` giữa `develop` và `main` khi cherry-pick.
- **Important #2 (`isValidZoomJoinUrl` control chars):** Đã thêm `hasControlChars` trong `packages/api/src/zoom-window.ts` + test.
- **Important #3 (`joinUrl` replacement):** Giữ nguyên khóa per-slot `(classId, dateISO, time, studentId)` để bảo đảm 0-write SQL idempotency qua 12 tick.
- **Important #4 (error propagation):** `runSessionLinkReminderCron` cô lập lỗi giữa các org nhưng ném lại `firstError` cho `dispatchScheduledCron`.
- **Minor #1, #2, #4:** Đã sửa `orgsProcessed`, cập nhật câu `intro` khi thiếu `joinUrl`, và bổ sung test lớp `manual`, pacing đa org, cô lập lỗi.

<!-- slug: online-session-link-email -->
