---
phase: 1
title: "Contracts + schedule-driven lesson generation on enrollment"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 01: Contracts + schedule-driven lesson generation on enrollment

## Overview

Thêm `lessonEditSchema` vào contracts (toàn bộ thay đổi contracts.ts dồn về phase này) và sinh lesson rows từ structured schedule của lớp ngay khi enrollment tạo — mở rộng batch của POST /students (apps/server/src/routes/kernel.ts:156-208). Pure generator tách riêng để unit-test độc lập route. Kết thúc phase: "tạo lớp có lịch → thêm học viên → GET /kernel thấy N buổi upcoming" (M1 DOD flow, phần API).

## Requirements

- [x] `lessonEditSchema` trong contracts.ts: strict, full-replace fields `day/time/dur/topic/zoom`, KHÔNG cho phép `status`/`type` (client không thể forge); `topic` `.max(500)`, `zoom` `.max(2048)` + chỉ "" hoặc `https://` (red-team S1/S3).
- [x] `sessionsTotal` trong `classCreateSchema` thêm `.max(52)` (red-team F1/A1 — chống poison class); boundary test 53 → 400.
- [x] Pure generator: schedule JSON string + sessionsTotal + (orgId, classId, enrollmentId) → mảng lesson row values. Không db, không crypto (id do caller gán).
- [x] POST /students với `classId`: sinh đúng `sessionsTotal` rows `status: "upcoming"`, `type: "1:1"`, `topic: ""`, `zoom: ""`, trong CÙNG `db.batch` với student+enrollment+sessionPackage.
- [x] Mapping: `day = scheduleDay + 1` (schedule 0-6 0=Monday → lesson 1-7 1=Monday); `time = schedule.start`; `dur = (endMin − startMin + 1440) % 1440` phút.
- [x] Phân bổ: cycle qua sorted unique days (`i % days.length`), tổng đúng `sessionsTotal` rows.
- [x] Legacy/invalid schedule (free-text, parse fail, `start === end`) → 0 lessons, KHÔNG throw, student/enrollment/package vẫn tạo.
- [x] `sessionsTotal = 0` → 0 lessons (hợp lệ, zod min 0).
- [x] Không `classId` → 0 lessons + 0 enrollment (behavior hiện có, regression lock).

## Architecture

**Data flow:** POST /students (body có classId) → readBody(`studentCreateSchema`, contracts.ts:9-17) → SELECT class `{id, schedule, sessionsTotal}` org-scoped (mở rộng block kernel.ts:164-170, một query) → generator parse `schedule` TEXT (JSON `{days,start,end}`; normalize ở create đã dedupe+sort days, kernel.ts:246-249 — generator vẫn defensively dedupe+sort) → N row values → mỗi row `db.insert(lesson).values({ id: crypto.randomUUID(), createdAt: default, ...row })` push vào `statements` sau sessionPackage (kernel.ts:184-204) → một `db.batch(statements)` (kernel.ts:206) atomic trên D1 (implicit transaction) và libsql test.

**Generator (export từ kernel.ts — convention helper local trong route file, như `formatDayMonth` kernel.ts:560-566; export để unit-test import trực tiếp):**

```ts
// Kernel-local: server không import được apps/web/src/lib/format-schedule.ts
// (parseSchedule/addMinutes là web-only) — parse lại dạng tối giản tại đây.
export function generateScheduleLessons(input: {
	schedule: string;        // raw TEXT từ class row (JSON hoặc legacy free-text)
	sessionsTotal: number;
	orgId: string;
	classId: string;
	enrollmentId: string;
}): Array<Omit<typeof lesson.$inferInsert, "id" | "createdAt">>
```

- Parse local: JSON.parse → validate `days` (array int 0-6, non-empty, dedupe+sort), `start`/`end` match `TIME_REGEX` (contracts.ts:31), và `start !== end` (mirror superRefine contracts.ts:61-67 — row legacy vi phạm → invalid). Fail bất kỳ → trả `[]`.
- Dur: `toMinutes(end) − toMinutes(start)`, cộng 1440 nếu ≤ 0 rồi % 1440 (start≠end ⇒ dur ≥ 1; ví dụ 23:00→00:30 = 90).
- Row i (i = 0..sessionsTotal−1): `day = sortedDays[i % sortedDays.length] + 1`.
- Values cố định: `type: "1:1"` (schema default, lesson.ts:32), `status: "upcoming"` (lesson.ts:33 — KHÔNG BAO GIỜ "completed", kẻo inflate invariant 6 done, repos/students.ts:41-52), `topic: ""`, `zoom: ""` (lesson.ts:34-35).
- KHÔNG thêm `LESSON_TYPES` vào contracts: generator chỉ ghi "1:1", edit không đổi type; whitelist type giữ nguyên web-side (repos/lessons.ts:12-18).

**Contract addition (contracts.ts, đặt cạnh `lessonActionSchema` :153):**

```ts
/**
 * Sửa buổi lên lịch — full-replace, upcoming-only. day: 1 = Monday … 7 = Sunday
 * (lesson-day convention; schedule JSON của lớp là 0-based — pin off-by-one tại đây).
 * CẢNH BÁO consumer (#56): đây là full-replace — field bị omit lấy default ""
 * và WIPE giá trị đang có của topic/zoom; client phải gửi đủ 5 field.
 * zoom chỉ chấp nhận "" hoặc URL https:// (field được dán vào Zalo template —
 * settings.tsx:23; chặn scheme injection).
 */
export const lessonEditSchema = z
	.object({
		day: z.number().int().min(1).max(7),
		time: z.string().regex(TIME_REGEX),
		dur: z.number().int().min(1).max(1440),
		topic: z.string().max(500).default(""),
		zoom: z
			.string()
			.max(2048)
			.default("")
			.refine((v) => v === "" || v.startsWith("https://"), {
				message: "zoom phải là URL https:// hoặc rỗng",
			}),
	})
	.strict();
export type LessonEdit = z.infer<typeof lessonEditSchema>;
```

`.strict()` theo precedent `lessonActionSchema` (contracts.ts:153) và `invoiceMarkPaidSchema` (:157-160); `topic`/`zoom` default "" theo `moduleUpsertSchema` (:105-109); `.max()` theo precedent `commentBankCreateSchema` `.max(2000)` (:140-146) — mọi string client-writable ở trust boundary đều phải cap (red-team S1/S3/F5). Phase 2 consume schema này.

**Cap `sessionsTotal` (red-team F1/A1 — Critical):** thêm `.max(52)` vào `sessionsTotal` trong `classCreateSchema` (contracts.ts:57): `z.number().int().min(0).max(52).default(12)`. Không có cap, teacher gõ 5000 → mỗi enroll dựng batch ~5000 statements → D1 reject/CPU timeout → **lớp chết vĩnh viễn** (không có endpoint sửa/xóa lớp — kernel.ts chỉ có create :223, assign-syllabus :259, notes :285). 52 = 1 buổi/tuần × 1 năm. Boundary tests: `sessionsTotal: 53` → 400; 52 hợp lệ. Generator KHÔNG clamp thêm — contract là single source of truth; lớp legacy staging (pre-cap) không tồn tại theo fresh-org DOD (roadmap :41).

**Batch atomicity (lý do không cần idempotency riêng):** `db.batch` = implicit transaction trên D1 (Cloudflare docs; mapping D1Database.batch) và libsql/Hrana single-connection `file::memory:` trong test — không tồn tại state "student có enrollment nhưng thiếu lessons". Hai POST /students giống hệt nhau vẫn là 2 student riêng (behavior hiện có, không đổi) — **nhưng blast radius của double-submit/outcome-unknown retry nay nhân lên: mỗi lần trùng = student + enrollment + package + N lesson rows trùng nhau trên /schedule, không có endpoint dọn** (web phân loại 5xx/timeout là outcome-unknown và form thường cho phép submit lại — repos/kernel.ts:173-183; red-team S7/A6). Chấp nhận rủi ro ở #55 (không thêm operationId — xem NOT in scope plan.md), ghi rõ vào risk table + hand-off #56. Kích thước batch bị chặn bởi cap contract `sessionsTotal ≤ 52` (F1/A1); test với `sessionsTotal = 50`. **Lưu ý verification:** claim "atomic trên D1" là docs-based (research report :107 thừa nhận chưa chạy thử trên D1 thật) — xác minh trên D1 thật xảy ra ở bước ship-stage deploy beta (ak:ship), KHÔNG phải phase 3 (phase 3 chỉ gate local — red-team S6/F3).

## Related Code Files

| File | Change |
|---|---|
| packages/api/src/contracts.ts | THÊM `lessonEditSchema` + `LessonEdit` (additive); THÊM `.max(52)` cho `sessionsTotal` trong `classCreateSchema` (red-team F1/A1; không build step — exports trỏ TS source, packages/api/package.json:4-7) |
| apps/server/src/routes/kernel.ts | THÊM `generateScheduleLessons` (export) + parse local; SỬA POST /students: select thêm `schedule`/`sessionsTotal`, push N lesson insert vào `statements` (kernel.ts:156-208) |
| apps/server/src/kernel.test.ts | THÊM describe "schedule-driven lesson generation" (unit generator + integration POST /students + cross-org + multi-enrollment + divergence pin + boundary 53→400); CẬP NHẬT doc comment `insertLesson` (:126-130 — "no lesson-create endpoint exists yet" đã stale: generation giờ có, one-off endpoint vẫn không có; helper giữ cho adversarial rows) |
| apps/web/src/lib/repos/kernel.test.ts (hoặc file test repos classes hiện có) | THÊM characterization test pin collapse: N completed lessons trùng (day,time) → `sessionsDone` = distinct count (red-target cho #56 sửa derive — red-team S2/A2) |

Không đổi: packages/db (0 migration), apps/web production code (chỉ thêm test pin collapse), snapshot loader (lessons đã có sẵn qua snapshot.ts:139-141, :235-246 — generated rows xuất hiện trong snapshot không cần thay đổi; lưu ý week-grid /schedule hiện tĩnh [schedule.tsx:31, mock-data.ts:156-157] nên "hiển thị đúng" đầy đủ thuộc #56 — red-team A5).

## Implementation Steps

**(A) Characterization tests — pin behavior hiện có (chạy XANH trước khi sửa):**

1. Trong `kernel.test.ts`, thêm describe "schedule-driven lesson generation" dùng harness có sẵn `createTestApp` (:44-284), `createClass` (:192-213), `addStudent` (:248-268), `kernel` snapshot fetch (:186-190). Test characterization:
   - `addStudent` KHÔNG classId → snapshot `lessons` rỗng.
   - `addStudent` CÓ classId (lớp schedule `{days:[1,3], start:"19:00", end:"20:30"}`) → status 201, snapshot `lessons` rỗng (behavior HIỆN TẠI — sẽ lật xanh thành "N rows" ở bước C).
2. Chạy `pnpm test` từ repo root — tất cả xanh (baseline lock).

**(B) New-behavior tests VIẾT TRƯỚC (fail-first):**

3. Unit generator (import `generateScheduleLessons` từ `./routes/kernel`): count = sessionsTotal; day mapping `+1` (days `[2,4]` → chỉ day 3 và 5); time = start; dur thường (19:00→20:30 = 90); dur cross-midnight (23:00→00:30 = 90); cycle đều (days `[1,3]`, total 6 → 3 row day 2, 3 row day 4); days duplicate input → dedupe; `sessionsTotal = 0` → `[]`; schedule `"Tối thứ 3"` (free-text) → `[]`; JSON sai shape / `days: []` / `start === end` → `[]`.
4. Integration: `createClass` → `addStudent({classId})` → `kernel()` assert: đúng `sessionsTotal` lessons; mọi row `status:"upcoming"`, `type:"1:1"`, `time:"19:00"`, `dur:90`, day ∈ {2,4}; `enrollmentId` khớp enrollment của student vừa thêm; `sessionsTotal = 50` vẫn 50 rows; legacy schedule (insert `classTable` trực tiếp với `schedule: "Tối thứ 3"`) → `addStudent` 201 + 0 lessons **+ assert `snapshot.enrollments` và `snapshot.packages` vẫn có 1 row mỗi loại** (red-team A7 — chặn regress "fail-closed nuốt luôn enrollment", mirror assert pattern kernel.test.ts:740-748).
5. Integration bổ sung (red-team S5/F6 — org-scoped generation + group class):
   - **Cross-org:** org B `addStudent` với `classId` của org A → 404; snapshot org A có N lessons; snapshot org B `lessons` rỗng (mirror :1582-1629).
   - **Multi-enrollment (group):** cùng lớp, 2 `addStudent` liên tiếp → snapshot có 2×N lessons, mỗi nhóm N row mang `enrollmentId` riêng (không cross-contaminate), day/time khớp nhau (red-team F7 — pin invariant 2 cho "1:2").
   - **Divergence pin (red-team S2/A2):** `createClass` sessionsTotal=12 + `addStudent` total=10 (defaults) → assert snapshot có 12 lessons VÀ package `total: 10` — pin quyết định domain: `class.sessionsTotal` (series长度) và `package.total` (entitlement mua) là 2 khái niệm độc lập, không ràng buộc nhau trên wire.
   - **Contract boundary:** `createClass` với `sessionsTotal: 53` → 400; `sessionsTotal: 52` → 201 (cap F1/A1).
6. Chạy `pnpm test` — các test mới fail (generator chưa tồn tại ⇒ type error là fail-first hợp lệ ở bước này).

**(C) Implement:**

7. contracts.ts: thêm `lessonEditSchema` (snippet ở Architecture) + `.max(52)` cho `sessionsTotal` trong `classCreateSchema`.
8. kernel.ts: thêm parse local + `generateScheduleLessons` (export, đặt cạnh các helper trước routes, theo style `findLessonAction` :129-141).
9. kernel.ts POST /students: trong block `if (input.classId)` đổi select thành `{ id, schedule, sessionsTotal }`; sau push sessionPackage (:193-203), generate rows và `statements.push(...rows.map(row => db.insert(lesson).values({ id: crypto.randomUUID(), ...row })))`. Batch tại :206 giữ nguyên.
10. Cập nhật doc comment `insertLesson` (kernel.test.ts:126-130).
11. Chạy `pnpm test` — toàn bộ xanh (A vẫn xanh: no-classId path không đổi; test "có classId → 0 lessons" ở bước 2 được thay/assert lại thành N rows trong test ở bước 4).

**(D) Regression gate:**

12. `pnpm test` (root — bao gồm `test:ci-workflow` + `test:topology-drift`, package.json:19-21).
13. `pnpm exec biome check .` (parity CI ci.yml:32; auto-fix trong dev: `pnpm check`).
14. `pnpm check-types` && `pnpm build` (packages/api không build nhưng server import TS source — tsc + tsdown bắt type error).

## Success Criteria

- [x] Unit generator xanh: count/weekday+1/time/dur/cross-midnight/cycle/dedupe/zero-cases/legacy-cases.
- [x] Integration xanh: addStudent với classId → đúng N rows upcoming trên GET /kernel; enrollmentId khớp; sessionsTotal 50 OK; sessionsTotal 0 → 0 rows; no-classId → 0 rows (regression); legacy schedule → 201 + 0 rows.
- [x] 0 thay đổi trong packages/db (schema + migrations) — xác nhận bằng `git status`.
- [x] Gate (D) xanh đủ 4 lệnh.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Off-by-one day (schedule 0-6 vs lesson 1-7) | Trung bình (đã có 2 convention trong codebase) | Cao — buổi sai cột weekly grid | Mapping `+1` pin bằng unit test days `[2,4]` → day {3,5}; doc comment trong contract; KHÔNG dùng JS getDay |
| `sessionsTotal` không cap → poison class (enroll batch nổ, lớp không sửa được) | Trung bình (UI là number tự do, add-class-modal.tsx:117) | Cao — lớp chết vĩnh viễn, không có đường sửa | Cap contract `.max(52)` + boundary test 53 → 400 (red-team F1/A1) |
| Generated rows inflate `done`/`sessionsDone` | Thấp | Cao (invariant 6/7) | Luôn `status:"upcoming"`; test assert status từng row; derives chỉ đếm completed (repos/students.ts:41-48, repos/classes.ts:29-34) |
| **sessionsDone distinct-(day,time) collapse bị KÍCH HOẠT bởi plan này** (không phải pre-existing — lesson.ts:11-13 chưa từng có create path production; 12 buổi T3/T5 → sessionsDone mãi 2/12) | Cao (happy path mặc định) | Cao — M1 "tiến độ lớp derive từ lesson thật" (roadmap :34) sai cấu trúc | Không sửa derive ở #55 (thuộc web repo classes.ts, giao #56 kèm red-target test pin hành vi sai); relabel + hand-off rõ (red-team S2/A2/F4) |
| Legacy schedule làm POST /students 500 | Trung bình (data staging cũ) | Cao — chặn thêm học viên lớp cũ | Generator fail-closed → `[]`, không throw; test legacy case + assert enrollment/package vẫn tạo (A7) |
| Double-submit / outcome-unknown retry POST /students nhân bản N lessons, không có đường dọn | Trung bình (mạng chập, double-click) | Trung bình — schedule hiện 2N buổi, teacher cancel tay | Chấp nhận ở #55 (behavior "mỗi POST = student mới" giữ nguyên); ghi hand-off #56 (red-team S7/A6); operationId deferred (NOT in scope) |
| Snapshot amplification: lessons đi từ ~0 lên Σ(enrollments × sessionsTotal), GET /kernel không phân trang (snapshot.ts:135-151) | Chắc chắn theo thời gian pilot (10 lớp × 10 HV × 24 buổi ≈ 2.400 row) | Trung bình — payload/latency/read cost tăng tuyến tính | Pre-existing read pattern; ước tính ghi nhận; follow-up pagination/direct-query cho GET /students//classes (kernel.ts:149-154, :210-215) — ngoài scope #55 (red-team S8) |
| Batch lớn fail trên D1 thật (không tái hiện được trên libsql) | Thấp (cap 52) | Trung phương | Cap contract 52; verify trên D1 thật ở ship-stage beta deploy, KHÔNG phải phase 3 (red-team S6/F3) |
| Test helper `createClass` days `[1,3]` bị đọc nhầm là lesson-day | Trung bình (confusion) | Thấp | Là schedule-day 0-based (= T3, T5); comment rõ trong test mới |
