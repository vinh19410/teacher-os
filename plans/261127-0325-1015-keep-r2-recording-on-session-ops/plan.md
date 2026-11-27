---
title: "Keep R2 Recording When Sessions Are Deleted, Moved, or Rescheduled (#1015)"
description: "Protect live R2 recordings across session deletion, session move, holiday shift/undo, and start-date reschedule with atomic CAS guards, 409 RECORDING_LOCKED, and web error mapping."
status: completed
priority: P1
effort: "4h"
tags: [zoom, r2, recordings, bugfix]
issue: 1015
branch: fix/1015-keep-r2-recording-on-session-ops
created: 2026-11-27
---

# Keep R2 Recording When Sessions Are Deleted, Moved, or Rescheduled (#1015)

## Overview

Từ #994, bản gốc cloud recording trên Zoom được chuyển vào Trash sau khi chép lên bucket R2 `recordings`, khiến object R2 có thể là bản sao duy nhất còn hạn. Plan này bảo vệ mọi video R2 còn hạn (`recordingStorageKey !== null && (recordingExpiresAt === null || recordingExpiresAt > now)`) khỏi bị xóa hoặc ghi đè âm thầm ở cả 3 đường thao tác: xóa buổi, dời buổi / dời kỳ nghỉ, và đổi ngày khai giảng — đồng thời đóng khoảng trống TOCTOU bằng atomic CAS trong `db.batch` và dọn sạch object R2 đã hết hạn kể cả khi `!isZoomEnabled`.

## Locked Scope & Non-Goals

- **In-scope:** Server guards + atomic CAS + defense-in-depth cho Path 1 (`DELETE /api/classes/:id/sessions/:date`, `syncZoomOnSessionCancelOrDelete`), Path 2 (`POST /api/classes/:id/sessions/:date/edit`, `POST /api/holidays`, `DELETE /api/holidays/:id`, `syncZoomOnSessionEdit`), Path 3 (`applyClassStartDateChange`, `PATCH /api/classes/:id`, `POST /api/classes/:id/confirm-opening`), dọn `deletedRecordingKeys` hết hạn ngoài `isZoomEnabled`, map `409 RECORDING_LOCKED` trên `apps/web`, cập nhật `docs/system-architecture.md`, và unit/integration test cho mọi đường.
- **Explicit Non-Goals:** Luồng UI xác nhận xóa/ghi đè cưỡng bức; hàng đợi TTL chờ xóa R2; các hạng mục của #1016; nhánh `PATCH /classes/:id` không đổi `startDate`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chặn `409 RECORDING_LOCKED` khi xóa buổi có video R2 còn hạn (+ soft-detach defense-in-depth) | P1 |
| 2 | Chặn `409 RECORDING_LOCKED` khi dời buổi hoặc dời/hoàn tác kỳ nghỉ đè lên ngày đích có video R2 còn hạn | P1 |
| 3 | Chặn `409 RECORDING_LOCKED` khi đổi ngày khai giảng làm mất hoặc ghi đè video R2 còn hạn, đồng thời dọn R2 hết hạn | P1 |
| 4 | Map lỗi `409 RECORDING_LOCKED` rõ ràng trên các modal/toast ở `apps/web` và xác nhận toàn bộ test/lint/typecheck | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1: Shared Helpers & Session Delete Guard](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Move Session & Holiday Guards](./phase-02-move-session-and-holiday-guards.md) | Pending |
| 3 | [Phase 3: Start-Date Reschedule Guard](./phase-03-start-date-reschedule-guard.md) | Pending |
| 4 | [Phase 4: Web Error Mapping & Verification](./phase-04-web-error-mapping-and-verification.md) | Pending |

## Success Criteria

- [x] Xóa buổi có video R2 còn hạn trả `409 RECORDING_LOCKED` và giữ nguyên session + object R2; video hết hạn xóa được và dọn object R2 ngoài `isZoomEnabled`.
- [x] Dời buổi hoặc áp/hoàn tác kỳ nghỉ đè lên ngày đích có video R2 còn hạn trả `409 RECORDING_LOCKED`; dời buổi nguồn có video R2 còn hạn sang ngày trống/hết hạn thành công và giữ nguyên video.
- [x] Đổi ngày khai giảng (`PATCH /classes/:id`, `POST /confirm-opening`) va chạm live R2 ở `surplusOldDates`, `Pass 1.5`, hoặc `buildMeetingMovePair` trả `409 RECORDING_LOCKED`; dời 1-1 và `newCancels` giữ nguyên R2; object hết hạn bị xóa được dọn qua `deletedRecordingKeys`.
- [x] Các modal/toast liên quan ở `apps/web` hiển thị thông báo rõ ràng khi nhận `409 RECORDING_LOCKED` và tự làm mới snapshot khi cần.
- [x] Pass `pnpm --filter server test`, `pnpm --filter web test`, `pnpm exec biome check .`, và `pnpm check-types`.

## Red Team Review

### Session — 2026-11-27
**Findings:** 19 raw findings across 3 lenses (deduplicated to 9 distinct technical issues; 9 accepted, 0 rejected)
**Severity breakdown:** 3 Critical (deduped), 4 High (deduped), 2 Medium (deduped)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `syncZoomOnSessionCancelOrDelete` wording could drop `!input.deleteMeetingRow` guard + stale `softDetach()` status overwrite | Critical | Accept | Phase 1 (Task 1.2) |
| 2 | `DELETE /holidays/:id` per-shift `NOT EXISTS` in `guardParts` exceeds D1 100-bind ceiling at 7+ shifts | Critical | Accept | Phase 2 (Task 2.4) |
| 3 | `holidays.ts` mutating `class_session_meeting` asynchronously in `runInBackground` causes false Undo self-lock and split-brain snapshot | Critical | Accept | Phase 2 (Task 2.4) |
| 4 | `POST /classes/:id/sessions/:date/edit` missing `auto`-class destination `lesson`/`classSession` occupancy CAS and `bucketMoved` gate on `destMeetingDelete` | High | Accept | Phase 2 (Task 2.3) |
| 5 | `syncZoomOnSessionEdit` concurrent move Step 3 `DELETE` could wipe just-moved source row | High | Accept | Phase 2 (Task 2.2) |
| 6 | `applyClassStartDateChange` `catch (err)` on `attempt >= 3` needs fresh `classSessionMeeting` + `loadClassHolidays` re-query for late-race `"recording-locked"` | High | Accept | Phase 3 (Task 3.2) |
| 7 | `now` must be captured once and reused across pre-check, `db.batch`, and `catch` re-checks | Medium | Accept | Phase 1, 2, 3 |
| 8 | `holiday-undo-dialog.test.tsx` mocks `@/lib/repos/holidays`; add `apps/web/src/lib/repos/holidays.test.ts` + include `edit-class-modal.test.tsx` in Task 4.1/4.2 | High | Accept | Phase 4 (Task 4.1, 4.2) |
| 9 | `edit-class.test.ts` `setupTestApp` needs `getRecordingStore` & `now` injection wiring | Medium | Accept | Phase 3 (Task 3.1) |

## Validation Log

### Verification Results
- **Tier:** Standard (4 phases — Fact Checker + Contract Verifier)
- **Claims checked:** 40+ across all 4 phases (checked by 3 independent red-team reviewers against worktree `87ca6f25`)
- **Verified:** All cited files/symbols verified | **Failed:** 0 (after applying all 9 red-team fixes) | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-move-session-and-holiday-guards.md`, `phase-03-start-date-reschedule-guard.md`, `phase-04-web-error-mapping-and-verification.md`
- Decision deltas checked: 9 (single `now` capture, SQL `CASE` in `softDetach` + strict `!deleteMeetingRow` gate, synchronous `class_session_meeting` mutation in `holidays.ts` `db.batch`, constant-bind `holiday_session_shift` CAS in `DELETE /holidays/:id`, `auto`-class occupancy CAS + `bucketMoved` gate in `POST /edit`, `ne(id)`/`oldDateISO` guard in `syncZoomOnSessionEdit`, fresh re-query in `attempt >= 3` `catch`, `setupTestApp` deps in `edit-class.test.ts`, new `repos/holidays.test.ts` + `edit-class-modal.test.tsx` in Phase 4)
- Reconciled stale references: 0 remaining
- Unresolved contradictions: 0

<!-- slug: 1015-keep-r2-recording-on-session-ops -->
