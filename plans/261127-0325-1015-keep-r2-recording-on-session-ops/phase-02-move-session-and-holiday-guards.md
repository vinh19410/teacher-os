---
phase: 2
title: "Phase 2: Move Session & Holiday Guards"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Move Session & Holiday Guards

## Goal

Protect live R2 recordings from being overwritten when moving an occurrence (`POST /api/classes/:id/sessions/:date/edit`), applying/undoing holidays (`POST /api/holidays`, `DELETE /api/holidays/:id`), or calling `syncZoomOnSessionEdit`, while moving/soft-detaching `class_session_meeting` rows atomically inside `db.batch` and cleaning expired R2 objects outside `runZoomSyncTask`.

## Target Files & Symbols

- `apps/server/src/lib/zoom/session-zoom-service.ts`:
  - `syncZoomOnSessionEdit` (`apps/server/src/lib/zoom/session-zoom-service.ts:859-988`).
- `apps/server/src/routes/kernel.ts`:
  - `POST /classes/:id/sessions/:date/edit` (`apps/server/src/routes/kernel.ts:3796-4125`).
- `apps/server/src/routes/holidays.ts`:
  - `holidayRoutes` deps (`now?: AppDeps["now"]`, line `465-478`), `findLiveR2Collision`, `shiftStatements` (line `317-423`), `cancelStatements` (line `429-456`), `POST /holidays` (lines `576-712`), `DELETE /holidays/:id` (lines `910-1116`).
- `apps/server/src/routes/zoom-meeting.test.ts` (`lines 1322-1360` + new move/service tests) & `apps/server/src/routes/holidays.test.ts`.

## Critical Invariants

- Capture `const now = deps.now ? deps.now() : new Date()` ONCE per handler and reuse the exact `now` / `now.getTime()` across pre-check, SQL CAS binds, and `catch` re-checks.
- Every SQL statement in `holidays.ts` (`undoStatements` included) must stay strictly under D1's 100-bound-parameter limit (`holiday_session_shift` join subquery uses 4 constant binds instead of per-shift binds in `guardParts`).
- Mutate `class_session_meeting` inside `db.batch` in `POST /edit`, `POST /holidays`, and `DELETE /holidays/:id` so `sessionMeetings` never desyncs from `lesson` or self-locks on immediate Undo.

## Tests Before (TDD Red Phase)

### Task 2.1 — Add failing tests for session move overwrite and holiday apply/undo R2 collisions
- **Goal:** Prove that moving onto a live-R2 destination or applying/undoing a holiday onto a live-R2 date currently overwrites/deletes the live R2 recording.
- **Target files:** `apps/server/src/routes/zoom-meeting.test.ts:1322-1360`, `apps/server/src/routes/holidays.test.ts`.
- **Steps:**
  1. In `zoom-meeting.test.ts:1322-1360`, assert `POST /api/classes/:id/sessions/${d3}/edit` (`{ moveDate: d4 }`) returns `409 { code: "RECORDING_LOCKED" }` while `d4` has live R2 (leaving `d3` unmoved and `d4` R2 object intact), then expires `d4` and asserts `200` + `d4` expired object deleted + `d3` meeting moved to `d4`.
  2. Add tests in `zoom-meeting.test.ts` for: (a) moving a session whose own `oldDate` has a live R2 recording onto an empty date (and onto an expired-R2 date) succeeds `200` and keeps R2 playable even when Zoom is unconfigured; (b) `syncZoomOnSessionEdit` directly refuses to overwrite a live R2 target row/object.
  3. Add tests in `holidays.test.ts` for: (a) `POST /api/holidays` (`mode: "shift"`) when `makeupDate` has an orphaned `class_session_meeting` with live R2 returns `409 { code: "RECORDING_LOCKED" }`, creates no holiday, preserves R2; succeeds `200` when expired (even without Zoom configured) and cleans expired R2; (b) `POST /api/holidays` shifting a class session that has a live R2 recording at `originalDate` moves `class_session_meeting` atomically to `makeupDate`, and immediately calling `DELETE /api/holidays/:id` (undo) succeeds `200` and moves it back to `originalDate` (no false self-lock!); (c) `DELETE /api/holidays/:id` when `originalDate` has live R2 returns `409 { code: "RECORDING_LOCKED" }`, preserves holiday + R2; succeeds `200` when expired.
- **Success criteria:** New/updated assertions fail against current code before implementation.
- **Verify:** `pnpm --filter server test src/routes/zoom-meeting.test.ts src/routes/holidays.test.ts` exits non-zero with expected assertion failures.

## Refactor & Implementation Steps

### Task 2.2 — Harden `syncZoomOnSessionEdit` against live R2 overwrite and concurrent move races
- **Goal:** Make `syncZoomOnSessionEdit` check `hasLiveR2Recording`, use `nonLiveR2RecordingSql` + `.delete().returning()` excluding `meeting.id`, and avoid deleting the moved row on concurrent invocations.
- **Target files:** `apps/server/src/lib/zoom/session-zoom-service.ts:859-988`.
- **Steps:**
  1. Compute `now = deps.now ? deps.now() : new Date()` and `nowMs = now.getTime()`.
  2. In `if (input.oldDateISO !== input.newDateISO)`: query `target`; if `target && hasLiveR2Recording(target, now)`, log warning and `return` (abort move before deleting target or updating `meeting.date`).
  3. Run `const deletedTargets = await deps.db.delete(classSessionMeeting).where(and(eq(classSessionMeeting.orgId, input.orgId), eq(classSessionMeeting.classId, input.classId), eq(classSessionMeeting.date, input.newDateISO), ne(classSessionMeeting.id, meeting.id), nonLiveR2RecordingSql(nowMs), sql\`EXISTS (SELECT 1 FROM ${classSessionMeeting} src WHERE src.id = ${meeting.id} AND src.date = ${input.oldDateISO})\`)).returning({ id, zoomMeetingId, recordingStorageKey })`.
  4. If `deletedTargets.length === 0`, check if a row still exists at `newDateISO` with `ne(classSessionMeeting.id, meeting.id)`; if yes (race), log warning and `return`.
  5. Delete `dt.zoomMeetingId` and `dt.recordingStorageKey` only for rows in `deletedTargets`.
  6. Guard the trailing `client.updateMeeting` call so `!isZoomConfigured(deps.zoom) && !deps.getZoomClient` returns quietly without warning.
- **Success criteria:** `syncZoomOnSessionEdit` never deletes a live R2 target or a concurrently moved source row.
- **Verify:** No separate verification needed; verified in Task 2.5.

### Task 2.3 — Move `class_session_meeting` atomically with CAS inside `POST /classes/:id/sessions/:date/edit`
- **Goal:** Pre-check and atomically guard `moveDateISO` against both concurrent session occupation (`lesson`/`classSession`) and live R2 in `db.batch`, move `class_session_meeting` atomically inside `db.batch`, and clean expired overwritten R2 objects outside `runZoomSyncTask`.
- **Target files:** `apps/server/src/routes/kernel.ts:3796-4125`.
- **Steps:**
  1. Capture `const now = deps.now ? deps.now() : new Date(); const nowMs = now.getTime();` once at handler start.
  2. When `moveDateISO && moveDateISO !== dateISO`: after `dest.total > 0 || destCs.length > 0`, pre-check `classSessionMeeting` at `(ctx.orgId, classId, moveDateISO)`; if `hasLiveR2Recording(destMeeting, now)`, return `409 { error: "Ngày đích đang có video recording lưu trên hệ thống — hãy chọn ngày khác.", code: RECORDING_ERROR_CODES.LOCKED, reason: "recording-locked" }`.
  3. Build the `moveDateISO && moveDateISO !== dateISO` `db.batch(statements)` with the atomic CAS guard on `classTable.name` FIRST (index `0`), and `occurrenceUpdate(...)` at index `1` (reading `rows` from `batchResults[1]`)! The CAS guard updates `classTable.name` to `NULL` if:
     - `EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId} AND ${lesson.date} = ${moveDateISO})`, OR
     - `EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId} AND ${classSession.date} = ${moveDateISO})`, OR
     - `EXISTS (SELECT 1 FROM ${classSessionMeeting} WHERE ${classSessionMeeting.orgId} = ${ctx.orgId} AND ${classSessionMeeting.classId} = ${classId} AND ${classSessionMeeting.date} = ${moveDateISO} AND ${liveR2RecordingSql(nowMs)})`.
  4. Place `destMeetingDelete` AFTER `occurrenceUpdate` and `classSession.update` (so `bucketMoved` accurately sees whether `dateISO` moved), gated on BOTH `bucketMoved` AND `nonLiveR2RecordingSql(nowMs)` AND `EXISTS (src at dateISO)` + `.returning({ zoomMeetingId, recordingStorageKey })` (record `destMeetingDeleteIdx`). Then push `db.update(classSessionMeeting).set({ date: moveDateISO }).where(and(..., date = dateISO, bucketMoved))`.
  5. In `catch (shiftCause)`: if `isRollbackableConstraintError(shiftCause)`, re-check `classSessionMeeting` at `moveDateISO` using the SAME `now`; if live R2 exists, return `409 RECORDING_LOCKED`, else return `409 date-occupied`.
  6. After `db.batch` succeeds, clean `recordingStorageKey` from `batchResults[destMeetingDeleteIdx]` via `deleteRecordingObjectBestEffort` OUTSIDE `runZoomSyncTask`, delete any `dt.zoomMeetingId` via `runZoomSyncTask`, and pass `oldDateISO: moveDateISO ?? dateISO, newDateISO: moveDateISO ?? dateISO` to `syncZoomOnSessionEdit`.
- **Success criteria:** Concurrent destination moves never merge `auto` buckets, no-op/holiday-raced moves never delete `destMeeting`, live R2 blocks with `409 RECORDING_LOCKED`, and source R2 moves atomically even when Zoom is disabled.
- **Verify:** No separate verification needed; verified in Task 2.5.

### Task 2.4 — Move `class_session_meeting` inside `db.batch` and protect `POST /holidays` & `DELETE /holidays/:id`
- **Goal:** Prevent holiday apply (`mode: "shift"`) and holiday undo (`DELETE /holidays/:id`) from overwriting live R2 recordings on target dates, move/soft-detach `class_session_meeting` atomically inside `db.batch`, and keep every SQL statement under D1's 100-bind ceiling.
- **Target files:** `apps/server/src/routes/holidays.ts:317-478,576-712,910-1116`.
- **Steps:**
  1. Import `RECORDING_ERROR_CODES`, `classSessionMeeting`, `deleteRecordingObjectBestEffort`, `deleteZoomMeetingBestEffort`, `hasLiveR2Recording`, `liveR2RecordingSql`, `nonLiveR2RecordingSql`. Add `now?: AppDeps["now"]` to `holidayRoutes(deps)`.
  2. Implement `findLiveR2Collision(db, orgId, pairs, now)` chunking `classIds` by `D1_IN_ARRAY_CHUNK`.
  3. **In `POST /holidays`:**
     - Capture `const now = deps.now ? deps.now() : new Date(); const nowMs = now.getTime();` once.
     - When `input.mode === "shift"`: pre-check `plan.shifts` `(classId, makeupDate)` via `findLiveR2Collision` -> `409 RECORDING_LOCKED`.
     - In `shiftStatements(db, orgId, holidayId, shift, nowMs)`: append `AND NOT EXISTS (SELECT 1 FROM ${classSessionMeeting} WHERE ... AND date = ${shift.makeupDate} AND ${liveR2RecordingSql(nowMs)})` to `guard`, AND append two statements inside `shiftStatements`:
       (a) conditional delete of non-live `classSessionMeeting` at `shift.makeupDate` gated on `EXISTS (src at shift.originalDate)` + `nonLiveR2RecordingSql(nowMs)` + `.returning({ zoomMeetingId, recordingStorageKey })` (track indices);
       (b) `db.update(classSessionMeeting).set({ date: shift.makeupDate }).where(and(eq(classSessionMeeting.orgId, orgId), eq(classSessionMeeting.classId, shift.classId), eq(classSessionMeeting.date, shift.originalDate)))`.
     - In `cancelStatements(db, orgId, holidayId, cancellation)`: append soft-detach `db.update(classSessionMeeting).set({ zoomMeetingId: null, joinUrl: "", recordingStatus: sql\`CASE WHEN ${classSessionMeeting.recordingStorageKey} IS NOT NULL OR ${classSessionMeeting.recordingStatus} = 'expired' THEN ${classSessionMeeting.recordingStatus} WHEN ${classSessionMeeting.recordingUrl} != '' THEN 'ready' ELSE 'none' END\` }).where(and(eq(classSessionMeeting.orgId, orgId), eq(classSessionMeeting.classId, cancellation.classId), eq(classSessionMeeting.date, cancellation.date))).returning({ zoomMeetingId: classSessionMeeting.zoomMeetingId })`? Note: in SQLite/D1, `UPDATE ... RETURNING` returns the post-update `zoomMeetingId` (`null`)! So instead, before `db.batch` (or via `meetingRows` pre-read on affected classes/dates for `cancel` and `shift` — chunked by `D1_IN_ARRAY_CHUNK`), read existing `zoomMeetingId`s for `cancellations`, and in `shiftStatements` read deleted `zoomMeetingId`/`recordingStorageKey` from the `DELETE ... RETURNING` index!
     - In `catch (err)` (`isRollbackableConstraintError`): check `findLiveR2Collision` (using the SAME `now`) BEFORE returning `STALE_PREVIEW`.
     - After `db.batch(statements)` succeeds: delete any expired `recordingStorageKey` from `DELETE ... RETURNING` via `deleteRecordingObjectBestEffort` OUTSIDE `runZoomSyncTask`, and inside `runZoomSyncTask` call `deleteZoomMeetingBestEffort` for overwritten/cancelled Zoom IDs and `syncZoomOnSessionEdit({ oldDateISO: shift.makeupDate, newDateISO: shift.makeupDate })` to update Zoom meeting dates!
  4. **In `DELETE /holidays/:id` (undo):**
     - Capture `const now = deps.now ? deps.now() : new Date(); const nowMs = now.getTime();` once.
     - Pre-check `shiftCounts` `(classId, originalDate)` via `findLiveR2Collision` -> `409 RECORDING_LOCKED`.
     - Do NOT add per-shift `NOT EXISTS` into `guardParts` (avoids >100 binds at 7+ shifts!). Instead, push ONE constant-bind CAS statement on `organizationHoliday.name` right after `undoStatements[0]`:
       `sql\`CASE WHEN NOT EXISTS (SELECT 1 FROM ${holidaySessionShift} hss INNER JOIN ${classSessionMeeting} m ON m.org_id = ${ctx.orgId} AND m.class_id = hss.class_id AND m.date = hss.original_date WHERE hss.org_id = ${ctx.orgId} AND hss.holiday_id = ${holidayId} AND ${liveR2RecordingSql(nowMs)}) THEN ${organizationHoliday.name} ELSE NULL END\`` (4 binds total regardless of shift count!).
     - Inside the `shiftCounts` loop of `undoStatements`, append:
       (a) conditional delete non-live `classSessionMeeting` at `shift.originalDate` gated on `EXISTS (src at shift.makeupDate)` + `nonLiveR2RecordingSql(nowMs)` + `.returning({ zoomMeetingId, recordingStorageKey })` (track indices);
       (b) `db.update(classSessionMeeting).set({ date: shift.originalDate }).where(and(eq(classSessionMeeting.orgId, ctx.orgId), eq(classSessionMeeting.classId, shift.classId), eq(classSessionMeeting.date, shift.makeupDate)))`.
     - In `catch (err)` (`isRollbackableConstraintError`): check `findLiveR2Collision` (using the SAME `now`) BEFORE returning `MAKEUP_TOUCHED`.
     - After `db.batch(undoStatements)` succeeds: delete any expired `recordingStorageKey` from `DELETE ... RETURNING` via `deleteRecordingObjectBestEffort` OUTSIDE `runZoomSyncTask`, and inside `runZoomSyncTask` delete overwritten Zoom IDs and update shifted Zoom meetings back to `shift.originalDate` (`oldDateISO: shift.originalDate, newDateISO: shift.originalDate`).
- **Success criteria:** Holiday apply and undo return `409 RECORDING_LOCKED` on live R2 collision, stay under 100 binds/statement even for 20+ shifts, move `class_session_meeting` atomically in `db.batch`, and clean expired R2 objects outside `runZoomSyncTask`.
- **Verify:** `pnpm --filter server test src/routes/zoom-meeting.test.ts src/routes/holidays.test.ts` exits 0.

## Tests After

### Task 2.5 — Verify Phase 2 tests and type safety
- **Goal:** Confirm all Phase 1 + Phase 2 tests and TypeScript compilation pass.
- **Target files:** `apps/server/src/routes/zoom-meeting.test.ts`, `apps/server/src/routes/holidays.test.ts`.
- **Steps:**
  1. Run `pnpm --filter server test src/routes/zoom-meeting.test.ts src/routes/holidays.test.ts`.
  2. Run `pnpm --filter server exec tsc --noEmit`.
- **Success criteria:** Both commands exit 0 with 0 failures.
- **Verify:** `pnpm --filter server test src/routes/zoom-meeting.test.ts src/routes/holidays.test.ts && pnpm --filter server exec tsc --noEmit` exits 0.

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
