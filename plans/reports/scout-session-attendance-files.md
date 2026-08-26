# Scout Report — In-place session attendance

## Relevant Files

- `apps/web/src/routes/_auth/classes/$classId.tsx` — Class detail tabs roster/sessions/notes; in-file `ClassScheduleTable` (read-only badges). 474 lines; contract `<500`.
- `apps/web/src/lib/class-sessions.ts` — `ClassSession`, `ClassSessionLesson` (Pick omits `id`), `dateISO`, `buildClassSessions`, `sessionStatus` prefix heuristic, `sidStateAt` unexported.
- `apps/web/src/lib/class-sessions.test.ts` — Proves `rows` = all slot rows (13 Tue rows on every Tue occurrence).
- `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts` — Issue #89: 3 tabs, 4-col table, legacy 5-col, lineCount `<500`.
- `apps/web/src/components/class-detail/curriculum-management-section.tsx` — Collapsible curriculum above the table.
- `apps/server/src/routes/kernel.ts` — `POST /lessons/:id/check-in` upcoming→completed; empty body; no date guard.
- `apps/server/src/kernel.test.ts` — Wave 4 check-in/cancel matrix; no date-guard tests.
- `packages/api/src/contracts.ts` — `lessonActionSchema = z.object({}).strict()`; `KernelLessonRow.status` includes `absent`.
- `packages/db/src/schema/lesson.ts` — No calendar date column; `day`+`time` only.
- `apps/server/src/routes/snapshot.ts` — `orderBy day, time, createdAt`; status passthrough.
- `apps/web/src/lib/repos/lessons.ts` — `mapLessons` keeps `id`+`classId`+`sid`; coerce unknown→upcoming.
- `apps/web/src/lib/data-actions.ts` — `check-in` / `cancel-lesson` only; no mark-absent.
- `apps/web/src/lib/repos/kernel.ts` — empty-body lock for check-in/cancel.
- `apps/web/src/lib/use-direct-kernel-action.ts` — process-global one `pendingKey`.
- `apps/web/src/components/schedule/lesson-modal.tsx` — Existing "Điểm danh" per one enrollment.
- `apps/web/src/routes/_auth/dashboard.tsx` — Today cards "Điểm danh".
- `apps/web/src/lib/week-grid.ts` — `todayISOVietnam()` Asia/Ho_Chi_Minh.
- `apps/e2e/specs/class-operations.spec.ts` — Counts "Sắp tới"/"Đã học" on Buổi học; clicks Điểm danh on `/schedule`.
- `apps/web/src/components/ui/modal.tsx` — Only overlay primitive (`max-w-[480px]`). No Sheet/Dialog/Drawer.
- `plans/260826-1611-merge-class-detail-schedule-and-curriculum-tabs/phase-03-timeline-mutations-inline-edit-and-status.md` — Collision: session status dropdown fan-out.

## Relationships

`GET /api/kernel` → `mapLessons` → `ClassScheduleTable` → `buildClassSessions`. Rows = whole slot bag. Write: `useDirectKernelAction` → `POST /api/lessons/:id/check-in`. Absent: no writer.

Occurrence vs row is load-bearing: prefix display lies if check-in is out of teaching order. Phase-3 `for (row of session.rows) check-in` would complete the whole weekday slot.

## Test surface

- Must update: `class-detail-sessions-tab.contract.test.ts`, `class-operations.spec.ts`, `class-sessions.test.ts`, `kernel-runtime.contract.test.ts`.
- Leave alone unless action set changes: `data-actions`, `kernel.test` command lock, reducer tests.

## Unresolved Questions

1. Sequential-only CTA vs bind-by `rowsForSid[slotIndex-1]`.
2. Today enabled? (`dateISO <= todayISOVietnam()`).
3. UI-only date gate (server cannot know occurrence date).
4. Issue #87 phase-3 dropdown vs per-student attendance.
5. Legacy fallback: keep read-only?
