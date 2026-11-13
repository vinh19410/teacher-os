# reverse-sources — attendance

Quy ước: `confidence` gắn độ phủ bằng chứng của nguồn trong spec này; `encoding` = cách dữ liệu tổ chức trong nguồn. Mọi `[S<n>]` trong spec phải resolve về bảng này. `wc -l` đã kiểm trước khi cite range.

| S-id | Path | Loại | Range đọc | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/daily-attendance.ts | Server route (Hono) | 1–333 | high | TS module — hàm thuần + route GET | GET /api/attendance/daily; computeDailyAttendance; excludeNonTeachingSessions; coerceDisplayAttendance |
| S2 | apps/server/src/routes/holidays.ts | Server route (Hono) | 1–1012 | high | TS module — loader + planner + batch apply/undo | POST /preview, POST /, DELETE /:id; guard CASE; planHash; notif |
| S3 | apps/web/src/routes/_auth/attendance.tsx | Web route (TanStack) | 1–446 | high | React component + validateSearch | Màn /attendance; URL contract; save + auto-advance; aria-live |
| S4 | apps/e2e/specs/daily-attendance.spec.ts | E2E (Playwright) | 1–604 | high | Test spec | TOS-7/TOS-8 AC; perf NFR-008; viewport; dashboard counter |
| S5 | packages/db/src/schema/lesson.ts | DB schema (Drizzle) | 1–80 | high | TS schema + doc comment | Bảng lesson; enum status; attendance/attendance_note; invariant date |
| S6 | packages/db/src/schema/organization-holiday.ts | DB schema (Drizzle) | 1–149 | high | TS schema + doc comment | 4 bảng holiday; unique indexes; ý nghĩa business |
| S7 | packages/api/src/contracts.ts | API contract (Zod) | 1325–1440; 3620–3905 (+1950–1952 qua grep) | high | Zod schema + TS interface + hằng số | ATTENDANCE_STATUSES; D2; save/daily schema; holiday schemas; HOLIDAY_ERROR_CODES; LESSON_STATUS_LABEL |
| S8 | packages/api/src/holiday-plan.ts | Pure planner | 1–283 | high | TS hàm thuần | planHolidayShift; luật dời/cancel; cursor; SCAN_CAP |
| S9 | apps/server/src/routes/kernel.ts | Server route (Hono) | 326–333; 1801–1803; 2090–2108; 2909–3040; 1996–2000; 2206–2210; 3511–3512 | high | TS route | PUT attendance; futureSession; parseOccurrenceContext; holiday-locked; mount /attendance + /holidays |
| S10 | apps/server/src/routes/dashboard-reminders.ts | Server module | 52–149; 275–296 | high | TS hàm thuần + route | computeReminders (cửa điểm danh); resolveReminderScope |
| S11 | apps/web/src/lib/repos/daily-attendance.ts | Web repo client | 1–112 | high | fetch + zod parse | Query key; GET; PUT; DailyAttendanceApiError |
| S12 | apps/web/src/lib/attendance-draft.ts | Web reducer thuần | 1–147 | high | Reducer + helper | draft state; markAllPresent; toSaveEntries; MAX_NOTE 255 |
| S13 | apps/web/src/components/attendance/attendance-session-row.tsx | Web component | 1–438 | high | React component | Thẻ ca; submit; modal trigger; legacy block |
| S14 | apps/web/src/components/attendance/attendance-status-picker.tsx | Web component | 1–120 | high | React component | 4 pill + nhãn vi + roving tabindex |
| S15 | apps/web/src/components/attendance/fill-missing-confirm.tsx | Web component | 1–58 | high | React component | Modal xác nhận lưu thiếu |
| S16 | apps/web/src/lib/week-grid.ts | Web util | 1–55 | high | TS util | todayISOVietnam; isValidISODate (roundtrip) |
| S17 | apps/web/src/lib/repos/holidays.ts | Web repo client | 1–182 | high | fetch + zod parse | preview/apply/delete + helper nhãn shift/cancel |
| S18 | packages/api/src/skeleton.ts | Pure util | 25–99 | high | TS util | isoToLessonWeekday; parseStartDateStrict; parseStoredSchedule; scheduleDurationMinutes |
| S19 | packages/api/src/vietnam-date.ts | Pure util | 1–40 | high | TS util | vietnamTodayISO; addDaysISO |
| S20 | apps/server/src/routes/daily-attendance.test.ts | Unit test server | 1–946 | high | vitest | R1: (a)–(h) compute + PUT đủ/thiếu roster/future/perf |
| S21 | apps/server/src/routes/holidays.test.ts | Unit test server | 1–2028 | high | vitest | R1: preview/apply/race/activation/material/TOS-12/TOS-13/notif |
| S22 | packages/api/src/attendance.test.ts | Unit test contract | 1–204 | high | vitest | R1: D2; save schema; daily response schema |
| S23 | packages/api/src/holiday-plan.test.ts | Unit test planner | 1–640 | high | vitest | R1: luật planner shift + cancel |
| S24 | packages/api/src/holiday-contracts.test.ts | Unit test contract | 1–153 | high | vitest | R1: holiday draft/apply schema; LESSON_STATUS_LABEL |
| S25 | apps/server/src/lesson-attendance-columns-migration.test.ts | Migration test | 1–105 | high | vitest | R1: migration 0045 chỉ ADD COLUMN; DB cũ đọc được |
| S26 | apps/web/src/routes/_auth/attendance.test.tsx | Web component test | 1–850 | high | vitest+RTL | R1: validateSearch; màn; auto-advance; double-submit |
| S27 | apps/web/src/lib/attendance-draft.test.ts | Web util test | 1–190 | high | vitest | R1: draft; markAllPresent |
| S28 | apps/web/src/components/attendance/attendance-session-row.test.tsx | Web component test | 1–470 | high | vitest+RTL | R1: picker; modal; legacy; fill-missing |
| S29 | packages/db/src/migrations/0045_aspiring_thena.sql; packages/db/src/migrations/0047_slim_nightmare.sql; packages/db/src/migrations/0050_bent_spectrum.sql | SQL migration | 0045: 1–2; 0047: 1–42; 0050: 1–15 | high | SQL DDL | Cột attendance/attendance_note; 4 bảng holiday + unique |
| S30 | apps/web/src/components/schedule/holiday-modal.tsx | Web component (chéo schedule) | 1–379 | high | React component | Form tạo lịch nghỉ; toast lỗi apply |
| S31 | apps/web/src/components/schedule/holiday-undo-dialog.tsx | Web component (chéo schedule) | 1–222 | high | React component | Dialog hoàn tác; wording lỗi undo |
| S32 | apps/e2e/specs/holiday-shift.spec.ts | E2E | 69–269 | high | Test spec | R1: tạo lịch nghỉ dời buổi + BR-003 + /attendance |
| S33 | apps/e2e/specs/holiday-cancel-and-undo.spec.ts | E2E | 50–232 | high | Test spec | R1: mode cancel + hoàn tác + khóa nút undo |
| S34 | apps/e2e/specs/holiday-skip-and-kept-completed.spec.ts | E2E | 78–285 | high | Test spec | R1: skippedHolidays "(*)" + keptCompleted |
| S35 | packages/db/src/schema/settings.ts | DB schema | 27–32 | high | TS schema | Cột tombstone unexcused_deduct default "Có, trừ 1 buổi" |
| S36 | apps/server/src/app.ts | Server bootstrap | 205–260 | high | TS middleware | Gate 403 student/admin; TEACHER_EMAILS allowlist |

Ghi chú R2 (i18n): negative-search `find` + `grep -rln "i18n|useTranslation"` trên apps/web/src không thấy catalog/locale/messages nào — wording là literal trong component/server (GAP-1). Không có S-id riêng cho catalog vì không tồn tại.
