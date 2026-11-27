---
phase: 4
title: "Phase 4: Web Error Mapping & Verification"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Web Error Mapping & Verification

## Goal

Surface clear Vietnamese error messages and trigger snapshot refreshes across all affected `apps/web` modals/toast handlers when the server rejects an operation with `409 RECORDING_LOCKED`, update `docs/system-architecture.md`, and pass full server, web, lint, and typecheck gates.

## Target Files & Symbols

- `apps/web/src/components/class-detail/session-actions-modal.tsx` (`summarize`, `moveDate` error handler at line `426`).
- `apps/web/src/lib/kernel-outcome.ts` (`isRecordingLocked`, `occurrenceSummary`).
- `apps/web/src/routes/_auth/classes/$classId.tsx` (`runOccurrenceWrite`, line `144`).
- `apps/web/src/lib/use-kernel-form-submit.ts` (`lockFailureMessage`, `run` refresh check).
- `apps/web/src/lib/repos/class-opening.ts` (`defaultErrorMessage`) & `apps/web/src/components/modals/confirm-opening-modal.tsx` (`REFRESH_REQUIRED_ERROR_CODES`).
- `apps/web/src/lib/repos/holidays.ts` (`deleteHoliday` `raw.code ?? raw.error`), `apps/web/src/components/schedule/holiday-modal.tsx`, `apps/web/src/components/schedule/holiday-undo-dialog.tsx`.
- `docs/system-architecture.md` (line `42`).
- Web unit tests:
  - `apps/web/src/lib/kernel-outcome.test.ts`
  - `apps/web/src/lib/use-kernel-form-submit.test.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`
  - `apps/web/src/components/modals/edit-class-modal.test.tsx`
  - `apps/web/src/components/modals/confirm-opening-modal.test.tsx`
  - `apps/web/src/lib/repos/holidays.test.ts` (new, tests real `fetch` parsing for `deleteHoliday` & `applyHoliday` since `holiday-undo-dialog.test.tsx` mocks `@/lib/repos/holidays`)
  - `apps/web/src/components/schedule/holiday-modal.test.tsx`
  - `apps/web/src/components/schedule/holiday-undo-dialog.test.tsx`

## Critical Invariant

`apps/web/src/lib/repos/kernel.ts:557` sets `options.reason = record.error ?? record.reason`. Always match `code === RECORDING_ERROR_CODES.LOCKED` (`result.code` / `httpErr.code`), NEVER `result.reason === "recording-locked"`.

## Tests Before (TDD Red Phase)

### Task 4.1 — Add failing frontend unit tests for `RECORDING_LOCKED` error mapping
- **Goal:** Verify existing frontend code falls back to generic failure messages on `RECORDING_LOCKED`.
- **Target files:** `apps/web/src/lib/kernel-outcome.test.ts`, `apps/web/src/lib/use-kernel-form-submit.test.tsx`, `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`, `apps/web/src/components/modals/edit-class-modal.test.tsx`, `apps/web/src/components/modals/confirm-opening-modal.test.tsx`, `apps/web/src/lib/repos/holidays.test.ts` (new), `apps/web/src/components/schedule/holiday-modal.test.tsx`, `apps/web/src/components/schedule/holiday-undo-dialog.test.tsx`.
- **Steps:**
  1. Add test cases asserting `RECORDING_LOCKED` produces dedicated Vietnamese guidance (and `refresh()` where applicable) in: `kernel-outcome.test.ts`, `use-kernel-form-submit.test.tsx`, `$classId.sessions.test.tsx` (both delete + `moveDate` `formError` assertion), `edit-class-modal.test.tsx` (matching `CLASS_START_DATE_LOCKED` test at lines `945-953`), `confirm-opening-modal.test.tsx`, `holiday-modal.test.tsx`, and `holiday-undo-dialog.test.tsx`.
  2. Create `apps/web/src/lib/repos/holidays.test.ts` stubbing `globalThis.fetch` to verify `deleteHoliday` and `applyHoliday` parse `body.code = "RECORDING_LOCKED"` into `holidayErrorCode` even when `body.error` is Vietnamese text.
- **Success criteria:** New assertions fail against unedited frontend files.
- **Verify:** `pnpm --filter web test src/lib/kernel-outcome.test.ts src/lib/use-kernel-form-submit.test.tsx src/routes/_auth/classes/$classId.sessions.test.tsx src/components/modals/edit-class-modal.test.tsx src/components/modals/confirm-opening-modal.test.tsx src/lib/repos/holidays.test.ts src/components/schedule/holiday-modal.test.tsx src/components/schedule/holiday-undo-dialog.test.tsx` exits non-zero.

## Refactor & Implementation Steps

### Task 4.2 — Map `RECORDING_LOCKED` across `apps/web` handlers and update `docs/system-architecture.md`
- **Goal:** Handle `RECORDING_LOCKED` via `code` in every affected web component/repo and document the protection rule concisely.
- **Target files:** All 9 frontend files listed in Target Files & Symbols + `docs/system-architecture.md:42`.
- **Steps:**
  1. In `session-actions-modal.tsx`: import `RECORDING_ERROR_CODES`; handle `result.code === RECORDING_ERROR_CODES.LOCKED` in `summarize(result)` AND before `setNotice(summarize(result))` in the `moveDate` save handler (`setFormError("Ngày đích đang có video recording lưu trên hệ thống — chọn ngày khác."); return;`).
  2. In `kernel-outcome.ts`: import `RECORDING_ERROR_CODES`; add `isRecordingLocked(result)` checking `result.status === 409` + `code === RECORDING_ERROR_CODES.LOCKED`; map to clear error toast in `occurrenceSummary`.
  3. In `$classId.tsx`: import `RECORDING_ERROR_CODES`; add `|| failureCode === RECORDING_ERROR_CODES.LOCKED` to `await refresh()` in `runOccurrenceWrite`.
  4. In `use-kernel-form-submit.ts`: import `RECORDING_ERROR_CODES`; add `case RECORDING_ERROR_CODES.LOCKED:` in `lockFailureMessage` and add `|| httpErr?.code === RECORDING_ERROR_CODES.LOCKED` to `void refresh()`.
  5. In `repos/class-opening.ts` and `confirm-opening-modal.tsx`: import `RECORDING_ERROR_CODES`; add `RECORDING_ERROR_CODES.LOCKED` fallback message in `defaultErrorMessage` and add `RECORDING_ERROR_CODES.LOCKED` to `REFRESH_REQUIRED_ERROR_CODES`.
  6. In `repos/holidays.ts` (`deleteHoliday`): parse `code = record && typeof record.code === "string" ? record.code : undefined` and set `errorCode = code ?? error` as `holidayErrorCode` (matching `postJson`). In `holiday-modal.tsx` and `holiday-undo-dialog.tsx`: handle `code === RECORDING_ERROR_CODES.LOCKED`.
  7. In `docs/system-architecture.md:42`: append a concise phrase noting live R2 recordings block destructive session delete/move/holiday/start-date reschedule with `409 RECORDING_LOCKED`.
- **Success criteria:** All web unit tests pass and `docs/system-architecture.md` accurately reflects the protection boundary.
- **Verify:** `pnpm --filter web test src/lib/kernel-outcome.test.ts src/lib/use-kernel-form-submit.test.tsx src/routes/_auth/classes/$classId.sessions.test.tsx src/components/modals/edit-class-modal.test.tsx src/components/modals/confirm-opening-modal.test.tsx src/lib/repos/holidays.test.ts src/components/schedule/holiday-modal.test.tsx src/components/schedule/holiday-undo-dialog.test.tsx` exits 0.

## Tests After

### Task 4.3 — Full local verification gates (no full E2E locally)
- **Goal:** Confirm zero regressions across server tests, web tests, Biome lint/format, and monorepo TypeScript check.
- **Target files:** Whole worktree.
- **Steps:**
  1. Run `pnpm --filter server test`.
  2. Run `pnpm --filter web test`.
  3. Run `pnpm exec biome check . && pnpm check-types`.
- **Success criteria:** All 4 commands exit 0 with 0 failures and 0 errors.
- **Verify:** `pnpm --filter server test && pnpm --filter web test && pnpm exec biome check . && pnpm check-types` exits 0.

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
