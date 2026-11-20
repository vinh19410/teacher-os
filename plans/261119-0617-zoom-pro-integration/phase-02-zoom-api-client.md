---
phase: 2
title: "Zoom API client + fake"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Zoom API client + fake

## Goal

Có một `ZoomClient` gọi Zoom REST v2 bằng Server-to-Server OAuth (token cache trong isolate), và một fake client dùng chung cho unit test và E2E, không gọi mạng thật.

## Context (sự thật API đã kiểm)

- Token: `POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id={ZOOM_ACCOUNT_ID}`, header `Authorization: Basic base64(clientId:clientSecret)`. Trả `{ access_token, expires_in }` (≈3600 giây).
- Tạo meeting: `POST https://api.zoom.us/v2/users/{hostUser}/meetings` → 201 `{ id: number, join_url, password }`. `topic` tối đa 200 ký tự.
- Sửa: `PATCH /v2/meetings/{id}` → 204. Xoá: `DELETE /v2/meetings/{id}` → 204; 404 coi là đã xoá.
- Recording: `GET /v2/meetings/{id}/recordings` → `{ share_url, password, recording_files: [{ status: "completed" | "processing", file_type }] }`; 404 = chưa có recording. Gọi bằng ID số chỉ trả **phiên (instance) gần nhất** của meeting — giới hạn đã chấp nhận (xem Risk).
- Giới hạn: 100 lệnh **tạo/sửa** meeting mỗi ngày (reset 00:00 UTC = 07:00 giờ VN) cho mỗi host; vượt → HTTP 429 với message có chữ "daily". Zoom cũng trả 429 khi vượt giới hạn theo giây.
- Quyết định người dùng: học viên được vào phòng trước giáo viên. Nên `settings` đặt tường minh, không phụ thuộc mặc định của account: `{ auto_recording: "cloud", join_before_host: true, jbh_time: 0, waiting_room: false, meeting_authentication: false }`. Không bật registration.

## Files to Create / Modify

- Create: `apps/server/src/lib/zoom/zoom-client.ts`
- Create: `apps/server/src/lib/zoom/zoom-client.test.ts`
- Create: `apps/server/src/lib/zoom/fake-zoom-client.ts`

## Tasks

### Task 2.1 — Interface và lỗi
- Goal: kiểu dùng chung cho service.
- Target files: `apps/server/src/lib/zoom/zoom-client.ts`.
- Steps:
  1. Export `type FetchFn = typeof fetch`.
  2. Export `class ZoomIntegrationError extends Error` với constructor `(code: (typeof ZOOM_ERROR_CODES)[keyof typeof ZOOM_ERROR_CODES], message: string, status: number)`, lưu `code` và `status` thành field public (import `ZOOM_ERROR_CODES` từ `@teacher-os/api/contracts`).
  3. Export:
     ```ts
     export interface ZoomMeetingInput { topic: string; agenda: string; dateISO: string; time: string; durMinutes: number }
     export interface ZoomMeetingResult { meetingId: string; joinUrl: string }
     export type ZoomRecordingResult =
       | { status: "ready"; shareUrl: string; password: string | null }
       | { status: "pending" }
       | { status: "missing" };
     export interface ZoomClient {
       createMeeting(input: ZoomMeetingInput): Promise<ZoomMeetingResult>;
       updateMeeting(meetingId: string, input: ZoomMeetingInput): Promise<void>;
       deleteMeeting(meetingId: string): Promise<void>;
       getRecording(meetingId: string): Promise<ZoomRecordingResult>;
     }
     export interface ZoomConfig { accountId?: string; clientId?: string; clientSecret?: string; hostUser?: string }
     export function isZoomConfigured(cfg: ZoomConfig | undefined): boolean // true khi cả accountId, clientId, clientSecret khác rỗng
     ```
- Verify: no verification needed (Task 2.3 kiểm tra).

### Task 2.2 — Cài đặt `createZoomClient`
- Goal: client thật gọi Zoom.
- Target files: `apps/server/src/lib/zoom/zoom-client.ts` (function `createZoomClient(cfg: ZoomConfig, fetchFn: FetchFn = fetch): ZoomClient`).
- Steps:
  1. Nếu `!isZoomConfigured(cfg)` → ném `ZoomIntegrationError(NOT_CONFIGURED, "Chưa cấu hình Zoom (ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET).", 503)`.
  2. Token cache cấp module: `const tokenCache = new Map<string, { token: string; expiresAt: number }>()`, key = `${accountId}:${clientId}`. Dùng lại khi `expiresAt - 60_000 > Date.now()`. Base64 bằng `btoa`.
  3. Hàm nội bộ `zoomFetch(path, init)`: gắn `Authorization: Bearer <token>`, `Content-Type: application/json`. Nếu 401 thì xoá cache, lấy token mới, thử lại đúng 1 lần. Nếu 429: đọc body text; có chữ `daily` (không phân biệt hoa thường) → `ZoomIntegrationError(RATE_LIMITED, "Zoom đã chạm giới hạn 100 lần tạo/sửa meeting trong ngày. Thử lại sau 07:00 sáng (giờ VN).", 429)`; ngược lại → `ZoomIntegrationError(RATE_LIMITED, "Zoom đang giới hạn tần suất gọi API, thử lại sau ít phút.", 429)`. Status ≥ 400 khác → `ZoomIntegrationError(API_ERROR, "Zoom API lỗi <status>: <message từ body JSON nếu có>", 502)`.
  4. Body tạo/sửa: `{ topic: input.topic.slice(0, 200), agenda: input.agenda, type: 2, start_time: \`${dateISO}T${time}:00\`, timezone: "Asia/Ho_Chi_Minh", duration: durMinutes, settings: { auto_recording: "cloud", join_before_host: true, jbh_time: 0, waiting_room: false, meeting_authentication: false } }`. `hostUser` mặc định `"me"`, encode bằng `encodeURIComponent`.
  5. `createMeeting` trả `{ meetingId: String(body.id), joinUrl: body.join_url }`.
  6. `deleteMeeting`: 404 không ném lỗi.
  7. `getRecording`: 404 → `{ status: "missing" }`; có ít nhất một file `status === "completed"` và có `share_url` → `{ status: "ready", shareUrl: body.share_url, password: body.password || null }`; còn lại → `{ status: "pending" }`.
- Verify: xem Task 2.3.

### Task 2.3 — Unit test client
- Goal: chứng minh token cache, retry 401, 429, 404, body tạo meeting.
- Target files: `apps/server/src/lib/zoom/zoom-client.test.ts`.
- Steps: viết test Vitest với `fetchFn` giả (`vi.fn`) cho các ca, mỗi ca một `it`:
  1. Thiếu cấu hình → ném lỗi có `code === "ZOOM_NOT_CONFIGURED"`.
  2. Hai lần `createMeeting` liên tiếp chỉ gọi endpoint token 1 lần; body có `type: 2`, `timezone: "Asia/Ho_Chi_Minh"`, `start_time: "2026-12-01T19:30:00"`, `settings.auto_recording: "cloud"`, `settings.join_before_host: true`, `settings.waiting_room: false`.
  3. Topic dài 250 ký tự bị cắt còn 200.
  4. 401 lần đầu → lấy token mới, thử lại thành công.
  5. 429 có chữ "daily" → message chứa "100 lần"; 429 không có "daily" → message chứa "ít phút".
  6. `deleteMeeting` gặp 404 → không ném.
  7. `getRecording`: 404 → `missing`; file `processing` → `pending`; file `completed` → `ready` kèm `shareUrl`, `password`.
- Verify: `pnpm --filter server exec vitest run src/lib/zoom/zoom-client.test.ts` exit 0.

### Task 2.4 — Fake client
- Goal: thay `apps/server/src/lib/google-meet/fake-client.ts` cho test/E2E.
- Target files: `apps/server/src/lib/zoom/fake-zoom-client.ts`.
- Steps: export `createFakeZoom(): FakeZoomController` với:
  - `client: ZoomClient` — `createMeeting` trả `meetingId` tăng dần (`"900000001"`, `"900000002"`, …) và `joinUrl: "https://zoom.us/j/<id>"`; `updateMeeting`/`deleteMeeting` không làm gì ngoài ghi log.
  - `setRecordingReady(ready: boolean)` → `getRecording` trả `{ status: "ready", shareUrl: "https://zoom.us/rec/share/fake-<id>", password: "rec123" }` khi `true`, ngược lại `{ status: "pending" }`.
  - `calls: { method: "create" | "update" | "delete" | "recording"; meetingId?: string }[]` để test assert.
- Verify: `grep -ci "google" apps/server/src/lib/zoom/fake-zoom-client.ts` in `0`.

## Risk

- Giáo viên rớt mạng rồi mở lại phòng → Zoom tạo phiên mới; API chỉ trả recording của phiên cuối. Giới hạn đã chấp nhận ở bản đầu; ghi vào docs (phase 5).

## Security

Không log access token hay client secret. Thông báo lỗi chỉ chứa status và message của Zoom.

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
