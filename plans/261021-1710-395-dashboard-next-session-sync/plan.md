---
title: "Student: dashboard không còn chỉ buổi hôm nay đã qua giờ làm \"Buổi tới\" (đồng bộ server với #393)"
description: "loadNextSession (server) bỏ qua buổi đã qua giờ kết thúc (date + time + dur, giờ VN) qua helper chung packages/api/vietnam-date.ts; client isLessonEnded delegate cùng helper. Không đổi contract/API."
status: completed
priority: P2
effort: "2h"
issue: 395
branch: ai-handle-issue-395
tags: [backend, server, student, dashboard]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Dashboard học viên: bỏ buổi đã qua giờ kết thúc khỏi "Buổi tới"

## Hiện trạng (đã đọc code)

- `apps/server/src/routes/student-class.ts:70-93` — `loadNextSession(db, orgId, classId, todayISO)` chỉ lọc `isNotNull(lesson.date)` + `gte(lesson.date, todayISO)`, không xét giờ kết thúc; `orderBy(date, day, time) LIMIT 1` nên buổi **hôm nay đã qua giờ kết thúc** vẫn được chọn làm `nextSession`.
- Client app student đã đồng bộ ở #393: `apps/student/src/components/class/class-lesson-list.tsx` — `isLessonEnded(lesson, now)` (chỉ `status === "upcoming"` + `date != null`; end = `new Date(\`${date}T${time}:00+07:00\`) + dur*60_000`; `end <= now` → đã kết thúc; `Date` ra `NaN` khi `time` lệch format → không coi là kết thúc) và `findNextLessonId(lessons, todayISO, now)` (upcoming + `date >= todayISO` + chưa kết thúc).
- Server chạy ngược lại: `GET /api/student/overview` (`student.ts:835`) và `GET /api/student/classes/:classId` (`student.ts:905`) gọi `loadNextSession` với `vietnamTodayISO()` (đồng hồ thật, không inject được `now` từ test route-level).
- Dashboard hiển thị `classes[].nextSession` / `class.nextSession` ở `apps/student` (overview class-card, upcoming-sessions) — server fix một chạm phủ hết các surface, không đụng component.
- DB là **SQLite** (libsql + drizzle, `packages/db/src/schema/lesson.ts`): `date` text|null (`yyyy-mm-dd`), `time` text (`HH:MM` — `TIME_REGEX` contracts.ts:32 ràng buộc ở mọi write path: producer `generateScheduleLessons` fail-closed, `lessonEditSchema` contracts.ts:1055), `dur` integer phút (zod min 1 max 1440), `day` integer notNull (1=Mon…7=Sun), `status` text default `upcoming`. Row **có `date` mà `time` lệch format không thể sinh qua write path nào** — nhánh NaN/fallback chỉ là phòng thủ khi invariant vỡ, không phải dữ liệu hiện hữu (red-team #395, WideToad F4). Không có interval/regex SQL kiểu Postgres → lọc giờ kết thúc làm phía TS.
- `loadNextSession` hiện **không lọc `status`** — buổi `completed` hôm nay (đã check-in) cũng đang bị trả làm "Buổi tới". Semantics "đã qua giờ kết thúc" áp cho mọi status tự nhiên khắc phục cả trường hợp này.
- Test harness server: vitest + `createClient({url: "file::memory:"})` + migrations thật, cả file bọc trong **một** describe top-level duy nhất với `app`/`libsql` là biến riêng của describe đó; seed của `student.test.ts` dùng **ngày cố định** (2026-01-05, 2099-01-01 — vô cảm đồng hồ), convention seed-relative-`vietnamTodayISO()` chỉ có ở `kernel.test.ts:3303`. Mọi request test đi qua `app.request(path, { headers: { "x-test-user": … } })` (không có helper `call`). Red-team #395: test mới của plan này dùng seed độc lập đồng hồ (dur 0 / end sang ngày), **không dùng fake timers** với harness libsql.
- `packages/api/src/vietnam-date.ts` là **single-source** hàm ngày giờ VN cho cả server + web (docblock #208); `apps/student` đã import module này ở nhiều file. Test trong `packages/api/src/` đặt cạnh source (`*.test.ts`).

## Outcome / Constraints / Non-goals / Acceptance

- **Outcome:** `nextSession` trả về cho dashboard học viên (overview + chi tiết lớp) không bao giờ là buổi đã qua thời điểm kết thúc (`date` + `time` + `dur` phút, giờ VN UTC+7); nếu buổi sớm nhất trong ngày đã kết thúc mà còn buổi sau trong ngày thì trả buổi sau; nếu không còn buổi nào hợp lệ → `null` (không có "Buổi tới").
- **Constraints:** không đổi shape `StudentNextSession` hay bất kỳ contract công khai; toàn bộ toán học múi giờ gom về **một** helper thuần trong `packages/api/src/vietnam-date.ts` nhận tham số tường minh, không đọc `Date` ngầm bên trong helper; `now` được tiêm vào `loadNextSession` để test xác định.
- **Non-goals:** không đổi `status` trong DB, không đụng app giáo viên, không đổi component dashboard (`overview/class-card.tsx`, `upcoming-sessions.tsx`), không thêm lọc `status`/`cancelled` mới vào `loadNextSession` (ngoài scope issue), không thêm assertion e2e mới cho ranh giới "hôm nay đã qua giờ" (e2e không inject được đồng hồ — bảo vệ bằng server test seed độc lập đồng hồ), không log-once khi `end == null` ở server (red-team gợi ý nhưng ngoài scope), không đổi badge/tab phía client (chỉ delegate phép tính end-time, giữ nguyên behavior #393).
- **Acceptance:**
  1. Route-level (server test, seed **độc lập đồng hồ thật** — chạy đúng mọi giờ trong ngày): overview và chi tiết lớp **không** trả buổi hôm nay đã qua giờ kết thúc (`00:00` + dur 0 = end 00:00 VN, luôn đã hết) làm `nextSession`; trả buổi `23:00` cùng ngày (end sang ngày, luôn chưa hết); lớp có buổi time lệch format (phòng thủ invariant vỡ — không thể sinh qua write path) → trả buổi đó (fallback NaN→không-ended, nhất quán client); lớp chỉ có `date = null` → `null`.
  2. Ranh giới (loader-level, inject `now` trực tiếp): `end == now` → đã kết thúc (bỏ qua); `end > now` → được chọn. Khớp `<=` của `isLessonEnded` client.
  3. `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter student test` xanh.
  4. Toàn bộ test student #393 giữ nguyên assertion vẫn xanh sau khi `isLessonEnded` delegate helper chung (gate: `git diff` không chạm `apps/student/test/`).
  5. Full `pnpm --filter e2e e2e` với `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` xanh trước merge — đây là **gate bắt buộc theo quy ước repo (AGENTS.md)**, không phải coverage cho diff này (e2e hiện không có assertion nào đi qua `nextSession` server; red-team: nếu `loadNextSession` regressed thành luôn trả `null` thì gate này vẫn xanh — bảo vệ thật của diff là route tests ở Acceptance 1).

## Phases

| # | Phase | Trạng thái |
|---|-------|-----------|
| 1 | [Helper chung + server `loadNextSession` + test (TDD)](phase-01-server-next-session.md) | completed |
| 2 | [Client `isLessonEnded` delegate helper chung](phase-02-client-delegate.md) | completed |

## Câu hỏi còn mở

- Không còn câu hỏi mở. Hai lựa chọn từ issue đã quyết: fix **server** (`loadNextSession`) thay vì lọc client dashboard (một điểm thay đổi phủ mọi surface dashboard, nhất quán nguồn dữ liệu); delegate `isLessonEnded` sang helper chung để hết trùng lặp toán học múi giờ (khớp nguyên tắc single-source của `vietnam-date.ts`).

## Kongming Advisory Review (checkpoint sau investigation — 2026-10-21)

**Go/No-go: GO** — đã thẩm định toàn bộ bằng chứng + blast radius (`loadNextSession` chỉ có đúng 2 caller: `student.ts:835`, `:905`; không phải API công khai).

Tinh chỉnh đã áp vào phase files:
1. `dur` vào select nhưng KHÔNG vào response (giữ `{date, time, topic}` — contract `StudentNextSession` không đổi).
2. Dọn biến chết: `todayISO` ở `student.ts:819` xóa, thay một `const now = new Date()` mỗi request.
3. Predicate NaN nhất quán 2 phía: `end === null` → coi là **chưa kết thúc** (conservative như #393); `time` NOT NULL trong schema nên không cần xử lý null.
4. Giữ nguyên `orderBy(date, day, time)` + chọn row đầu chưa ended (quirk sắp thứ tự text `time` legacy là vấn đề có sẵn, KHÔNG đụng).

Rủi ro đã ghi nhận (đã hiệu chỉnh sau red-team — xem mục Red Team Review):
- ~~Fake timers × libsql harness~~ → **bác ở red-team (F4 LivePiranha):** bỏ hẳn fake timers; test dùng seed độc lập đồng hồ (dur 0 = end 00:00 VN hôm nay luôn đã hết; 23:00+90' = end sang ngày luôn chưa hết). Không còn rủi ro treo libsql.
- ~~Cạm bẫy ngược chiều: test ~741 pin buổi absent~~ → **sai bằng chứng (F3 WideToad):** assertion ~741 khớp CẢ `les-1` (upcoming, seed ~126) lẫn `les-peer` (absent, seed ~676) vì trùng date/time/topic, tie-break rowid → `les-1` thắng. KHÔNG có test pin hành vi absent-inclusive. Quyết định **không gate status vẫn giữ** nhưng với lý do đúng: predicate thuần thời gian là phạm vi issue #395; gate status là policy client #393 và sẽ âm thầm đổi hành vi lớp có buổi tới bị check-in sớm mà không test nào chặn.
- "Completed hôm nay hết giờ không còn là Buổi tới" không phải scope creep — cùng predicate "đã qua giờ kết thúc".
- Đã loại trừ: seed `2099-01-01` tương lai xa không vỡ; index `lesson_class_date_idx` phủ query; khối lượng row nhỏ nên bỏ `limit 1` an toàn.

Client delegation: **ĐỒNG Ý** — delegate phần MATH (`vietnamSessionEndMs` nhận primitive, trả epoch ms hoặc `null`), giữ phần POLICY (gate upcoming + fallback) phía client wrapper.

## Red Team Review

### Session — 2026-10-21
**Reviewers:** 2 subagent song song (fresh context) — Security Adversary (WideToad) + Assumption Destroyer (LivePiranha), cả hai mang vai Fact Checker (Light tier, 2 phases).
**Findings:** 9 sau dedup (5 accepted nguyên bản, 2 accepted kèm redesign, 2 corrected claim) — 0 Critical, 3 High, 6 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Snippet test dùng API harness không tồn tại (`t.call`, `session: "student-1"`) — harness thật là `app.request` + header `x-test-user` (cả 2 reviewer) | High | Accept | phase-01 Task 1.2 |
| 2 | Seed enrollment thiếu `orgId` (notNull) → beforeAll văng NOT NULL | High | Accept | phase-01 Task 1.2 |
| 3 | Describe mới đặt "cuối file" top-level sẽ không thấy `app`/`libsql` (scope của describe gốc) | Medium | Accept | phase-01 Task 1.2/1.4 |
| 4 | Ma trận RED sai: Test 3 (legacy "7pm") fail ở RED vì "08:00" < "7pm" text-order (cả 2 reviewer) | High | Accept + redesign seed 395b (buổi ended chuyển sang YESTERDAY bị gte loại → T3 pass ở cả RED/GREEN, chỉ pin fallback; RED proof = T1/T2) | phase-01 Task 1.2 |
| 5 | Test 2-4 ngầm cần fake clock nhưng chỉ Test 1 có snippet; không fake thì GREEN không đạt (LivePiranha) | High | Accept + redesign: **bỏ hẳn fake timers** — seed độc lập đồng hồ (dur 0 = end 00:00 VN luôn đã hết; 23:00+90' = end sang ngày luôn chưa hết), mọi giờ chạy test đều deterministic | phase-01 Task 1.2, plan.md Acceptance 1 |
| 6 | "Convention seed-relative `vietnamTodayISO()`" sai cho `student.test.ts` (0 lần dùng; file seed ngày cố định) (LivePiranha P1-7) | Medium | Accept | plan.md Hiện trạng |
| 7 | "Bằng chứng cứng" kongming về test pin absent là SAI: assertion ~741 khớp cả les-1 (upcoming) lẫn les-peer (absent) — tie-break rowid; không test nào chặn status gate (WideToad F3) | Medium | Accept — quyết định không gate status GIỮ, đổi lý sang phạm vi/semantics | plan.md Kongming section, phase-01 Task 1.3 |
| 8 | E2E regression gate phủ 0% diff (0 tham chiếu `nextSession` trong e2e; assertion "Buổi tới" duy nhất đi client path) (LivePiranha F6) | Medium | Accept — giữ gate vì AGENTS.md bắt buộc, ghi rõ đây là compliance gate không phải coverage | plan.md Acceptance 5, phase-02 Verification |
| 9 | Gate "số test không giảm" không đo được tự động; rủi ro thật của phase 2 là policy change — đã bị pin bởi `describe("isLessonEnded")` có sẵn (LivePiranha F7) | Medium | Accept — thay bằng gate git-diff + trỏ test pin có sẵn | phase-02 Task 2.1 |

Từ chối/không áp (có ghi nhận): log-once khi `end == null` ở server (WideToad F4 gợi ý) — ngoài scope issue, chỉ ghi vào Non-goals; assertion `"24:00"` cho helper (WideToad F5) — V8 parse được `T24:00:00` ra số (đã verify trên Node repo), không phải NaN nên assertion `null` sẽ sai; thay bằng `"08:00 "` + `"7:00"` (NaN đã verify).

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-server-next-session.md`, `phase-02-client-delegate.md` (sau khi áp findings).
- Decision deltas: (1) bỏ fake timers → mọi mention `vi.useFakeTimers`/`toFake` đã xoá khỏi phase-01, plan.md Hiện trạng + Non-goals + Kongming section ghi rõ bị bác/redesign; (2) seed 395a/395b mới (dur 0, 23:00+90, YESTERDAY) → phase-01 Task 1.2 viết lại trọn, Acceptance 1 đồng bộ; (3) status-gate rationale đổi từ "test pin" sang "phạm vi/semantics" → đồng bộ phase-01 Task 1.3 + Kongming annotation; (4) e2e gate reword → Acceptance 5 + phase-02 Verification khớp nhau; (5) phase-2 gate git-diff → Task 2.1 + Verification khớp nhau.
- Đã kiểm: không còn text nào trong 3 file plan nói "Test 3 pass từ đầu" với seed cũ, "t.call", "Date giả lập", hay "test ~741 pin absent" theo nghĩa cũ.
- Unresolved contradictions: 0.
