---
title: "Phase 2: Server Runtime Validation & Stop-Early"
status: done
priority: P1
---

# Phase 2: Server Runtime Validation & Stop-Early

## Goal
Thêm mã lỗi `ZOOM_INVALID_CONFIG`, validate `hostUser` trong `createMeeting()`, ánh xạ lỗi Zoom 404/`1001` sang thông báo hướng dẫn quản trị kiểm tra `ZOOM_HOST_USER`, và dừng sớm vòng lặp bulk/auto-provision khi cấu hình host sai.

## Target Files and Symbols
- `packages/api/src/contracts.ts` (`ZOOM_ERROR_CODES.INVALID_CONFIG`)
- `apps/server/src/index.ts` (`zoomConfig.hostUser`)
- `apps/server/src/lib/zoom/zoom-client.ts` (`isZoomConfigured`, `isValidRuntimeZoomHostUser`, `parseZoomError`, `createZoomClient`, `zoomFetch`, `createMeeting`)
- `apps/server/src/lib/zoom/session-zoom-service.ts` (`isFatalZoomConfigError`, `autoProvisionMeetingsForNewClass`, `bulkCreateMeetingsForClass`)
- `apps/server/src/lib/zoom/zoom-client.test.ts`
- `apps/server/src/routes/zoom-meeting.test.ts`

## Steps
1. **Task 2.1 — Thêm `INVALID_CONFIG` vào `ZOOM_ERROR_CODES`**
   - Goal: Có mã lỗi riêng `ZOOM_INVALID_CONFIG` tương thích ngược với UI hiện tại (UI chỉ kiểm `ZOOM_NOT_CONFIGURED`, các mã khác toast nguyên văn `err.message`).
   - Target files and symbols: `packages/api/src/contracts.ts` (`ZOOM_ERROR_CODES`).
   - Steps: Thêm `INVALID_CONFIG: "ZOOM_INVALID_CONFIG"` vào `ZOOM_ERROR_CODES`.
   - Success criteria: Contract compile bình thường, không phá schema cũ.
   - Verify: Chờ Task 2.5.

2. **Task 2.2 — Trim config và validate `hostUser` trong `createMeeting()` + ánh xạ 404/`1001`**
   - Goal: Chặn `hostUser` sai định dạng trước khi gọi mạng và dịch lỗi `404`/`1001` từ Zoom thành `ZOOM_INVALID_CONFIG` mà không làm hỏng `getRecording`/`updateMeeting`/`deleteMeeting`.
   - Target files and symbols: `apps/server/src/index.ts` (`zoomConfig`), `apps/server/src/lib/zoom/zoom-client.ts` (`isZoomConfigured`, `isValidRuntimeZoomHostUser`, `parseZoomError`, `zoomFetch`, `createMeeting`).
   - Steps:
     1. Trong `index.ts`: dùng `hostUser: env.ZOOM_HOST_USER?.trim() || "me"`.
     2. Trong `zoom-client.ts`: trim 3 trường trong `isZoomConfigured` và trong `createZoomClient`.
     3. Viết `isValidRuntimeZoomHostUser(value)` cho phép `"me"` (case-insensitive), email hợp lệ hoặc Zoom User ID `16..64` ký tự `[A-Za-z0-9_-]`.
     4. Thay `readErrorMessage` bằng `parseZoomError` trả `{ code?: number; message: string }` (dùng cả trong `getToken()` và `zoomFetch`).
     5. Trong `createMeeting()`: kiểm `isValidRuntimeZoomHostUser(rawHostUser)` trước khi gọi `zoomFetch`; nếu sai ném `ZoomIntegrationError(ZOOM_ERROR_CODES.INVALID_CONFIG, ..., 503)`. Khi gọi `zoomFetch("/users/.../meetings", ..., false, { mapUserNotFoundToInvalidConfig: true })`, nếu HTTP 404 và `(code === 1001 || /user does not exist/i.test(message))` thì log `console.warn` và ném `ZoomIntegrationError(ZOOM_ERROR_CODES.INVALID_CONFIG, ..., 502)`. Không validate `hostUser` trong constructor `createZoomClient` và không ánh xạ 404 ở `updateMeeting`.
   - Success criteria: `createMeeting` fail nhanh 503 nếu `hostUser` là `"Ms My"`, dịch 404/`1001` thành 502 `ZOOM_INVALID_CONFIG`, trong khi `getRecording`/`updateMeeting`/`deleteMeeting` hoạt động bình thường.
   - Verify: Chờ Task 2.4.

3. **Task 2.3 — Dừng sớm vòng lặp ở `session-zoom-service.ts`**
   - Goal: Tránh lặp 5 hoặc tới 50+ subrequest vô ích khi `ZOOM_INVALID_CONFIG`.
   - Target files and symbols: `apps/server/src/lib/zoom/session-zoom-service.ts` (`isFatalZoomConfigError`, `autoProvisionMeetingsForNewClass`, `bulkCreateMeetingsForClass`).
   - Steps:
     1. Thêm `isFatalZoomConfigError(err)` kiểm `err instanceof ZoomIntegrationError && err.code === ZOOM_ERROR_CODES.INVALID_CONFIG`.
     2. Trong `autoProvisionMeetingsForNewClass`: gặp `isFatalZoomConfigError(err)` thì log `console.warn` và `return`.
     3. Trong `bulkCreateMeetingsForClass`: đặt cờ dừng vòng lặp (`stopRemaining = true`) khi `isDailyQuotaError(err) || isFatalZoomConfigError(err)`, tăng `skipped` cho các buổi còn lại.
   - Success criteria: Cả hai luồng chỉ gọi `createMeeting` đúng 1 lần khi `hostUser` lỗi.
   - Verify: Chờ Task 2.5.

4. **Task 2.4 — Bổ sung test trong `apps/server/src/lib/zoom/zoom-client.test.ts`**
   - Goal: Phủ hết các nhánh mới của `zoom-client.ts`.
   - Target files and symbols: `apps/server/src/lib/zoom/zoom-client.test.ts`.
   - Steps: Viết test cho `isZoomConfigured` whitespace, `createMeeting` từ chối `"Ms My"`/`"MsMy"`/`"Ms My <a@b.com>"` với 0 fetch call, trim email/`"ME"`/22-char ID, 404+`1001` → `ZOOM_INVALID_CONFIG`, `updateMeeting` 404+`3001` → `ZOOM_API_ERROR`, và `getRecording`/`deleteMeeting`/`updateMeeting` không bị chặn khi `hostUser` sai.
   - Success criteria: `zoom-client.test.ts` pass 100%.
   - Verify: `pnpm --filter server exec vitest run src/lib/zoom/zoom-client.test.ts` exit 0.

5. **Task 2.5 — Bổ sung test trong `apps/server/src/routes/zoom-meeting.test.ts`**
   - Goal: Phủ route `POST /api/classes/:id/sessions/:date/zoom` trả 503 `ZOOM_INVALID_CONFIG` và `autoProvisionMeetingsForNewClass` + `bulkCreateMeetingsForClass` dừng sau 1 lần gọi.
   - Target files and symbols: `apps/server/src/routes/zoom-meeting.test.ts`.
   - Steps: Bổ sung test dùng `zoom: { accountId, clientId, clientSecret, hostUser: "Ms My" }` và mock `ZoomClient` ném `ZOOM_INVALID_CONFIG`.
   - Success criteria: Toàn bộ `zoom-client.test.ts` và `zoom-meeting.test.ts` pass.
   - Verify: `pnpm --filter server exec vitest run src/lib/zoom/zoom-client.test.ts src/routes/zoom-meeting.test.ts` exit 0.

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
