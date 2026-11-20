---
phase: 1
title: "DB, contracts và cấu hình Zoom"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: DB, contracts và cấu hình Zoom

## Goal

Bảng `class_session_meeting` chỉ còn cột Zoom, contracts `@teacher-os/api` mô tả Zoom thay Google Meet, và Worker nhận được 4 biến cấu hình Zoom.

## Context

- Chưa có dòng Meet nào trên production — thực ra production còn **chưa có bảng** này (migration `0078` của #816 mới ở `develop`, chưa lên `main`). Được phép bỏ cột Google, không cần chuyển dữ liệu.
- `drizzle-kit generate` hỏi tương tác "cột này là đổi tên từ cột kia?" khi cùng lúc thêm và bỏ cột trong một bảng. Để tránh prompt, tách thành **hai lần generate**: lần 1 chỉ bỏ cột, lần 2 chỉ thêm cột.
- Cột `google_owner_user_id` có FOREIGN KEY tới `user`, nên ở lần 1 drizzle-kit sẽ **dựng lại bảng** (`PRAGMA foreign_keys=OFF; CREATE TABLE __new_class_session_meeting …; INSERT … SELECT …; DROP TABLE …; ALTER TABLE … RENAME …`) thay vì sinh `DROP COLUMN`. Đó là hành vi đúng (tiền lệ: `0073_shocking_absorbing_man.sql`), không phải lỗi.
- Migration mới nhất hiện có: `packages/db/src/migrations/0079_parallel_midnight.sql`. Hai migration mới sẽ là `0080_*` và `0081_*` (đuôi tên do drizzle-kit tự sinh).
- Không làm tự điểm danh qua Zoom (người dùng quyết định giáo viên tự điểm danh) → không có cột/kiểu participants.

## Files to Create / Modify

- Modify: `packages/db/src/schema/class-session-meeting.ts`
- Create (generated): `packages/db/src/migrations/0080_*.sql`, `packages/db/src/migrations/0081_*.sql`, cập nhật `packages/db/src/migrations/meta/*`
- Modify: `packages/api/src/contracts.ts` (khối từ `GOOGLE_MEET_SCOPES` đến `sessionRecordingUpdateSchema`, cùng `studentNextSessionSchema`, `studentClassLessonSchema`, mọi schema có field `meetUrl`)
- Modify: `packages/infra/alchemy.run.ts` (khối `env` của `Cloudflare.Worker("server", …)`)
- Modify: `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml` (khối env đang có `GOOGLE_CLIENT_SECRET`)

## Tasks

### Task 1.1 — Migration bước 1: bỏ cột Google và `meet_url`
- Goal: DB không còn cột Google/`meet_url`/`recording_file_id`.
- Target files: `packages/db/src/schema/class-session-meeting.ts` (bảng `classSessionMeeting`).
- Steps:
  1. Xoá các field: `meetUrl`, `googleCalendarEventId`, `googleMeetSpaceName`, `googleMeetCode`, `googleOwnerUserId`, `recordingFileId`. Xoá import `user` (không còn dùng).
  2. Chạy `pnpm --filter @teacher-os/db db:generate`.
- Success criteria: có đúng một file `0080_*.sql`; file đó dựng lại bảng `class_session_meeting` (hoặc dùng `DROP COLUMN`) và không còn nhắc tới cột cũ nào.
- Verify: `ls packages/db/src/migrations/0080_*.sql | wc -l` in `1`; `grep -cE "__new_class_session_meeting|DROP COLUMN" packages/db/src/migrations/0080_*.sql` in số ≥ 1; `grep -cE "google_|meet_url|recording_file_id" packages/db/src/migrations/0080_*.sql` in `0`.

### Task 1.2 — Migration bước 2: thêm cột Zoom
- Goal: bảng có cột Zoom.
- Target files: `packages/db/src/schema/class-session-meeting.ts`.
- Steps:
  1. Thêm các field (giữ nguyên `id`, `orgId`, `classId`, `date`, `recordingUrl`, `recordingStatus`, `recordingError`, `recordingSyncedAt`, `createdAt`, `updatedAt`, mọi index):
     - `joinUrl: text("join_url").notNull().default("")`
     - `zoomMeetingId: text("zoom_meeting_id")` — ID số của Zoom, lưu dạng chuỗi.
     - `recordingPassword: text("recording_password")`
  2. Sửa JSDoc đầu bảng: "Zoom meeting & cloud recording cho một buổi học `(classId, date)`. `joinUrl` được mirror vào `class_session.zoom` / `lesson.zoom` để biến nhắc lịch `{{zoom_link}}` dùng tiếp."
  3. Chạy `pnpm --filter @teacher-os/db db:generate`.
- Success criteria: có file `0081_*.sql` chỉ chứa 3 lệnh thêm cột trên.
- Verify: `grep -c "ADD \`" packages/db/src/migrations/0081_*.sql` in `3`; `pnpm --filter @teacher-os/db test` exit 0.

### Task 1.3 — Contracts Zoom
- Goal: `@teacher-os/api` không còn kiểu Google Meet; có kiểu Zoom tương đương.
- Target files: `packages/api/src/contracts.ts`.
- Steps:
  1. Xoá `GOOGLE_MEET_SCOPES`, `GOOGLE_MEET_ERROR_CODES`, `googleIntegrationStatusSchema`, `GoogleIntegrationStatus`.
  2. Thêm:
     ```ts
     export const ZOOM_ERROR_CODES = {
       NOT_CONFIGURED: "ZOOM_NOT_CONFIGURED",
       API_ERROR: "ZOOM_API_ERROR",
       RATE_LIMITED: "ZOOM_RATE_LIMITED",
     } as const;
     ```
  3. `KernelSessionMeetingRow`: đổi `meetUrl` → `joinUrl`; bỏ `googleCalendarEventId`, `googleMeetCode`; thêm `zoomMeetingId: string | null`, `recordingPassword: string | null`.
  4. `sessionMeetCreateResponseSchema` → đổi tên `sessionZoomCreateResponseSchema` với `{ joinUrl: z.string(), zoomMeetingId: z.string().nullable(), warning: z.string().nullable().optional() }`; type `SessionZoomCreateResponse`. Đổi tên `classMeetBulkCreateResponseSchema` → `classZoomBulkCreateResponseSchema` (giữ shape), type `ClassZoomBulkCreateResponse`.
  5. `sessionRecordingSyncResponseSchema`: thêm `recordingPassword: z.string().nullable().optional()`.
  6. Ở `studentNextSessionSchema`, `studentClassLessonSchema` và mọi schema khác có `meetUrl` (tìm bằng `grep -n "meetUrl" packages/api/src/contracts.ts`): đổi `meetUrl` → `joinUrl`; ở `studentClassLessonSchema` thêm `recordingPassword: z.string().nullable().optional()`.
  7. Sửa comment của `sessionMeetings` trong type snapshot thành "Metadata Zoom & recording theo buổi (classId, date)".
  8. **Không** sửa `packages/api/src/lead-contracts.ts` (chữ "Google Meet" trên form landing được giữ nguyên theo quyết định người dùng).
- Success criteria: `grep -n "GOOGLE_MEET\|meetUrl\|googleMeet" packages/api/src/contracts.ts` không in gì.
- Verify: `grep -c "GOOGLE_MEET\|meetUrl\|googleMeet" packages/api/src/contracts.ts` in `0`; `pnpm --filter @teacher-os/api test` exit 0. (Typecheck toàn repo sẽ đỏ cho tới hết phase 4 — đó là dự kiến; **không** chạy `pnpm check-types` ở phase này.)

### Task 1.4 — Cấu hình Worker và deploy
- Goal: Worker nhận `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_HOST_USER`, đều tuỳ chọn.
- Target files: `packages/infra/alchemy.run.ts`, `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml`.
- Steps:
  1. Trong `env` của Worker `server`, ngay dưới `GOOGLE_CLIENT_SECRET`, thêm đúng nguyên văn:
     ```ts
     // Zoom Server-to-Server OAuth. Rỗng ⇒ tính năng Zoom tắt (ZOOM_NOT_CONFIGURED).
     // Plain string vì redacted không combine được với withDefault (cùng mẫu RESEND_API_KEY).
     ZOOM_ACCOUNT_ID: Config.String("ZOOM_ACCOUNT_ID").pipe(Config.withDefault("")),
     ZOOM_CLIENT_ID: Config.String("ZOOM_CLIENT_ID").pipe(Config.withDefault("")),
     ZOOM_CLIENT_SECRET: Config.String("ZOOM_CLIENT_SECRET").pipe(Config.withDefault("")),
     ZOOM_HOST_USER: Config.String("ZOOM_HOST_USER").pipe(Config.withDefault("me")),
     ```
  2. Trong hai workflow, ở cùng khối env chứa `GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}`, thêm:
     ```yaml
     ZOOM_ACCOUNT_ID: ${{ secrets.ZOOM_ACCOUNT_ID }}
     ZOOM_CLIENT_ID: ${{ secrets.ZOOM_CLIENT_ID }}
     ZOOM_CLIENT_SECRET: ${{ secrets.ZOOM_CLIENT_SECRET }}
     ZOOM_HOST_USER: ${{ vars.ZOOM_HOST_USER }}
     ```
  3. Giữ nguyên `GOOGLE_CLIENT_ID/SECRET` (đăng nhập Google vẫn cần).
- Success criteria: 4 key xuất hiện trong alchemy và mỗi workflow.
- Verify: `pnpm --filter @teacher-os/infra check-types` exit 0; `grep -c "ZOOM_" .github/workflows/deploy.yml` in `4` và `grep -c "ZOOM_" .github/workflows/deploy-staging.yml` in `4`.

## Rollback

Xoá hai file migration mới và revert snapshot bằng `git checkout -- packages/db/src/migrations/meta`. Chưa deploy thì không có rollback DB.

## Security

`ZOOM_CLIENT_SECRET` là String (vì cần default rỗng) nhưng không bao giờ được log hay trả về trong response.

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
