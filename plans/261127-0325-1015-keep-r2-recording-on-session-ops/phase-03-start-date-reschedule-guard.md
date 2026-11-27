---
phase: 3
title: "Phase 3: Start-Date Reschedule Guard"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Start-Date Reschedule Guard

## Goal

Block any start-date / schedule / sessionsTotal reschedule (`applyClassStartDateChange` via `PATCH /api/classes/:id` and `POST /api/classes/:id/confirm-opening`) that would destroy or overwrite a live R2 recording across `surplusOldDates`, `Pass 1.5`, or `buildMeetingMovePair`, while preserving safe 1-1 moves and `newCancels` soft-detach and cleaning deleted expired R2 objects via `deletedRecordingKeys`.

## Target Files & Symbols

- `apps/server/src/lib/class-start-date-reschedule.ts`:
  - `ApplyClassStartDateChangeInput` (`now?: Date`), `ApplyClassStartDateResult` (`"recording-locked"`), `EMPTY_ZOOM_PLAN`, `buildMeetingMovePair`, `applyClassStartDateChange` (`casGuardSql`, `surplusOldDates`, `Pass 1.5`, `catch` re-check), `simulateZoomSyncPlan`.
- `apps/server/src/routes/kernel.ts`:
  - `PATCH /classes/:id` (`lines 2750-2827`) and `POST /classes/:id/confirm-opening` (`lines 3078-3150`).
- `apps/server/src/edit-class.test.ts`:
  - Extend `setupTestApp` (`lines 64-117`) to accept `getRecordingStore?: AppDeps["getRecordingStore"]` and `now?: AppDeps["now"]`; add new test cases for projected/materialized/holiday-chain R2 protection & `confirm-opening`.

## Critical Invariants

- Capture `const now = input.now ?? new Date(); const nowMs = now.getTime();` once per request/attempt and bind integer `nowMs` into SQLite `sql` expressions (`liveR2RecordingSql` / `nonLiveR2RecordingSql`).
- Ensure every statement stays `<= 100` bound parameters (`DATE_SET_GUARD_CHUNK` = 40 for `surplusOldDates` CAS/DELETE) and `statements.length <= MAX_BATCH_STATEMENTS` (500).
- Never emit `newCancels` keys into `deletedRecordingKeys` (`newCancels` soft-detaches and preserves R2/expired rows).

## Tests Before (TDD Red Phase)

### Task 3.1 — Extend `setupTestApp` and add failing tests for start-date reschedule live R2 protection & expired R2 cleanup
- **Goal:** Wire `getRecordingStore` and `now` in `edit-class.test.ts`, then prove that `surplusOldDates`, `Pass 1.5`, and `buildMeetingMovePair` currently delete live R2 recordings or fail to clean expired R2 objects on `recordingStore`.
- **Target files:** `apps/server/src/edit-class.test.ts:64-117` and new tests at the end of `apps/server/src/edit-class.test.ts`.
- **Steps:**
  1. Extend `setupTestApp(options?: { getZoomClient?: () => ZoomClient; getRecordingStore?: AppDeps["getRecordingStore"]; now?: AppDeps["now"] })` in `apps/server/src/edit-class.test.ts:64-117` to forward `getRecordingStore` and `now` into `buildApp`.
  2. Add tests covering:
     - Projected 0-lesson class shrinking `sessionsTotal` or clearing `startDate: ""` when a surplus date has live R2 → expects `409 { code: "RECORDING_LOCKED" }`, row & R2 object preserved; when expired → expects `200`, row deleted AND expired R2 object deleted from `recordingStore` even when `!isZoomEnabled`.
     - Materialized class with an unmapped leftover meeting holding live R2 on a mapped `newDate` (`Pass 1.5`) → expects `409 RECORDING_LOCKED`; when expired → `200` and expired R2 cleaned.
     - Materialized class with holiday shift unwind (`Step A`) or re-apply (`Step C`) colliding via `buildMeetingMovePair` onto a live R2 target → expects `409 RECORDING_LOCKED`.
     - Safe 1-1 shift of live R2 (no collision) → `200`, `recordingStorageKey` moves cleanly to new date; `Step C` `newCancels` on live or expired R2 → `200`, soft-detached and R2 object NOT deleted.
     - `POST /api/classes/:id/confirm-opening` changing `startDate` hitting live R2 → expects `409 RECORDING_LOCKED`.
- **Success criteria:** New assertions fail against current code before implementation.
- **Verify:** `pnpm --filter server test src/edit-class.test.ts` exits non-zero with expected assertion failures.

## Refactor & Implementation Steps

### Task 3.2 — Upgrade `simulateZoomSyncPlan` and SQL/CAS guards in `class-start-date-reschedule.ts`
- **Goal:** Detect every live R2 destruction/overwrite on the exact Step A -> Step B -> Step C simulation state before `db.batch`, harden `casGuardSql` + all 3 `DELETE` statements against races, and collect `deletedRecordingKeys` for non-cancelled deleted rows.
- **Target files:** `apps/server/src/lib/class-start-date-reschedule.ts:170-198,241-505,790-1064,1138-1510`.
- **Steps:**
  1. Import `hasLiveR2Recording`, `liveR2RecordingSql`, `nonLiveR2RecordingSql` from `./zoom/session-zoom-service`. Add `now?: Date` to `ApplyClassStartDateChangeInput` and `"recording-locked"` to `ApplyClassStartDateResult` errors. Set `EMPTY_ZOOM_PLAN.deletedRecordingKeys = []`.
  2. In `meetingRows` select (`lines 329-344`), also select `recordingStorageKey` and `recordingExpiresAt`.
  3. Compute `now = input.now ?? new Date()` and `nowMs = now.getTime()` once at top of `applyClassStartDateChange` (so all retry attempts & `catch` re-checks use the same `now`). Extend `casGuardSql` with exact counts of `recordingStorageKey IS NOT NULL` (`recordingKeyCount`) and `liveR2RecordingSql(nowMs)` (`liveRecordingCount`).
  4. Update `buildMeetingMovePair(..., nowMs)` to include `nonLiveR2RecordingSql(nowMs)` on its `DELETE`.
  5. Update `surplusOldDates` (`projected` mode): add chunked CAS `startDate` guard ensuring `NOT EXISTS (... date IN chunk AND liveR2RecordingSql(nowMs))` before deleting, and add `nonLiveR2RecordingSql(nowMs)` to the `DELETE`.
  6. Update `Pass 1.5` (`line 950`) `DELETE` to include `nonLiveR2RecordingSql(nowMs)`.
  7. Upgrade `simulateZoomSyncPlan`: accept `now` and `recordingStorageKey` / `recordingExpiresAt` per meeting; split `recordDestroyed` (used in Step A unwind target, Step B `surplusOldDates`, Step B `mappings` Pass 1.5 target, Step C `newShifts` target — sets `blockedByLiveRecording = true` if `hasLiveR2Recording`, pushes `recordingStorageKey` to `deletedRecordingKeys` and `zoomMeetingId` to `deletedZoomMeetingIds`) from `recordCancelled` (used ONLY in Step C `newCancels` — pushes `zoomMeetingId` to `deletedZoomMeetingIds`, clears `entry.zoomMeetingId = null` without setting `blockedByLiveRecording` or adding to `deletedRecordingKeys`).
  8. Run `simulateZoomSyncPlan` BEFORE `db.batch(statements)` whenever `meetingRows.length > 0`; if `simResult.blockedByLiveRecording`, return `{ ok: false, error: "recording-locked" }`. Ensure `statements.length <= MAX_BATCH_STATEMENTS` (500) even for 52-session classes.
  9. In `catch (err)` on `attempt >= 3`, explicitly re-query fresh `classSessionMeeting` (`date`, `zoomMeetingId`, `recordingStorageKey`, `recordingExpiresAt`) and `loadClassHolidays(db, orgId, classId)` alongside `clsAfter`/`lessonAfter`/`shiftsAfter`, recompute `planUnstartedStartDateShift` + `newShifts`/`newCancels` (for `materialized` when `applicableHolidays.length > 0`) + `simulateZoomSyncPlan` against the fresh rows using `now`, and if `blockedByLiveRecording` is true return `{ ok: false, error: "recording-locked" }` before falling back to `"conflict"`.
- **Success criteria:** `applyClassStartDateChange` returns `{ ok: false, error: "recording-locked" }` on any live R2 collision/race (including attempt 3) and populates `deletedRecordingKeys` exclusively for actually deleted expired rows.
- **Verify:** No separate verification needed; verified in Task 3.4.

### Task 3.3 — Wire `"recording-locked"` and `deletedRecordingKeys` cleanup in `kernel.ts`
- **Goal:** Map `"recording-locked"` to `409 RECORDING_LOCKED` and clean expired `deletedRecordingKeys` outside `isZoomEnabled` in `PATCH /classes/:id` and `POST /classes/:id/confirm-opening`.
- **Target files:** `apps/server/src/routes/kernel.ts:2750-2827,3078-3150`.
- **Steps:**
  1. Pass `now: deps.now ? deps.now() : new Date()` to both `applyClassStartDateChange` calls.
  2. Add `case "recording-locked":` returning `409 { error: "Lớp đang có buổi học chứa video recording lưu trên hệ thống bị ảnh hưởng nên không thể đổi ngày khai giảng.", code: RECORDING_ERROR_CODES.LOCKED, reason: "recording-locked" }` in both switch blocks.
  3. After `rescheduled.ok`, iterate `rescheduled.zoomSyncPlan.deletedRecordingKeys ?? []` and call `await deleteRecordingObjectBestEffort(deps.getRecordingStore?.(), key, { classId, reason: "start-date-reschedule" }, deps.runInBackground)` OUTSIDE `runZoomSyncTask`.
- **Success criteria:** Both start-date endpoints return `409 RECORDING_LOCKED` on live R2 collision and delete expired R2 objects even when Zoom is disabled.
- **Verify:** `pnpm --filter server test src/edit-class.test.ts src/curriculum-overwrite.test.ts` exits 0.

## Tests After

### Task 3.4 — Verify Phase 3 tests and full server suite
- **Goal:** Confirm all start-date reschedule, curriculum overwrite, holiday, and Zoom recording tests pass together.
- **Target files:** `apps/server/src/edit-class.test.ts`, `apps/server/src/curriculum-overwrite.test.ts`.
- **Steps:**
  1. Run `pnpm --filter server test src/edit-class.test.ts src/curriculum-overwrite.test.ts src/routes/zoom-meeting.test.ts src/routes/holidays.test.ts`.
  2. Run `pnpm --filter server exec tsc --noEmit`.
- **Success criteria:** Both commands exit 0 with 0 failures.
- **Verify:** `pnpm --filter server test src/edit-class.test.ts src/curriculum-overwrite.test.ts src/routes/zoom-meeting.test.ts src/routes/holidays.test.ts && pnpm --filter server exec tsc --noEmit` exits 0.

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
