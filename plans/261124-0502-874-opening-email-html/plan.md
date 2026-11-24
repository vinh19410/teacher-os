# Plan #874 — Chốt khai giảng & Gửi Email HTML thông báo cho học viên

- **Issue:** #874 (`vinh19410/teacher-os`)
- **Branch:** `vinh19410/Email-báo-khai-giảng` → PR target `develop` (`--beta --merge`)
- **Status:** Completed & Verified (Isolated Review Clean — 0 Blocking)

## Phases & Ownership

| Wave | Piece | Owner | Files | Depends On |
|---|---|---|---|---|
| 1 | 1A: Contracts & Shared HTML Email Renderer | Subagent (`packages/api`) | `packages/api/src/contracts.ts`, `packages/api/src/class-opening-email.ts`, `packages/api/src/class-opening-email.test.ts` | — |
| 1 | 1B: DB Schema & Migration 0086 | Subagent (`packages/db`) | `packages/db/src/schema/class.ts`, `packages/db/src/schema/notification-record.ts`, `packages/db/src/migrations/0086_*.sql`, `packages/db/src/migrations/meta/*` | — |
| 2 | 2A: Server API, Snapshot & Notification Delivery | Subagent (`apps/server`) | `apps/server/src/lib/notifications/{templates,enqueue,deliver,emit}.ts`, `apps/server/src/routes/{snapshot,kernel}.ts`, server tests | Wave 1 |
| 2 | 2B: Web UI Modal, Class Detail & Notification Logs | Subagent (`apps/web`) | `apps/web/src/lib/{mock-data,repos/classes,repos/class-opening}.ts`, `apps/web/src/components/modals/confirm-opening-modal.tsx`, `apps/web/src/routes/_auth/classes/$classId.tsx`, `apps/web/src/routes/_auth/notifications/index.tsx`, web tests | Wave 1 |
| 3 | Visual Verify (3 viewports + light/dark + keyboard) & POT screenshots | Orchestrator | `plans/reports/874-confirm-opening-*.png` | Wave 2 |
| 4 | Isolated Code Review & Fixes | Fresh Subagent (`code-reviewer`) | Diff review against brief + `REVIEW.md` + `DESIGN.md` | Wave 3 |
| 5 | Full Local Gates, Ship PR to `develop`, CI, Merge & POT Comment | Orchestrator | PR → `develop`, issue #874 label `in review` → `done` → `shipped` | Wave 4 |

## Acceptance Criteria (Done means)
1. Migration `0086` adds `opening_confirmed_at`, `opening_note`, `opening_announcement_version` on `class`, `html_body` (nullable) and `notification_record_org_event_ref_idx` on `notification_record`; backward-compatible with all existing rows.
2. `renderClassOpeningEmail` in `@teacher-os/api` renders branded table-based inline-CSS HTML email (dark-mode aware, zero external assets, strict XSS escaping, plain-text fallback) shared between server delivery and web modal preview.
3. `POST /api/classes/:id/confirm-opening` enforces `canManageClassStatus` (`403` for `ta`), blocks `paused` classes (`409 CLASS_PAUSED`), syncs `startDate` when `!hasRealSessions` (`409 CLASS_SCHEDULE_LOCKED` if locked and changed), requires valid `startDate`, handles `initial` / `new_only` / `all` modes with CAS `expectedVersion` (`409 CLASS_OPENING_VERSION_CONFLICT`), includes `active` + `invited` enrollments, reports `skippedNoEmail` & `skippedAlreadySentCount`, and persists `htmlBody` so both initial delivery and `/notifications` resend deliver the exact HTML email.
4. `/classes/$classId` shows "Chốt khai giảng" (or badge + "Thông báo khai giảng" after confirmed), opens `ConfirmOpeningModal` with editable/read-only `startDate`, send mode switcher, recipient & missing-email summary, optional teacher note, and sandboxed live HTML preview (`iframe sandbox=""`); `/notifications` labels `class_opening_confirmed` cleanly.
5. Verified across 3 viewports (`1440×900`, `768×1024`, `375×812`), light & dark themes, and keyboard focus per `REVIEW.md`.
6. Local gates green (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`), isolated review clean, PR merged into `develop`, POT comment posted on #874 with `shipped` label.
