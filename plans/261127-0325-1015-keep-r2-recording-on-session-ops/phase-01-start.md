---
phase: 1
title: "Phase 1: Shared Helpers & Session Delete Guard"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Shared Helpers & Session Delete Guard

## Goal

Export shared live/expired R2 predicates and harden session deletion (`DELETE /api/classes/:id/sessions/:date` and `syncZoomOnSessionCancelOrDelete`) so live R2 recordings are never deleted or orphaned, while expired R2 recordings are cleaned up even when Zoom is unconfigured.

## Target Files & Symbols

- `apps/server/src/lib/zoom/session-zoom-service.ts`:
  - Export `hasLiveR2Recording`, `liveR2RecordingSql`, `nonLiveR2RecordingSql`, `deleteRecordingObjectBestEffort`, `deleteZoomMeetingBestEffort`.
  - Update `ZoomRescheduleSyncPlan` (`deletedRecordingKeys?: string[]`).
  - Update `syncZoomOnSessionCancelOrDelete` (`apps/server/src/lib/zoom/session-zoom-service.ts:990-1065`).
- `apps/server/src/routes/kernel.ts`:
  - Update imports (`RECORDING_ERROR_CODES`, shared Zoom helpers).
  - Update `DELETE /classes/:id/sessions/:date` (`apps/server/src/routes/kernel.ts:4374-4564`).
- `apps/server/src/routes/zoom-meeting.test.ts`:
  - Update session-delete assertion in lines `1314-1321` and add live/expired/null-expiry/no-Zoom/CAS-race & direct service unit tests.

## Critical Invariants

- Capture `const now = deps.now ? deps.now() : new Date()` ONCE per handler invocation and reuse the exact `now` / `now.getTime()` across pre-check, SQL binds (`liveR2RecordingSql` / `nonLiveR2RecordingSql`), and `catch` re-checks.
- Bind `now.getTime()` (integer ms) into Drizzle `sql` expressions for `recordingExpiresAt` (`integer(..., { mode: "timestamp_ms" })`), NEVER a `Date` object.
- Abort `db.batch` on race by setting `.notNull()` column `classTable.schedulingMode` to `NULL` via `CASE WHEN ... THEN NULL ELSE ... END`, because D1 does not roll back a batch on 0-row `DELETE`.
- Execute `deleteRecordingObjectBestEffort` OUTSIDE `runZoomSyncTask` so `!isZoomEnabled(deps)` never leaves expired objects behind.

## Tests Before (TDD Red Phase)

### Task 1.1 — Update and add failing tests for session deletion with live vs expired R2
- **Goal:** Establish failing test expectations proving the current code deletes live R2 recordings on `DELETE /api/classes/:id/sessions/:date` and inside `syncZoomOnSessionCancelOrDelete(..., { deleteMeetingRow: true })`.
- **Target files:** `apps/server/src/routes/zoom-meeting.test.ts:1314-1321` and new test cases in the same `describe("Recording và cron", ...)` block.
- **Steps:**
  1. In `apps/server/src/routes/zoom-meeting.test.ts:1314-1321`, update the `d2` delete block so deleting `d2` while `recordingExpiresAt` is live (future or `null`) expects `409` with `{ code: "RECORDING_LOCKED" }`, `store.objects.has(k2)` remains `true`, and row `d2` stays intact; then expire `d2` (`recordingExpiresAt: new Date(0)`) and assert `DELETE` returns `200` and `store.objects.has(k2)` becomes `false`.
  2. Add a test verifying `DELETE /api/classes/:id/sessions/:date` still deletes an expired R2 recording and cleans `recordingStore` even when Zoom is unconfigured (`createApp(undefined, { recordingStore: store })` / `!isZoomEnabled`), and returns `409 RECORDING_LOCKED` when `recordingExpiresAt` is in the future.
  3. Add direct unit tests for `syncZoomOnSessionCancelOrDelete(deps, ...)` verifying: (a) with `deleteMeetingRow: true` and live R2, it soft-detaches (`zoomMeetingId: null, joinUrl: ""`) using live-column SQL `CASE` status and preserves the R2 object; (b) with `deleteMeetingRow: true` and expired R2, it deletes both row and R2 object; (c) with `deleteMeetingRow: false` (cancel), it always soft-detaches and never deletes the row even when non-live.
- **Success criteria:** New and updated assertions fail against current code before implementation.
- **Verify:** `pnpm --filter server test src/routes/zoom-meeting.test.ts` exits non-zero with expected assertion failure on live R2 deletion returning `200` instead of `409`.

## Refactor & Implementation Steps

### Task 1.2 — Add shared R2 predicates and harden `syncZoomOnSessionCancelOrDelete`
- **Goal:** Provide canonical live/non-live R2 helpers and make `syncZoomOnSessionCancelOrDelete` fail-safe against deleting live R2 rows or objects, while preserving cancel-path soft-detach semantics.
- **Target files:** `apps/server/src/lib/zoom/session-zoom-service.ts:103-122,848-857,990-1083`.
- **Steps:**
  1. Export `hasLiveR2Recording(row, now)` delegating to `Boolean(row.recordingStorageKey && !isStorageExpired(row.recordingStorageKey, row.recordingExpiresAt, now))`.
  2. Export `liveR2RecordingSql(nowMs: number)` and `nonLiveR2RecordingSql(nowMs: number)` comparing `recordingStorageKey` and `recordingExpiresAt` against numeric `nowMs`.
  3. Export `deleteRecordingObjectBestEffort` and `deleteZoomMeetingBestEffort`; in `deleteZoomMeetingBestEffort`, return early without warning when `!isZoomConfigured(deps.zoom) && !deps.getZoomClient`.
  4. Add `deletedRecordingKeys?: string[]` to `ZoomRescheduleSyncPlan`.
  5. In `syncZoomOnSessionCancelOrDelete`: compute `now = deps.now ? deps.now() : new Date()` and `nowMs = now.getTime()`; skip `client.deleteMeeting` when Zoom is not configured; extract `softDetach()` that computes `recordingStatus` via SQL `CASE` over live columns (`sql\`CASE WHEN ${classSessionMeeting.recordingStorageKey} IS NOT NULL OR ${classSessionMeeting.recordingStatus} = 'expired' THEN ${classSessionMeeting.recordingStatus} WHEN ${classSessionMeeting.recordingUrl} != '' THEN 'ready' ELSE 'none' END\``) so concurrent R2 uploads are never overwritten to `"none"`; guard with `if (!input.deleteMeetingRow || hasLiveR2Recording(meeting, now)) { await softDetach(); return; }`; only when `input.deleteMeetingRow` is true and non-live, run `.delete(classSessionMeeting).where(and(eq(classSessionMeeting.id, meeting.id), nonLiveR2RecordingSql(nowMs))).returning(...)` and if 0 rows returned fall back to `softDetach()`, else delete any returned expired `recordingStorageKey`.
- **Success criteria:** Helper functions and `syncZoomOnSessionCancelOrDelete` preserve live R2 rows, preserve cancel soft-detach behavior, and clean expired rows on delete.
- **Verify:** No separate verification needed; verified by Task 1.3 + Tests After.

### Task 1.3 — Guard `DELETE /classes/:id/sessions/:date` with pre-check, atomic CAS, and post-batch cleanup
- **Goal:** Reject deletion of any manual session whose `class_session_meeting` row holds a live R2 recording with `409 RECORDING_LOCKED`, and delete non-live meeting rows atomically in `db.batch`.
- **Target files:** `apps/server/src/routes/kernel.ts:4374-4564` (and imports at top of `kernel.ts`).
- **Steps:**
  1. Import `RECORDING_ERROR_CODES` from `@teacher-os/api/contracts`, and `deleteRecordingObjectBestEffort`, `deleteZoomMeetingBestEffort`, `hasLiveR2Recording`, `liveR2RecordingSql`, `nonLiveR2RecordingSql` from `../lib/zoom/session-zoom-service`.
  2. Capture `const now = deps.now ? deps.now() : new Date(); const nowMs = now.getTime();` once before pre-check.
  3. After the `cannot-delete-completed` check, query `classSessionMeeting` for `(ctx.orgId, classId, dateISO)`; if `existingMeeting && hasLiveR2Recording(existingMeeting, now)`, return `409 { error: "Buổi học đang có video recording lưu trên hệ thống nên không thể xóa buổi.", code: RECORDING_ERROR_CODES.LOCKED, reason: "recording-locked" }`.
  4. In `deleteStatements`: extend the `classTable` `schedulingMode` `CASE` guard so `EXISTS (SELECT 1 FROM ${classSessionMeeting} WHERE ... AND ${liveR2RecordingSql(nowMs)})` also yields `NULL` (aborting the batch); append `db.delete(classSessionMeeting).where(and(..., nonLiveR2RecordingSql(nowMs))).returning({ zoomMeetingId: classSessionMeeting.zoomMeetingId, recordingStorageKey: classSessionMeeting.recordingStorageKey })` and record `meetingDeleteIdx`.
  5. In `catch (err)` (`isRollbackableConstraintError`): after `findClassCurriculum`, re-query `classSessionMeeting` for `(ctx.orgId, classId, dateISO)` and evaluate `hasLiveR2Recording(afterMeeting, now)` using the SAME `now`; if true, return `409 RECORDING_LOCKED`.
  6. Capture `const batchResults = await db.batch(deleteStatements);`, delete any returned `recordingStorageKey` via `deleteRecordingObjectBestEffort` OUTSIDE `runZoomSyncTask`, and delete any returned `zoomMeetingId` via `runZoomSyncTask` -> `deleteZoomMeetingBestEffort`. Remove the old `syncZoomOnSessionCancelOrDelete` call from this route.
- **Success criteria:** Live R2 blocks delete with `409 RECORDING_LOCKED` both on pre-check and under concurrent sync race; expired R2 deletes cleanly even without Zoom configured.
- **Verify:** `pnpm --filter server test src/routes/zoom-meeting.test.ts` exits 0 with all tests passing.

## Tests After

### Task 1.4 — Verify Phase 1 tests and type safety
- **Goal:** Confirm all Phase 1 tests pass and introduce no TypeScript errors.
- **Target files:** `apps/server/src/routes/zoom-meeting.test.ts`, `apps/server/src/lib/zoom/session-zoom-service.ts`, `apps/server/src/routes/kernel.ts`.
- **Steps:**
  1. Run `pnpm --filter server test src/routes/zoom-meeting.test.ts`.
  2. Run `pnpm --filter server exec tsc --noEmit`.
- **Success criteria:** Both commands exit 0 with 0 failures.
- **Verify:** `pnpm --filter server test src/routes/zoom-meeting.test.ts && pnpm --filter server exec tsc --noEmit` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
