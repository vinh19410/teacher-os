# Research report — issue #55: lesson CRUD API from class schedule

All paths relative to worktree root `/Users/vinhtran/Documents/project/personal/worktrees/teacher-os-feat-55-lesson-crud-api-from-class-schedule`. Read-only research, 2026-08-21.

## 1. Design tension options

**The tension.** `packages/db/src/schema/lesson.ts:26-28` — `enrollmentId` NOT NULL, FK cascade to enrollment. Schema doc comment (lines 7-15) pins invariant 2: "A scheduled session belongs to a class and exactly one enrollment". But `POST /api/classes` (`apps/server/src/routes/kernel.ts:223-257`) inserts ONLY `classTable` — zero enrollments exist at class creation. Enrollment happens in exactly ONE place today: `POST /api/students` with `classId` (`apps/server/src/routes/kernel.ts:156-208`, insert at :187; grep `insert(enrollment)` across `apps/server/src` returns only that line). No enroll-into-existing-class endpoint exists — the "enroll student into viewed class" flow (plan 260816-1821) also rides `add-student` with `classId` (`apps/web/src/lib/data-actions.ts:10-21`).

### Option A — make `enrollmentId` nullable, generate class-level rows at class creation

What depends on non-null today:

| Consumer | Evidence | Effect of NULL |
|---|---|---|
| Snapshot loader | `apps/server/src/routes/snapshot.ts:138-141` selects lesson rows directly, NO join; passes `enrollmentId` through at :235-246 | Survives (type change only) |
| Web lesson mapper | `apps/web/src/lib/repos/lessons.ts:38-63` — builds `studentByEnrollment` map, then `if (!sid) continue;` (line 46-49) **drops any lesson whose enrollmentId doesn't resolve to a student** | Class-level rows INVISIBLE on /schedule, dashboard, class detail — directly violates M1 DOD "hiển thị đúng trên /schedule" unless rewritten |
| Check-in/cancel | `apps/server/src/routes/kernel.ts:129-141` `findLessonAction` uses `.innerJoin(enrollment, ...)` | NULL-enrollment lesson → join drops row → 404. Check-in on generated rows impossible without leftJoin rework |
| Invariant 6 (pkg done/remaining) | `apps/web/src/lib/repos/students.ts:41-52` — `done` counts rows `status === "completed"` grouped by `enrollmentId`; NULL rows never count | A completed class-level lesson increments NO student's package → invariant 6 hole |
| Invariant 7 (class sessionsDone) | `apps/web/src/lib/repos/classes.ts:28-46` — distinct `${day}|${time}` per `classId` among completed | NULL rows still count (keyed by classId) — OK |
| Contract | `packages/api/src/contracts.ts:266-277` `KernelLessonRow.enrollmentId: string` | Needs `string \| null` |
| Display shape | `apps/web/src/lib/mock-data.ts:30-40` `Lesson.sid: string` — 5 files/6 sites read `l.sid` (schedule.tsx:82-90, dashboard.tsx:21+51, lesson-modal.tsx, classes/$classId.tsx:193, students/$studentId.tsx:199) | All need `sid?`/sentinel handling |

Also: SQLite cannot `ALTER COLUMN` — a nullable change forces drizzle to emit a table-rebuild migration, not a one-line ALTER (cf. hand-tuned `migrations/0007_class_type_skills.sql` which only ADDs/RENAMEs/UPDATEs). "Single-column migration" is actually a table rebuild.

Files to change (>=12): `packages/db/src/schema/lesson.ts` (+comment rewrite breaking invariant-2 doc), new rebuild migration, `packages/api/src/contracts.ts`, `apps/server/src/routes/kernel.ts` (POST /classes generator + `findLessonAction` leftJoin + check-in semantics for enrollment-less rows — currently UNDEFINED: who gets package credit?), `apps/web/src/lib/repos/lessons.ts`, `apps/web/src/lib/mock-data.ts`, 5 display consumers, server+web tests.

Verdict: fights the verified kernel on every layer; leaves check-in/package-credit semantically undefined for exactly the rows it creates. Red-team finding #9 in phase-05 (`plans/260818-1101-persist-class-centric-domain-kernel/phase-05-wave-4-schedule-persist.md:128`) exists precisely to enforce the lesson↔enrollment pairing.

### Option B — generate per-enrollment rows at enroll time (POST /students with classId)

- Enrollment write is one batch (`kernel.ts:184-206`: student + enrollment + sessionPackage via `db.batch`). Appending N lesson inserts to the same batch means generation is atomic with enrollment creation — no double-generation possible for a given enrollment (POST /students is not idempotent to begin with; each call = new student).
- Every existing layer keeps working untouched: `mapLessons` resolves sid, `findLessonAction` join works, invariant 6 counts per-enrollment completed rows correctly, invariant 7 distinct (day,time) — which is EXACTLY the 1:2 design ("1:2 session = one row per enrollment", phase-05 architecture 5, lines 45-47; `repos/classes.ts:15-18`). The kernel was designed expecting per-enrollment session rows.
- Decisive UI evidence: every lesson card on /schedule renders a student name (`apps/web/src/routes/_auth/schedule.tsx:82-90` `studentById(l.sid)`); a class-level lesson with no student is not renderable in the current UI at all.
- Does it satisfy "sinh lessons khi tạo lớp"? Not literally — an empty class shows nothing until the first student enrolls. But the M1 E2E DOD ("login → tạo lớp có lịch → thấy buổi → check-in → reload", docs/project-roadmap.md:44) requires check-in, which requires an enrollment anyway; and M1 "DÙNG ĐƯỢC" lists "thêm học viên + enroll vào lớp" as part of the same flow (roadmap :32). The E2E naturally inserts "add student" between "tạo lớp" and "thấy buổi".
- Gaps: (1) count source ambiguity — generate `class.sessionsTotal` (default 12, contracts.ts:57) vs `package.total` (default 10, contracts.ts:13). Recommend `sessionsTotal`: the schedule defines the course; `remaining` already clamps at 0 (`repos/students.ts:66`). (2) Legacy enrollments created before #55 get no lessons — needs a one-off backfill or accept the gap (staging-only data today). (3) Class schedule is immutable after creation (no edit-class endpoint exists — only notes :285-304 and assign-syllabus :259-283), so no regeneration-on-schedule-change problem in M1.

Files to change (3-4): `apps/server/src/routes/kernel.ts` (generation in POST /students batch + new lesson create/edit endpoints), `packages/api/src/contracts.ts` (new schemas), `apps/server/src/kernel.test.ts` (+ any web contract tests). Zero migration, zero adapter change.

### Option C — separate `class_session` table (class-level skeleton, lesson references it)

Largest change: new table + migration + snapshot/contracts/adapter/derives rework. Directly violates issue constraint "No big schema change — reuse the verified class-centric kernel". Rejected.

### Option D — sentinel enrollment/dummy student per class

Corrupts roster (invariant 4: "roster is the enrollment table", `packages/db/src/schema/enrollment.ts:8-10` + unique (classId,studentId)); dummy student pollutes student lists. Rejected.

### Prior art in plans

- phase-05 (`plans/260818-1101-persist-class-centric-domain-kernel/phase-05-wave-4-schedule-persist.md:54`, :107, :127): lesson creation was an explicit NON-GOAL ("Tạo buổi lịch vẫn không có write path — non-goal"; "Không có UI tạo buổi → lịch org mới trống mãi đến plan khác"). Nothing in 260818-1101 or 260820-2048 plans pre-commits to class-creation-time generation or discusses nullable enrollmentId — #55 is greenfield on this decision.
- 260820-2048 plan.md:22 cites `KernelLessonRow.day: number` as "tiền lệ dữ liệu lịch có cấu trúc" — no generation semantics.

## 2. Lesson field semantics (what the generator must write)

| Field | Meaning | Evidence |
|---|---|---|
| `day` | **Weekday index 1-7, 1 = Monday (Thứ 2)** — NOT epoch day, NOT date | `apps/web/src/routes/_auth/schedule.tsx:53-55` column `i` (dayNames T2..CN, `mock-data.ts:156`) filters `l.day === i + 1`; `apps/web/src/components/schedule/lesson-modal.tsx:38` renders `T{lesson.day + 1} {dayDates[lesson.day - 1]}/08`; `apps/web/src/routes/_auth/students/$studentId.tsx:199` `Thứ ${l.day + 1}`; test seed default `day: 2` = Tuesday (`apps/server/src/kernel.test.ts:150`, usage :1440) |
| `time` | Strict `"HH:MM"` 24h start time | `TIME_REGEX` `packages/api/src/contracts.ts:31`; test default `"19:00"` (kernel.test.ts:151); sorted by `time.localeCompare` (schedule.tsx:56) |
| `dur` | Duration in **minutes** | test default `60` (kernel.test.ts:152); schedule modal default end = start + 90 min (260820-2048 plan.md:18); `addMinutes` helper `apps/web/src/lib/format-schedule.ts:47-53` |
| `type` | One of `"1:1" \| "1:2" \| "trial" \| "mock" \| "review"`, schema default `"1:1"` | `apps/web/src/lib/repos/lessons.ts:12-18` whitelist + coerce; schema default lesson.ts:32 |
| `status` | `"completed" \| "upcoming" \| "cancelled" \| "absent"`; default `"upcoming"`; `"absent"` has NO writer anywhere (grep: only whitelist coerce + display label "Vắng" in students/$studentId.tsx:40,49) | lesson.ts:33; contracts.ts:274; repos/lessons.ts:19-24 |
| `topic`, `zoom` | Free text, default `""` (test default topic "Mock test") | lesson.ts:34-35; kernel.test.ts:155-156 |

**OFF-BY-ONE HAZARD**: class schedule JSON `days` is 0-6 with **0 = Monday** (`contracts.ts:47-52`, comment "0 = Monday … 6 = Sunday (dayNames index convention)"; `add-class-modal.tsx:28` `DAY_OPTIONS = dayNames.map((label, value) => ...)` → value = array index 0-6), while `lesson.day` display convention is 1-7 with 1 = Monday. The generator must write `lesson.day = weekdayIndex + 1`. (Note: 260820-2048 plan.md:31 says "days 1–7" but the shipped contract is 0-6 — code wins.)

No date/epoch column exists. All 5 display sites assume the fixed demo week (`dayDates = [18..24]`, mock-data.ts:157). Week nav in #56 must derive real dates from class `startDate` + weekday + occurrence index — see unresolved questions.

## 3. Schedule → sessions expansion rules

Contract (`packages/api/src/contracts.ts:33-83`): `schedule { days: int[0..6] unique min 1, start: HH:MM, end: HH:MM }` with `end <= start` meaning crosses-midnight (comment :54-55); only constraint `start !== end` (superRefine :61-67). `sessionsTotal: int >= 0 default 12` (:57). `startDate: string default ""` (:58).

**startDate format today (post plan 260821-1410, shipped):** native `<input type="date">` producing **`YYYY-MM-DD`** local calendar, future-only validated client-side (`apps/web/src/lib/date-input.ts:1-48` — `DATE_INPUT_PATTERN`, `formatDateInputValue` :25-29, `isFutureDateInputValue` :38-48; modal state `getTomorrowDateInputValue`, submit `startDate.trim()` at `add-class-modal.tsx:53,103,118,230`). Server stores raw string (`kernel.ts:253`); contract allows `""`; legacy rows may hold `dd/MM` free text (1410 plan.md:84 "Existing classes can keep legacy date strings because display renders raw startDate"). The generator must parse `YYYY-MM-DD` as primary, with a defined fallback for `""`/legacy (e.g. treat as "today" in Asia/Ho_Chi_Minh — same tz concern as `formatDayMonth`, kernel.ts:558-566).

Server normalization already applied at class create: `days` deduped + sorted ascending (`kernel.ts:246-249`). `formatSchedule`/`parseSchedule` (`apps/web/src/lib/format-schedule.ts:16-44`) are display-only; `addMinutes` (:47-53) is the existing HH:MM arithmetic helper (wraps past midnight — reusable for dur computation: `dur = ((end-start)+1440) % 1440` minutes; e.g. 23:00→00:30 = 90).

**Expansion algorithm implied by the data model:** starting from the first occurrence of any schedule weekday on/after startDate, walk calendar days forward; each matching weekday emits one session (day=idx+1, time=start, dur from start/end); stop at `sessionsTotal` sessions. This yields consecutive weekly occurrences — which is exactly what the current weekly-calendar UI can render (all occurrences of one weekday stack in that weekday's column).

**"day" representation for #56 weekly calendar:** `lesson.day` as weekday 1-7 renders fine on the 7-column grid (schedule.tsx:53-77). Placing a lesson on a specific DATE requires deriving from `class.startDate` + weekday + occurrence ordinal — impossible after per-lesson edits reorder things. Recording this as a #56 problem, not a #55 blocker (any date-column addition is a schema change excluded by the issue constraint).

## 4. Check-in flow (the guard pattern to mirror)

`apps/server/src/routes/kernel.ts:306-360`:

- Body contract: `lessonActionSchema = z.object({}).strict()` (contracts.ts:149-154) — body exactly `{}`; target status comes from the endpoint, never the client.
- Pre-read `findLessonAction` (:129-141): `innerJoin(enrollment)` selecting `lesson.classId` + `enrollment.classId`; org-scoped WHERE.
- Transition matrix: only `upcoming → completed` (POST `/api/lessons/:id/check-in`, :354-356) and `upcoming → cancelled` (POST `/api/lessons/:id/cancel`, :358-360). Everything else → **409** `"lesson is not upcoming"` (:330-332, :348-350). Enrollment/class pairing mismatch → **409** `"lesson enrollment mismatch"` (:327-329). Missing/foreign-org lesson → **404** (tenant predicate makes them indistinguishable, :323-326).
- **Race guard (the pattern #55 must copy)**: conditional write — `UPDATE lesson SET status = ... WHERE id AND orgId AND status = 'upcoming'` + `.returning()`; zero returned rows → 409 (:337-351). Added after a code-review "check-then-act race" finding (phase-05 Evidence :98). Only the lesson row is written; package/class counters stay derived (:306-311).
- `"absent"` is unreachable: no writer exists anywhere (grep across apps/server, apps/web, packages/api — only the coerce whitelist and one display label).

**Derived-progress code new rows must not corrupt:**
- Invariant 6 — `apps/web/src/lib/repos/students.ts:41-52`: `done = count(lessons where status==="completed" && enrollmentId === displayed package's enrollmentId)`; `remaining = max(0, total - done)` (:66). Generator must create rows with `status: "upcoming"` (or "cancelled" for pre-cancelled) — never "completed", or done inflates without a check-in.
- Invariant 7 — `apps/web/src/lib/repos/classes.ts:28-46`: `sessionsDone` = count of distinct `"${day}|${time}"` per classId among completed lessons (1:2 = 2 rows, 1 session). Consequence: weekly-recurrence sessions sharing (day,time) are indistinguishable to this derive — pre-existing limitation, unchanged by #55, but note it: checking in week-1 and week-2 of the same Monday-19:00 slot counts as ONE session. Per-student `done` (row count) is correct regardless.
- Both derives read only the snapshot; nothing writes counters — "Sửa/hủy buổi không làm hỏng buổi khác" holds as long as edit/cancel touch exactly one row (conditional UPDATE, single-row WHERE by id+org).

## 5. Web write path today

- Command union: `apps/web/src/lib/data-actions.ts:4-85` — scheduled-lesson commands are ONLY `"check-in"` and `"cancel-lesson"` (:5-6). **Name-collision warning**: `"add-lesson"`/`"edit-lesson"` (:59-81) are SYLLABUS lesson commands (different endpoint family). New scheduled-lesson create/edit actions need distinct names.
- Mapping: `apps/web/src/lib/repos/kernel.ts:80-85` — `check-in` → `POST /api/lessons/${id}/check-in` body `{}`; `cancel-lesson` → `.../cancel`. Transport `postKernelCommand` (:186-204) serializes through `createKernelCommandBus` (:333-414) with double-click dedup, snapshot refetch, 401 handling.
- No web wiring exists for scheduled-lesson create/edit; dispatch sites for check-in/cancel: `lesson-modal.tsx` (:66,:75 per phase-05 Context Links :18-19) and dashboard check-in block.

**Scope call for #55:** issue #55 is contracts + server routes + generation. Web wiring for create/edit belongs to #56 (Schedule UI — "buổi sinh từ lịch thật, nav tuần"). Under Option B the DOD E2E needs NO new web wiring at all: create class (existing modal) → add student with classId (existing `add-student`) → lessons appear via snapshot → check-in (existing) → reload.

## 6. Recommendation

**Ranked pick: Option B — per-enrollment generation inside the POST /students batch, plus org-scoped upcoming-only lesson create/edit endpoints.**

Rationale:
1. **Only option that keeps every verified invariant true.** The kernel's own design (row per enrollment per session; sid resolved through enrollment; check-in bound to enrollment; invariant 6/7 derives) was built assuming per-enrollment rows — phase-05 architecture 3-5 and red-team #9 all point there. Option A breaks display (mapLessons drops unresolvable rows), breaks check-in (innerJoin → 404), and leaves package credit for enrollment-less sessions undefined — the exact corruption invariants 6 exists to prevent.
2. **Smallest blast radius:** 3-4 files, zero migration (SQLite nullable change = table rebuild anyway), zero adapter/UI change. Honors "no big schema change — reuse the verified class-centric kernel".
3. **Satisfies the DOD end-to-end:** the E2E unavoidably enrolls a student before check-in, so "tạo lớp có lịch → thấy buổi" completes with one extra already-shipped step; the UI cannot render a studentless lesson card anyway.
4. **Race/idempotency for free:** generation is atomic with enrollment creation in one `db.batch`; new edit endpoints copy the check-in guard verbatim (org-scoped pre-read + conditional `UPDATE ... WHERE status='upcoming' ... RETURNING` → 409 on zero rows). Create endpoint validates class org-scoping (`findClass` pattern, kernel.ts:78-84) and, if `enrollmentId` supplied, the enrollment↔class pairing (mirror :327-329).

Runner-up: Option A (literal reading of "generate at class creation") — only if the issue owner explicitly rejects the enroll-time interpretation; cost is a table-rebuild migration + invariant-2 rewrite + undefined check-in semantics for class-level rows. Option C/D: reject.

Generator values (from §2-3): `day = scheduleDayIndex + 1`, `time = schedule.start`, `dur = minutesBetween(start, end) wrapping midnight`, `type = "1:1"`, `status = "upcoming"`, `topic = ""`, `zoom = ""`, count = `sessionsTotal`, anchored at first schedule weekday on/after `startDate` (parsed `YYYY-MM-DD`, fallback today Asia/Ho_Chi_Minh when `""`/legacy).

## Unresolved questions

1. **Count source**: `class.sessionsTotal` (12) vs `package.total` (10) for generation count — recommend sessionsTotal; needs issue-owner confirmation.
2. **Legacy enrollments** (pre-#55, staging): backfill one-off vs accept gap — recommend accept (staging data, roadmap M1 not live).
3. **sessionsDone distinct-(day,time) collapse across weeks** — pre-existing derive limitation that becomes visible once 12 weekly sessions exist; decide in #56 whether a date column / occurrence index is needed (schema change, out of #55 scope).
4. **Edit matrix for #55**: proposed `upcoming`-only edits (409 otherwise, mirroring check-in); confirm completed lessons are immutable (recommended — protects both derives).
5. **Lesson-create contract day convention**: recommend 1-7 (matches stored rows + all renderers) with an explicit doc comment, despite schedule JSON being 0-6 — the off-by-one must be pinned in the contract, not left implicit.
