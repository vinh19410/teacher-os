---
phase: 1
title: "Helper chung + server loadNextSession bỏ qua buổi đã kết thúc + test (TDD)"
status: completed
priority: P2
effort: "1h 30m"
dependencies: []
---

# Phase 1: Helper chung + server `loadNextSession` + test (TDD)

## Goal
`loadNextSession` không bao giờ trả buổi đã qua giờ kết thúc (date + time + dur, giờ VN UTC+7) làm "Buổi tới"; phép tính end-time sống trong một helper thuần chung tại `packages/api/src/vietnam-date.ts`.

## Files to Create / Modify
- Create: `packages/api/src/vietnam-date.test.ts`
- Modify: `packages/api/src/vietnam-date.ts` (thêm `vietnamSessionEndMs`)
- Modify: `apps/server/src/routes/student-class.ts` (`loadNextSession`)
- Modify: `apps/server/src/routes/student.ts` (2 call sites: overview `~:835`, chi tiết lớp `~:905`)
- Modify: `apps/server/src/student.test.ts` (thêm describe mới LỒNG trong describe gốc)

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

---

### Task 1.1 — Viết helper `vietnamSessionEndMs` + unit test (chưa đụng server)
- Goal: phép tính thời điểm kết thúc buổi (giờ VN) là hàm thuần dùng chung được.
- Target files: `packages/api/src/vietnam-date.ts` (thêm export cuối file), `packages/api/src/vietnam-date.test.ts` (mới, import từ `./vietnam-date`).
- Steps:
  1. Thêm vào `packages/api/src/vietnam-date.ts`:
     ```ts
     /** Thời điểm kết thúc buổi học (yyyy-mm-dd + HH:MM + thời lượng phút, giờ
      * VN UTC+7) dạng epoch ms; null khi date/time lệch format. Input PHẢI là
      * `yyyy-mm-dd` / `HH:MM` đã chuẩn hóa (TIME_REGEX — contracts.ts:32, ràng
      * buộc ở mọi write path); ngoài bất biến đó hành vi là fail-open im lặng
      * (null) — caller tự quyết fallback (server #395 + client #393 cùng nguồn).
      * Red-team #395: row có date mà time lệch format KHÔNG thể sinh qua write
      * path nào (producer fail-closed + zod regex), nhánh null chỉ là phòng thủ
      * khi invariant vỡ, không phải dữ liệu hiện hữu. */
     export function vietnamSessionEndMs(
       date: string,
       time: string,
       durationMinutes: number,
     ): number | null {
       const end = Date.parse(`${date}T${time}:00+07:00`);
       return Number.isNaN(end) ? null : end + durationMinutes * 60_000;
     }
     ```
  2. Tạo `packages/api/src/vietnam-date.test.ts` với các assertion (so sánh với giá trị tính từ `Date.parse` tường minh, KHÔNG dùng `new Date()` thật):
     - `vietnamSessionEndMs("2099-03-10", "08:00", 90)` === `Date.parse("2099-03-10T09:30:00+07:00")`.
     - `vietnamSessionEndMs("2099-03-09", "23:30", 90)` === `Date.parse("2099-03-10T01:00:00+07:00")` (qua nửa đêm).
     - Giá trị lệch format → `null`: `("2099-03-10", "7pm", 60)`; `("2099-03-10", "7:00", 60)` (giờ 1 chữ số — đã verify NaN trên Node runtime repo); `("2099-03-10", "08:00 ", 60)` (dấu cách đuôi); `("10/03/2099", "08:00", 60)`; `("2099-03-10", "", 60)`.
     - (KhÔNG assert case `"24:00"` — V8 parse được giá trị này ra số, không phải NaN; đã verify, TIME_REGEX chặn upstream.)
- Success criteria: helper export tồn tại, unit test xanh.
- Verify: `pnpm --filter @teacher-os/api exec vitest run src/vietnam-date.test.ts` — exit 0, tất cả pass.

### Task 1.2 — (TDD RED) Test server chứng minh bug hiện tại
- Goal: test route thất bại theo đúng nghĩa "buổi hôm nay đã qua giờ vẫn bị trả làm Buổi tới" — chứng minh bug trước khi sửa; test phải **độc lập đồng hồ thật** (chạy đúng mọi giờ trong ngày, không fake timers — red-team #395 đã loại phương án `vi.useFakeTimers` khỏi harness libsql).
- Target files: `apps/server/src/student.test.ts` — thêm `describe("nextSession skips ended today sessions (#395)")` **LỒNG bên trong describe top-level duy nhất của file** (mở ở ~dòng 21, đóng cuối file ~1319), đặt ở CUỐI trước closure — `app` và `libsql` là `let` của describe gốc nên describe con mới dùng được (red-team: describe ngoài top-level sẽ không compile).
- Steps:
  1. Đầu file (nếu chưa có): import `{ addDaysISO, vietnamTodayISO }` từ `@teacher-os/api/vietnam-date` (đã là dependency).
  2. Trong `beforeAll` của describe mới, seed (KHÔNG đụng seed chung của file):
     - 4 lớp mới org-1 (cột như seed mẫu của file: id, orgId, name, level, mode, schedule, sessionsDone 0, sessionsTotal 20, status "active"): `class-395a` ("IELTS 395 A", schedule "T2 00:00–00:30"), `class-395b` ("IELTS 395 B"), `class-395c` ("IELTS 395 C legacy"), `class-395d` ("IELTS 395 D boundary").
     - 4 enrollment **đủ cột `orgId: "org-1"` + `status: "active"`** (red-team: `enrollment.org_id` notNull — thiếu sẽ văng NOT NULL ở beforeAll): `enr-395a/b/c/d` → (class-395a/b/c/d, studentId "student-1").
     - Hằng số: `const TODAY = vietnamTodayISO();` `const YESTERDAY = addDaysISO(TODAY, -1);` `const todayDow = (new Date(TODAY + "T00:00:00Z").getUTCDay() + 6) % 7 + 1;` `const yesterDow = (new Date(YESTERDAY + "T00:00:00Z").getUTCDay() + 6) % 7 + 1;`
     - Bài học class-395a (enrollmentId "enr-395a"):
       - `ls-395a-ended`: date `TODAY`, time `"00:00"`, dur `0`, day `todayDow`, status `"upcoming"`, topic `"Sáng đã kết thúc"` — dur 0 ⇒ end = hôm nay 00:00 VN ⇒ **luôn đã kết thúc** mọi thời điểm chạy test (ranh giới `<=`).
       - `ls-395a-evening`: date `TODAY`, time `"23:00"`, dur `90`, day `todayDow`, upcoming, topic `"Buổi tối"` — end = mai 00:30 VN ⇒ **luôn chưa kết thúc**. Thứ tự text `"00:00" < "23:00"` đảm bảo orderBy đúng.
     - Bài học class-395b (enrollmentId "enr-395b"):
       - `ls-395b-past`: date `YESTERDAY`, time `"23:00"`, dur `59`, day `yesterDow`, upcoming, topic `"Hôm qua"` — bị `gte(date, today)` loại khỏi ứng viên, chỉ tồn tại để lộ thứ tự.
       - `ls-395b-legacy`: date `TODAY`, time `"7pm"`, dur `60`, day `todayDow`, upcoming, topic `"Legacy lệch format"` — **phòng thủ invariant vỡ** (time lệch format không thể sinh qua write path: TIME_REGEX + producer fail-closed; test này khóa fallback NaN→không-ended để ai đó sau này không đổi im lặng).
     - Bài học class-395c (enrollmentId "enr-395c"): `ls-395c-nodate`: date `null`, day `1`, time `"08:00"`, dur `60`, upcoming, topic `"Lớp legacy"`.
     - Bài học class-395d (enrollmentId "enr-395d"): `ls-395d-boundary`: date `"2099-03-10"`, time `"10:30"`, dur `90`, day `2`, upcoming, topic `"Ranh giới"` (2099-03-10 = thứ Ba → day 2; đã verify).
  3. Test 1 + 2 + 3 + 4 (route, đồng hồ thật — KHÔNG dùng `vi.useFakeTimers`):
     ```ts
     test("overview không trả buổi hôm nay đã qua giờ làm Buổi tới", async () => {
       const res = await app.request("/api/student/overview", {
         headers: { "x-test-user": "google-verified" },
       });
       expect(res.status).toBe(200);
       const overview = (await res.json()) as StudentOverview;
       const a = overview.classes.find((c) => c.id === "class-395a");
       expect(a?.nextSession).toEqual({
         date: TODAY,
         time: "23:00",
         topic: "Buổi tối",
       });
     });
     ```
     - Test 2: `app.request("/api/student/classes/class-395a", { headers: { "x-test-user": "google-verified" } })` — `detail.class.nextSession` === `{date: TODAY, time: "23:00", topic: "Buổi tối"}` (shape xem test "returns the class, the student's own lessons…" ~729).
     - Test 3: `/overview` → `class-395b` → `nextSession` === `{date: TODAY, time: "7pm", topic: "Legacy lệch format"}` (end null → không coi là đã kết thúc).
     - Test 4: `/overview` → `class-395c` → `nextSession` === `null`.
     - (`x-test-user: "google-verified"` = student-1/org-1 — shim auth header-pure, không đọc Date; đã verify `student.test.ts:180-232`.)
- Success criteria (ma trận RED — độc lập đồng hồ): Test 1 VÀ Test 2 THẤT BẠI vì nhận `{date: TODAY, time: "00:00", topic: "Sáng đã kết thúc"}` (buổi đã hết giờ vẫn được trả — bug); Test 3 VÀ Test 4 PASS từ đầu (không phụ thuộc fix — chúng pin regression, không phải RED proof).
- Verify: `pnpm --filter server exec vitest run src/student.test.ts -t "395"` — exit code KHÁC 0 và output cho thấy đúng Test 1/Test 2 fail trên assertion `nextSession`, Test 3/Test 4 pass. Đây là RED kỳ vọng của TDD: fail ĐÚNG assertion là pass condition của task này.

### Task 1.3 — Sửa `loadNextSession` + 2 call sites (TDD GREEN)
- Goal: `loadNextSession(db, orgId, classId, now: Date)` bỏ qua buổi đã qua giờ kết thúc; cả hai route truyền cùng một `now` mỗi request.
- Target files: `apps/server/src/routes/student-class.ts` (hàm `loadNextSession`, dòng ~70-93), `apps/server/src/routes/student.ts` (~819, ~835, ~905).
- Steps:
  1. Trước khi sửa: chạy `grep -rn "loadNextSession" apps/ packages/` xác nhận chỉ có 2 call sites (student.ts ~835, ~905) + definition + import (red-team đã xác minh 2 lần, không có caller thứ 3) — nếu thấy call site khác, STOP và báo trong Failure Protocol.
  2. Đổi chữ ký thành `loadNextSession(db: Db, orgId: string, classId: string, now: Date)`; docblock mới: `/** Buổi tới của lớp: buổi có ngày đầu tiên từ hôm nay (giờ VN) trở đi mà CHƯA qua giờ kết thúc (date + time + dur). Bỏ qua buổi hôm nay đã qua giờ (#395, đồng bộ isLessonEnded client). Lớp legacy (date null) không có Buổi tới. */`.
  3. Body mới (thay LIMIT 1 bằng fetch rồi tìm lần đầu hợp lệ — SQLite không có time-math đáng tin cho text HH:MM):
     ```ts
     const todayISO = vietnamTodayISO(now);
     const rows = await db
       .select({ date: lesson.date, time: lesson.time, dur: lesson.dur, topic: lesson.topic })
       .from(lesson)
       .where(
         and(
           eq(lesson.orgId, orgId),
           eq(lesson.classId, classId),
           isNotNull(lesson.date),
           gte(lesson.date, todayISO),
         ),
       )
       .orderBy(asc(lesson.date), asc(lesson.day), asc(lesson.time));
     for (const row of rows) {
       if (row.date == null) continue;
       const end = vietnamSessionEndMs(row.date, row.time, row.dur);
       // time lệch format (end == null) → không đoán, coi là chưa kết thúc
       // (phòng thủ invariant vỡ, nhất quán NaN→false với client #393).
       if (end == null || end > now.getTime()) {
         return { date: row.date, time: row.time, topic: row.topic };
       }
     }
     return null;
     ```
     `dur` vào select nhưng **KHÔNG** vào object trả về (giữ `{date, time, topic}` — contract `StudentNextSession` không đổi). Import `vietnamTodayISO` + `vietnamSessionEndMs` từ `@teacher-os/api/vietnam-date` (kiểm tra import hiện có của file, thêm nếu thiếu).
     - **KHÔNG thêm gate `status === "upcoming"`**: predicate của server là thuần thời gian ("đã qua giờ kết thúc") — đó là phạm vi của issue #395; lọc status là policy hiển thị phía client #393. (Red-team đã bác "bằng chứng test pin absent" của kongming: assertion ~741 khớp cả les-1 upcoming lẫn les-peer absent vì trùng date/time/topic — lý đúng duy nhất là phạm vi, và thêm gate sẽ âm thầm đổi hành vi lớp có buổi tới bị check-in sớm mà không test nào chặn.)
  4. Call site overview (`student.ts` ~818-836): `todayISO` tại ~819 chỉ dùng cho `loadNextSession` (đã xác minh) — **xóa biến chết**, thay bằng `const now = new Date();` một lần mỗi request, và `loadNextSession(db, orgId, cls.id, todayISO)` → `loadNextSession(db, orgId, cls.id, now)` (mọi class trong 1 request nhìn cùng một mốc thời gian).
  5. Call site chi tiết lớp (~905): tạo `const now = new Date();` TRƯỚC `Promise.all`, đổi thành `loadNextSession(db, orgId, row.id, now)`.
- Success criteria: toàn bộ test trong `apps/server/src/student.test.ts` xanh (cả 4 test mới ở Task 1.2/1.4 lẫn test cũ — assertion test cũ không được sửa).
- Verify: `pnpm --filter server exec vitest run src/student.test.ts` — exit 0, không test fail.

### Task 1.4 — Ranh giới end == now (loader-level, inject `now` trực tiếp)
- Goal: khóa semantics ranh giới: đúng bằng giờ kết thúc → đã kết thúc (khớp `<=` của `isLessonEnded`).
- Target files: `apps/server/src/student.test.ts` — thêm 2 test trong describe của Task 1.2, import trực tiếp `loadNextSession` từ `./routes/student-class` và dùng `libsql` (describe con có scope).
- Steps:
  1. Dùng seed `ls-395d-boundary` của class-395d (date "2099-03-10", time "10:30", dur 90 — end = 12:00 VN ngày 2099-03-10) đã tạo ở Task 1.2.
  2. Test: `await loadNextSession(libsql, "org-1", "class-395d", new Date("2099-03-10T12:00:00+07:00"))` → `null` (end == now → đã kết thúc).
  3. Test: `await loadNextSession(libsql, "org-1", "class-395d", new Date("2099-03-10T11:59:59+07:00"))` → `{date: "2099-03-10", time: "10:30", topic: "Ranh giới"}` (còn 1 giây → vẫn là Buổi tới).
- Success criteria: 2 test xanh, không phụ thuộc đồng hồ thật (now inject tường minh).
- Verify: `pnpm --filter server exec vitest run src/student.test.ts -t "395"` — exit 0.

---

## Verification (cả phase)
- `pnpm --filter @teacher-os/api exec vitest run src/vietnam-date.test.ts` — exit 0.
- `pnpm --filter server exec vitest run src/student.test.ts` — exit 0 (toàn file, gồm test cũ ~310/~741 không đổi assertion).
- `pnpm --filter server test` — exit 0 (full suite server; KHÔNG chạy song song với e2e stack đang chiếm port — kinh nghiệm journal #393).
- `pnpm check-types` — exit 0.

## Rủi ro đã ghi nhận (red-team 2026-10-21)
- Describe mới phải LỒNG trong describe gốc (`app`/`libsql` scope); enrollment seed đủ `orgId`; harness là `app.request` + header `x-test-user` — không có helper `call`.
- Seed độc lập đồng hồ: `dur 0` = end 00:00 VN hôm nay (luôn đã kết thúc), `23:00+90'` = end mai 00:30 (luôn chưa); cửa sổ flake duy nhất là process chạy xuyên qua đúng 00:00 VN giữa seed và assertion (bỏ qua được về xác suất, ghi nhận tại đây).
- `day` của date động tính theo công thức `(getUTCDay()+6)%7+1` tại seed-time.
