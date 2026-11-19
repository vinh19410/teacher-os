---
phase: 3
title: "Service, routes, cron; gỡ Google Meet"
status: pending
priority: P1
effort: "1d"
dependencies: [1, 2]
---

# Phase 3: Service, routes, cron; gỡ Google Meet

## Goal

Server tạo/sửa/xoá Zoom meeting theo buổi và đồng bộ recording (cron + nút tay) qua đúng các điểm gọi mà Google Meet đang dùng; mọi code Google Calendar/Meet/Drive trong server, auth và E2E boot bị xoá.

## Context

- Service hiện tại: `apps/server/src/lib/google-meet/session-meet-service.ts` (1236 dòng). **Giữ nguyên logic**: `deriveScheduledOccurrences`, `resolveTimingFromRows`, `resolveOccurrenceTiming`, `mirrorMeetUrlToSessionRows`, vòng claim-chống-race trong `ensureSessionMeeting`, hằng `MAX_AUTO_PROVISION_ON_CREATE = 5`, `MAX_BULK_CREATE_PER_CALL = 12`, `MAX_CRON_*`, `CRON_*`.
- **Bỏ**: mọi thứ dùng `GoogleWorkspaceClient`, `resolveOrgTeacherUserId`, `loadActiveClassStudentEmails`, `syncCalendarAttendeesForClass` (Zoom không có danh sách khách mời), chia sẻ Drive.
- Không làm tự điểm danh qua Zoom (quyết định người dùng).
- Điểm gọi service ngoài file (số dòng gần đúng; luôn `grep -n` trước khi sửa):
  - `apps/server/src/routes/kernel.ts`: import ~90–95 và ~152; gọi ~760, ~1783, ~1842 (`syncCalendarAttendeesForClass`), ~2111 (`autoProvisionMeetingsForNewClass`), ~2719/~2725, ~2830, ~3196, ~3476 (`ensureSessionMeeting`), ~3659, ~3733; type `getGoogleWorkspaceClient` ~204.
  - `apps/server/src/routes/holidays.ts`: import ~33–41; gọi ~686, ~694, ~1082.
  - `apps/server/src/routes/student.ts`: import ~81, ~98; type ~130; gọi `syncCalendarAttendeesForClass` ~1465; đọc `classSessionMeeting.meetUrl` ~1193, ~1308.
  - `apps/server/src/routes/student-class.ts` ~127; `enrollment-activation.ts` ~495; `snapshot.ts` ~450 và ~887.
  - `apps/server/src/app.ts` ~14, ~25, ~205–213, ~504; `apps/server/src/index.ts` ~185–210.
  - `apps/e2e/src/boot.ts` ~25–26, ~203, ~224–225, ~352–380; `apps/e2e/src/account-seed.ts` ~4. Phải sửa ở phase này, nếu không `pnpm --filter e2e check-types` sẽ đỏ vì import file đã xoá.

## Files to Create / Modify / Delete

- Move + rewrite: `apps/server/src/lib/google-meet/session-meet-service.ts` → `apps/server/src/lib/zoom/session-zoom-service.ts`
- Move + rewrite: `apps/server/src/routes/google-meet.ts` → `apps/server/src/routes/zoom-meeting.ts`
- Move + rewrite: `apps/server/src/routes/google-meet.test.ts` → `apps/server/src/routes/zoom-meeting.test.ts`
- Delete: `apps/server/src/lib/google-meet/google-workspace-client.ts`, `google-oauth.ts`, `fake-client.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/src/index.ts`, `apps/server/src/routes/kernel.ts`, `holidays.ts`, `student.ts`, `student-class.ts`, `enrollment-activation.ts`, `snapshot.ts`, `apps/server/src/auth-role-roundtrip.test.ts`
- Modify: `packages/auth/src/index.ts`, `packages/auth/src/auth-google-link.test.ts`
- Modify: `apps/e2e/src/boot.ts`, `apps/e2e/src/account-seed.ts`

## Tasks

### Task 3.1 — Di chuyển file bằng git
- Steps:
  1. `mkdir -p apps/server/src/lib/zoom` (đã có từ phase 2).
  2. `git mv apps/server/src/lib/google-meet/session-meet-service.ts apps/server/src/lib/zoom/session-zoom-service.ts`
  3. `git mv apps/server/src/routes/google-meet.ts apps/server/src/routes/zoom-meeting.ts`
  4. `git mv apps/server/src/routes/google-meet.test.ts apps/server/src/routes/zoom-meeting.test.ts`
  5. `git rm apps/server/src/lib/google-meet/google-workspace-client.ts apps/server/src/lib/google-meet/google-oauth.ts apps/server/src/lib/google-meet/fake-client.ts`
- Verify: `ls apps/server/src/lib/google-meet 2>&1` in chuỗi chứa `No such file or directory`.

### Task 3.2 — Viết lại service sang Zoom
- Goal: `session-zoom-service.ts` chỉ phụ thuộc `ZoomClient`.
- Target files: `apps/server/src/lib/zoom/session-zoom-service.ts`.
- Steps:
  1. `GoogleMeetServiceDeps` → `ZoomServiceDeps { db: Db; zoom?: ZoomConfig; fetchFn?: FetchFn; getZoomClient?: () => ZoomClient; now?: () => Date }`. Hàm nội bộ `resolveZoomClient(deps)` = `deps.getZoomClient ? deps.getZoomClient() : createZoomClient(deps.zoom ?? {}, deps.fetchFn)`.
  2. Đổi tên hàm export:
     - `mirrorMeetUrlToSessionRows` → `mirrorJoinUrlToSessionRows`
     - `ensureSessionMeeting`, `autoProvisionMeetingsForNewClass`, `bulkCreateMeetingsForClass` → giữ tên, **bỏ** `actorUserId` khỏi input
     - `syncCalendarOnSessionEdit` → `syncZoomOnSessionEdit`
     - `syncCalendarOnSessionCancelOrDelete` → `syncZoomOnSessionCancelOrDelete`
     - `syncRecordingForOccurrence`, `runRecordingSyncCron`, `updateSessionRecordingManual` → giữ tên (bỏ `actorUserId`/`cachedClient` kiểu Google; `cachedClient?: ZoomClient` nếu cần)
     - Xoá `syncCalendarAttendeesForClass`, `resolveOrgTeacherUserId`, `loadActiveClassStudentEmails`, `buildCalendarSummary`. Thêm `buildMeetingTopic(className, topic)` trả `` `${className} — ${topic}` `` hoặc `className` khi topic rỗng.
  3. `ensureSessionMeeting`: thay `createCalendarEventWithMeet` + `configureMeetSpace` bằng `client.createMeeting({ topic: buildMeetingTopic(timing.className, timing.topic), agenda: \`Buổi học lớp ${timing.className} (${input.dateISO} ${timing.time})\`, dateISO: input.dateISO, time: timing.time, durMinutes: timing.dur })`. Lưu `joinUrl`, `zoomMeetingId`, `recordingStatus: "pending"`. Giữ nguyên vòng claim-chống-race; khi mất race, gọi `client.deleteMeeting(created.meetingId)` cho meeting vừa tạo thừa trong `try/catch` + `console.warn("[zoom] delete duplicate meeting failed", …)`. Mọi thông báo lỗi đổi "Google Meet" → "Zoom". Response: `{ joinUrl, zoomMeetingId, warning: null }`.
  4. `syncZoomOnSessionEdit`: giữ phần cập nhật DB (dời ngày; `input.zoom` ghi đè `joinUrl`). Thay `patchCalendarEvent` bằng `client.updateMeeting(meeting.zoomMeetingId, { topic, agenda, dateISO: input.newDateISO, time, durMinutes })` khi `meeting.zoomMeetingId` có giá trị. Lỗi Zoom chỉ `console.warn("[zoom] updateMeeting failed", …)`.
  5. `syncZoomOnSessionCancelOrDelete`: nếu có `zoomMeetingId` → `client.deleteMeeting(...)` trong try/catch. Nếu không xoá dòng thì set `zoomMeetingId: null`, `joinUrl: ""`, `recordingStatus: meeting.recordingUrl ? "ready" : "none"` và gọi `mirrorJoinUrlToSessionRows(..., "")`.
  6. `syncRecordingForOccurrence`: "chưa có meeting" khi `!meeting?.zoomMeetingId` → ném `ZoomIntegrationError(API_ERROR, "Buổi học này chưa có Zoom meeting được tạo qua hệ thống.", 404)`. Gọi `client.getRecording(zoomMeetingId)`:
     - `ready` → set `recordingUrl: shareUrl`, `recordingPassword: password`, `recordingStatus: "ready"`, `recordingError: null`, `recordingSyncedAt: now`; trả `{ status: "ready", recordingUrl, recordingPassword, syncedAt, message: null }`.
     - `pending` / `missing` → set `recordingStatus: "pending"`, `recordingSyncedAt: now`; message `"Recording chưa sẵn sàng trên Zoom. Hệ thống sẽ tiếp tục kiểm tra định kỳ."`.
     - Xoá mọi phần chia sẻ Drive.
  7. `runRecordingSyncCron`: nếu `!isZoomConfigured(deps.zoom) && !deps.getZoomClient` → trả `{ checked: 0, updated: 0, failed: 0 }` ngay, không ném. Select `zoomMeetingId` thay cột Google; `eligible` lọc `Boolean(row.zoomMeetingId)`; dùng một client cho cả tick. Giữ quy tắc chuyển `failed` sau `CRON_MAX_AFTER_END_MS`, với `recordingError: "Không tìm thấy cloud recording trên Zoom sau 72 giờ (có thể hết dung lượng cloud hoặc buổi không được ghi)."`.
  8. `updateSessionRecordingManual`: khi giáo viên nhập link tay, set `recordingPassword: null`.
- Verify: `grep -ci "google" apps/server/src/lib/zoom/session-zoom-service.ts` in `0`.

### Task 3.3 — Route Zoom
- Target files: `apps/server/src/routes/zoom-meeting.ts`.
- Steps:
  1. `GoogleMeetRouteDeps` → `ZoomRouteDeps = Pick<AppDeps, "getDb" | "runInBackground" | "zoom" | "zoomFetch" | "getZoomClient">`; `googleMeetDepsFrom` → `zoomDepsFrom` (trả `{ db, zoom: deps.zoom, fetchFn: deps.zoomFetch, getZoomClient: deps.getZoomClient }`); `isGoogleMeetEnabled` → `isZoomEnabled` (= `Boolean(deps.getZoomClient) || isZoomConfigured(deps.zoom)`); `runGoogleSyncTask` → `runZoomSyncTask` (log prefix `[zoom]`); `googleMeetRoutes` → `zoomMeetingRoutes`.
  2. Đường dẫn:
     - **Xoá** `GET /integrations/google/status` (không còn nơi dùng; không thay bằng route status Zoom).
     - `POST /classes/:classId/sessions/:date/meet` → `POST /classes/:classId/sessions/:date/zoom`.
     - `POST /classes/:classId/meet/bulk` → `POST /classes/:classId/zoom/bulk`.
     - Route recording (`…/recording/sync`, `…/recording`) giữ nguyên đường dẫn.
  3. Lỗi: `ZoomIntegrationError` → `c.json({ error: err.message, code: err.code }, err.status)`. Khi `!isZoomEnabled(deps)` các route tạo/đồng bộ trả 503 `{ error: "Chưa cấu hình Zoom cho hệ thống.", code: "ZOOM_NOT_CONFIGURED" }`.
- Verify: no verification needed (Task 3.8).

### Task 3.4 — Wiring app và cron
- Target files: `apps/server/src/app.ts`, `apps/server/src/index.ts`.
- Steps:
  1. `app.ts`: thay `googleFetch` và `getGoogleWorkspaceClient` bằng `zoom?: ZoomConfig; zoomFetch?: typeof fetch; getZoomClient?: () => ZoomClient;` (comment: "Zoom Server-to-Server OAuth; test/E2E inject fake client"). Giữ `googleClientId/googleClientSecret` (đăng nhập Google). Sửa comment của chúng thành "Google OAuth cho đăng nhập". `app.route("/api", zoomMeetingRoutes(deps))`.
  2. `index.ts`: tạo `const zoomConfig = { accountId: env.ZOOM_ACCOUNT_ID, clientId: env.ZOOM_CLIENT_ID, clientSecret: env.ZOOM_CLIENT_SECRET, hostUser: env.ZOOM_HOST_USER || "me" }`; truyền `zoom: zoomConfig` vào app deps; `scheduled()` gọi `runRecordingSyncCron({ db, zoom: zoomConfig })`, log lỗi `"[zoom] recording sync cron failed"`. Nếu `env.ZOOM_*` báo lỗi kiểu, khai báo vào đúng type env mà `GOOGLE_CLIENT_ID` đang được khai (tìm bằng `grep -rn "GOOGLE_CLIENT_ID" apps/server/src packages/env/src`).
- Verify: no verification needed (Task 3.9).

### Task 3.5 — Cập nhật các route gọi service
- Target files: `kernel.ts`, `holidays.ts`, `student.ts`, `student-class.ts`, `enrollment-activation.ts`, `snapshot.ts` trong `apps/server/src/routes/`.
- Steps:
  1. Đổi import sang `../lib/zoom/session-zoom-service` và `./zoom-meeting`; đổi tên hàm theo Task 3.2/3.3.
  2. Xoá **toàn bộ** lời gọi `syncCalendarAttendeesForClass` (kernel ~760, ~1783, ~1842, ~2725; student ~1465) cùng khối `runGoogleSyncTask` bao quanh nếu khối đó chỉ chứa lời gọi này.
  3. Bỏ đối số `actorUserId` ở các lời gọi `ensureSessionMeeting` / `autoProvisionMeetingsForNewClass` / `bulkCreateMeetingsForClass`.
  4. Đổi `classSessionMeeting.meetUrl` → `classSessionMeeting.joinUrl`, field response `meetUrl` → `joinUrl`; ở `student.ts` và `student-class.ts` thêm `recordingPassword` vào select và response bài học.
  5. `snapshot.ts` (~887): map sang `KernelSessionMeetingRow` mới (`joinUrl`, `zoomMeetingId`, `recordingPassword`, giữ các field recording).
  6. Type `getGoogleWorkspaceClient` ở `kernel.ts` (~204) và `student.ts` (~130) → `getZoomClient?: () => ZoomClient`.
- Verify: `grep -rliE "google-meet|googleMeet|GoogleWorkspace|syncCalendar|meetUrl" apps/server/src | wc -l` in `0` (lệnh quét cả file `*.test.ts`; test cũ sẽ được viết lại ở Task 3.8 — nếu còn file test khác ngoài `zoom-meeting.test.ts` khớp, sửa luôn trong task này).

### Task 3.6 — Gỡ quyền Google Meet khỏi auth
- Target files: `packages/auth/src/index.ts`, `packages/auth/src/auth-google-link.test.ts`, `apps/server/src/auth-role-roundtrip.test.ts`.
- Steps:
  1. `packages/auth/src/index.ts` trong `socialProviders.google`: xoá `accessType: "offline"` và comment về Google Meet/refresh token ngay trên nó (~212–213); đổi `prompt: "select_account consent"` → `prompt: "select_account"`, giữ comment về màn chọn tài khoản.
  2. `apps/server/src/auth-role-roundtrip.test.ts` (~222–228): đổi assert thành `expect(authorize.searchParams.get("prompt")).toBe("select_account");` và xoá phần comment nói về `consent`/#816.
  3. `packages/auth/src/auth-google-link.test.ts`: xoá các ca kiểm scope Calendar/Meet/Drive và refresh token phục vụ Meet; giữ ca liên kết/đăng nhập Google. Nếu cả file chỉ test scope Meet thì `git rm` file.
- Verify: `pnpm --filter @teacher-os/auth test` exit 0; `grep -rn "googleapis.com/auth" packages/auth packages/api apps/server apps/e2e --include=*.ts | wc -l` in `0` (web được dọn ở phase 4).

### Task 3.7 — E2E boot dùng fake Zoom
- Target files: `apps/e2e/src/boot.ts`, `apps/e2e/src/account-seed.ts`.
- Steps:
  1. Thay import `createFakeGoogleWorkspace` / `runRecordingSyncCron` cũ bằng `import { createFakeZoom } from "server/lib/zoom/fake-zoom-client"` và `import { runRecordingSyncCron } from "server/lib/zoom/session-zoom-service"`; `const fakeZoom = createFakeZoom()`; truyền `getZoomClient: () => fakeZoom.client` vào app deps thay `getGoogleWorkspaceClient`.
  2. Route `/__e2e/google-meet-recording` → `/__e2e/zoom-recording` (body `{ ready: boolean }` → `fakeZoom.setRecordingReady`).
  3. `/__e2e/run-recording-cron` gọi `runRecordingSyncCron({ db, getZoomClient: () => fakeZoom.client, now })`, giữ cách route cũ nhận tham số `now` (nếu có).
  4. `account-seed.ts`: bỏ import `GOOGLE_MEET_SCOPES`; seed account Google với scope `"openid email profile"` và không có refresh token. Giữ tên hàm `seedGoogleAccount`.
- Verify: `grep -rn "google-meet\|GoogleWorkspace\|GOOGLE_MEET" apps/e2e/src | wc -l` in `0`.

### Task 3.8 — Test route Zoom
- Target files: `apps/server/src/routes/zoom-meeting.test.ts`.
- Steps: viết lại test trên `createFakeZoom()` (inject `getZoomClient: () => fake.client`), giữ helper dựng app/DB đang có trong file. Mỗi ca một `it`:
  1. Không cấu hình Zoom → `POST …/zoom` trả 503 `ZOOM_NOT_CONFIGURED`; `runRecordingSyncCron` trả `{ checked: 0, updated: 0, failed: 0 }` không ném.
  2. Tạo đơn lẻ → 200 có `joinUrl` bắt đầu `https://zoom.us/j/`; `class_session.zoom` (lớp manual) hoặc `lesson.zoom` (lớp auto) bằng `joinUrl`; gọi lại lần 2 không tạo meeting mới (`fake.calls` chỉ có 1 `create`).
  3. Bulk tạo tối đa 12 buổi.
  4. Dời buổi (sửa ngày) → `fake.calls` có `update`; dòng meeting đổi `date`.
  5. Dời buổi do nghỉ lễ (route trong `holidays.ts`) → `fake.calls` có `update`; dòng meeting chuyển sang ngày bù.
  6. Huỷ buổi → `fake.calls` có `delete`; `joinUrl` = `""`, `class_session.zoom` = `""`.
  7. Recording: `setRecordingReady(false)` → sync trả `pending`; `true` → `ready`, `recordingUrl` = share URL, `recordingPassword` = `"rec123"`.
  8. Cron chuyển `failed` kèm `recordingError` sau 72 giờ không có recording (`now` inject).
  9. Học viên (`/api/student/...`) thấy `joinUrl` và `recordingPassword`.
- Verify: `pnpm --filter server exec vitest run src/routes/zoom-meeting.test.ts` exit 0.

### Task 3.9 — Gate server + e2e typecheck
- Verify: lần lượt, mỗi lệnh exit 0:
  1. `pnpm --filter server test`
  2. `pnpm --filter server exec tsc --noEmit` (hoặc `pnpm --filter server check-types` nếu script đó tồn tại trong `apps/server/package.json`)
  3. `pnpm --filter e2e check-types`

## Risk

- Bỏ `syncCalendarAttendeesForClass` có thể làm rỗng một khối `runInBackground`; xoá cả khối thay vì để lại promise rỗng.
- 100 lệnh tạo/sửa mỗi ngày: không thêm vòng sửa hàng loạt nào ngoài giới hạn có sẵn.

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
