# Plan: Move Placement Test Sidemenu Entry to Post-Submit Notification (#781)

Status: completed
Issue: #781 (https://github.com/vinh19410/teacher-os/issues/781)
Target branch: `develop` (`--merge --beta`)

## Acceptance Criteria
1. Sidemenu học viên (`STUDENT_NAV`) không còn mục `"Kiểm tra đầu vào"` và `StudentShell` không còn render `nav-placement-badge`. Breadcrumb trang `/placement-test` vẫn giữ `"Kiểm tra đầu vào"`.
2. Home (`/`) vẫn giữ `PlacementHighlightBanner` và `PlacementPromptModal` khi `status === "not_started" && testAvailable`; ẩn sau khi nộp.
3. `POST /api/student/placement-test/submissions` phát 1 `notification_record` (`eventType: "placement_submitted"`, `channels: "in_app"`, `status: "sent"`, `linkPath: "/placement-test"`, idempotent theo `submissionId`), không gửi email.
4. Frontend invalidate `["student", "inbox"]` sau khi nộp bài; bấm thông báo trong chuông đánh dấu đã đọc và mở `/placement-test`.
5. `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, và E2E spec `apps/e2e/specs/student-placement-test.spec.ts` pass.

## Phases (Parallel)
- **Phase 1 — Backend & Contracts (`backend-notifications`)**:
  - `packages/api/src/contracts.ts`, `apps/web/src/routes/_auth/notifications/index.tsx`
  - `apps/server/src/lib/notifications/{templates,enqueue,emit}.ts` + tests
  - `apps/server/src/routes/student-placement-test.ts` + `student-placement-test.test.ts`
- **Phase 2 — Student Frontend & E2E (`student-frontend-e2e`)**:
  - `apps/student/src/components/layout/{student-nav,student-shell}.tsx` + `student-nav.test.ts`
  - `apps/student/src/lib/repos/placement-test.ts`, `apps/student/src/components/placement/placement-test-runner.tsx`, `apps/student/src/routes/_auth/placement-test.tsx`
  - `apps/e2e/specs/student-placement-test.spec.ts`
- **Phase 3 — Integration, Isolated Review, Verification & Beta Merge**:
  - Merge both subagent branches cleanly into integration branch.
  - Run isolated `code-reviewer` subagent against diff + `REVIEW.md`.
  - Run full gates (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, and single E2E `student-placement-test.spec.ts` with port override).
  - Open PR to `develop`, wait for CI green, merge (`--merge --beta`), update issue #781 to `shipped` + POT comment.
