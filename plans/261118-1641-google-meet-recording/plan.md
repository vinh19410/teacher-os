# Plan: Google Meet & Auto-Recording per Session (#816)

- **Issue:** [#816](https://github.com/vinh19410/teacher-os/issues/816)
- **Target branch:** `develop` (`--beta`)
- **Status:** In Progress

## Outcome & Scope
Tích hợp Google Calendar API, Google Meet REST API v2 và Google Drive API sử dụng tài khoản Google Workspace của giáo viên (OAuth offline `refresh_token`) để:
1. Mỗi buổi học Online có ngày cụ thể (`date != null`, cả `auto` và `manual` và buổi bù lễ) tự tạo sự kiện Google Calendar (mời học viên active) kèm phòng Google Meet (`OPEN` fallback `TRUSTED`, best-effort `autoRecordingGeneration: "ON"`), đồng thời hỗ trợ nút tạo Meet đơn lẻ & hàng loạt và đồng bộ khi sửa/huỷ/dời lễ buổi học.
2. Cloudflare Worker Cron (`*/10 * * * *`) và nút đồng bộ thủ công truy vấn Meet `conferenceRecords`/`recordings`, cấp quyền Drive `reader` cho email học viên lớp khi `FILE_GENERATED` và gán `recordingUrl` vào buổi học.
3. App giáo viên (`apps/web`) và cổng học viên (`apps/student`) hiển thị nút "Vào lớp (Google Meet)" và "Xem recording" đúng trạng thái và quyền truy cập.

## Phases & File Ownership

| Phase | Owner / Area | Files | Verification |
|---|---|---|---|
| 1 | DB, Auth & API Contracts | `packages/db/src/schema/class-session-meeting.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/migrations/0076_*`, `packages/auth/src/index.ts`, `packages/api/src/contracts.ts` | `pnpm --filter @teacher-os/db test`, `pnpm --filter @teacher-os/auth test`, `pnpm --filter @teacher-os/api test` |
| 2 | Server Google Workspace & Cron | `apps/server/src/lib/google-meet/*`, `apps/server/src/routes/google-meet.ts`, `apps/server/src/routes/kernel.ts`, `holidays.ts`, `enrollment-activation.ts`, `snapshot.ts`, `student.ts`, `student-class.ts`, `app.ts`, `index.ts`, `packages/infra/alchemy.run.ts` | `pnpm --filter server test`, `pnpm --filter @teacher-os/infra check-types` |
| 3 | Teacher UI & Student UI | `apps/web/src/components/profile/google-link-card.tsx`, `apps/web/src/lib/*`, `apps/web/src/components/schedule/*`, `apps/web/src/components/class-detail/*`, `apps/student/src/components/*` | `pnpm --filter web test`, `pnpm --filter student test` |
| 4 | E2E, Visual 3-Viewport & Ship | `apps/e2e/specs/google-meet.spec.ts` (new), `plans/reports/*` | `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm --filter e2e e2e google-meet.spec.ts` (ports 8100-8105), isolated review, PR -> `develop` |

## Acceptance Criteria (Done Means)
1. Migration D1 + schema (`class_session_meeting`) & `@teacher-os/api` contracts pass migration/contract tests.
2. Giáo viên kết nối/nâng cấp quyền Google OAuth (`offline` refresh token + Calendar/Meet/Drive scopes) tại `/profile`.
3. Tạo/sửa/huỷ/dời lễ buổi học Online đồng bộ Google Calendar + Meet space (`OPEN` fallback `TRUSTED`), có nút tạo đơn lẻ & hàng loạt.
4. Worker `scheduled()` cron + endpoint đồng bộ recording thủ công truy vấn Meet API, cấp Drive `reader` cho học viên lớp và gán `recordingUrl`.
5. `apps/web` và `apps/student` hiển thị nút vào Meet & xem recording đúng trạng thái ở 3 viewport + keyboard focus + E2E spec.
6. Local gates pass, isolated review sạch, PR merge vào `develop`, POT đăng trên #816.
