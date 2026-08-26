---
phase: 1
title: "Pure helper class-sessions + unit tests"
status: todo
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Pure helper class-sessions + unit tests

## Overview

Tạo pure helper `apps/web/src/lib/class-sessions.ts` chuyển `{class.schedule, class.startDate, lesson rows đã scope theo classId}` thành danh sách buổi có ngày cụ thể xếp chronological, kèm mapping chủ đề syllabus và trạng thái per-buổi — toàn bộ logic derive nằm ở đây, UI ở Phase 2 chỉ consume. Không đổi server/API/DB.

Model (sửa sau red-team 2026-08-26 — xem `plan.md` ## Red Team Review):

- Lesson rows được generator sinh **per-enrollment**: `sessionsTotal` rows, cycle `days[i % len]`, cùng `time` — tức 26 rows của lớp T3&T6 chỉ tạo ra **2 slot distinct** `(day,time)`. Vì vậy số buổi **KHÔNG** đếm bằng distinct slot count, mà bằng **số rows của 1 enrollment** (max per-sid count).
- Rows không mang occurrence index (id là UUIDv4, `createdAt` không có trong API response) → không thể biết row nào là buổi thứ mấy. Slot `(day,time)` chỉ dùng để **gắn rows vào occurrence** (học viên/status/topic), theo heuristic in-order đã documented (D5/D7 trong `plan.md`).

## Requirements

- Functional:
  - `parseStartDate(raw: string): string | null` — **chỉ nhận ISO `yyyy-mm-dd`** (regex `^\d{4}-\d{2}-\d{2}$`) + roundtrip validity (`new Date(raw + "T00:00:00Z").toISOString().slice(0, 10) === raw` — bắt "2026-02-30") + year bound `[2000, 2100]` (guard style `week-grid.ts:16-18, 36-41`). Mọi format khác — `""`, `"asap"`, `"26-08"`, `"26/08"`, `"25/08/2026"` — → `null`. (Red-team F7: producer duy nhất là `<input type="date">` ghi ISO `apps/web/src/components/modals/add-class-modal.tsx:236-242`, `apps/web/src/lib/date-input.ts`; các fallback dd/mm là đường chết và fabricate năm.)
  - `buildClassSessions(input): ClassSession[] | null` — input `{ schedule: string; startDate: string; lessons: Array<Pick<Lesson, "sid" | "day" | "time" | "dur" | "topic" | "status">> }`; caller (Phase 2) đã scope rows theo `classId` trước khi truyền. Trả `null` khi:
    1. `parseSchedule` fail (legacy free-text), hoặc
    2. `parseStartDate` fail, hoặc
    3. không có lesson rows nào, hoặc
    4. **divergence guard (red-team F2/F6)**: tồn tại row có `(day, time)` không thuộc skeleton slot set — row đã bị edit day/time qua lesson-edit (`apps/server/src/routes/kernel.ts:704-749`) làm dữ liệu lệch khỏi schedule JSON → fallback bảng cũ thay vì nuốt buổi hoặc ghép nhầm, hoặc
    5. occurrence loop đụng cận `count × 7 + 14` ngày mà chưa đủ `count` buổi (safety net; unreachable với valid data vì weekly-recurring).
  - **Count driver (red-team F1 + code-review critical #1)**: số occurrence **mỗi thứ** = max rows-per-sid trên thứ đó; tổng buổi = Σ các thứ. Slot `(day,time)` KHÔNG dùng để đếm; đếm flat theo tổng (max rows-per-sid) sai với total lẻ + startDate lệch — generator cycle mảng `days` cấp occurrence thừa cho ngày đầu mảng, chronology ưu tiên ngày đầu sau startDate, hai phân bổ chỉ khớp khi đếm theo từng thứ.
  - Skeleton occurrence rule (D4): duyệt ngày ISO từ startDate tiến dần (toán chuỗi ISO UTC-anchored theo quy ước `week-grid.ts:1-14`); ngày có weekday (Mon=1..Sun=7, cùng quy ước `lessonDayFromDate` — `apps/web/src/lib/dashboard-from-kernel.ts:7-10`) thuộc `parsed.days` (0-6 Mon-first) → 1 occurrence với slot `(day = weekday + 1, time = parsed.start)`; dừng khi đủ `count`.
  - Mỗi `ClassSession`: `{ index: number (1-based, chronological toàn lớp); slotIndex: number (1-based trong các occurrence cùng slot — input cho status/topic heuristics); dateISO: string; day: number (1-7); time: string; dur: number; rows: Lesson[] }` — `dur` derive từ schedule bằng đúng công thức generator `(toMinutes(parsed.end) - toMinutes(parsed.start) + 1440) % 1440` (`apps/server/src/routes/kernel.ts:91`), **không** lấy `dur` của rows (red-team F9: dur edit per-row không ảnh hưởng skeleton); `rows` là các lesson rows có `(day, time)` khớp slot.
  - `sessionTimeRange(session): string` — `${time}–${addMinutes(time, dur)}` (reuse `addMinutes` — `format-schedule.ts:58-64`).
  - `formatSessionDate(dateISO): string` — "Thứ Ba, 25/08": weekday từ `new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" })` trên `new Date(dateISO + "T00:00:00Z")` (red-team F4/F6: pin `timeZone: "UTC"` — chuỗi ISO parse thành UTC-midnight, không pin sẽ lệch 1 ngày ở timezone âm UTC), viết hoa chữ đầu; `dd/MM` từ `formatDayMonth` có sẵn (`apps/web/src/lib/week-grid.ts:98`).
  - `sessionStatus(session): "completed" | "cancelled" | "upcoming"` (red-team F3): per-sid **in-order prefix** — trong slot, sid có `c` rows completed + `x` rows cancelled → occurrence `slotIndex ≤ c` là completed, `c < slotIndex ≤ c + x` là cancelled, còn lại upcoming. Aggregate occurrence: mọi sid completed → `"completed"`; mọi sid cancelled → `"cancelled"`; ngược lại `"upcoming"`. `absent` đếm như chưa hoàn thành (parity bảng hiện tại — bảng cũ cũng render absent thành "Sắp tới"). Đây là **display heuristic documented**: teacher check-in theo trình tự là luồng chuẩn.
  - `sessionTopic(session, syLessons): string | null` (red-team F4): các edited topic của slot (rows có `topic !== ""`, dedup giữ thứ tự xuất hiện) gán **in-order** vào occurrence của slot theo `slotIndex` (edited topic thứ n → occurrence `slotIndex = n`); occurrence không được gán → `syLessons[session.index - 1]?.title`; không có → `null` (UI render "—"). `syLessons` là mảng đã flatten sort position (caller truyền — helper không phụ thuộc syllabus types ngoài `{title}`). Display heuristic documented — rows không mang occurrence index.
- Non-functional: pure functions, 0 import React; test chạy bằng vitest runner sẵn có của `apps/web`.

## Architecture

```
class.schedule (JSON text) ──parseSchedule──▶ {days 0-6, start, end}
class.startDate (TEXT)      ──parseStartDate─▶ dateISO | null (ISO-only)
lesson rows (class-scoped) ─ group by sid+weekday ▶ required per weekday = max rows-per-sid
                          └─ distinct (day,time) ─▶ divergence check vs skeleton slots
iterate ISO dates ≥ startDate, weekday ∈ days ─▶ ClassSession[] (chronological, đủ count)
per session: rows = slot match (day,time) ─▶ sessionStatus (per-sid prefix) / sessionTopic (in-order)
session.index ──caller flatten syllabus──▶ syLessons[index-1]?.title (D5)
```

## Related Code Files

- Create: `apps/web/src/lib/class-sessions.ts`, `apps/web/src/lib/class-sessions.test.ts`
- Tham chiếu (không sửa): `apps/web/src/lib/format-schedule.ts`, `apps/web/src/lib/week-grid.ts`, `apps/web/src/lib/dashboard-from-kernel.ts`, `apps/web/src/lib/mock-data.ts`, `apps/server/src/routes/kernel.ts` (xác minh dur/generator)

## Implementation Steps

1. Xác minh lại generator + dur formula (`kernel.ts:82-105`) và display `Lesson` type (`mock-data.ts:30-40`) khớp model ở Overview.
2. Viết `class-sessions.ts`: `parseStartDate`, `buildClassSessions` (count driver, skeleton loop, divergence guard, safety cap), `sessionTimeRange`, `formatSessionDate`, `sessionStatus`, `sessionTopic` + export type `ClassSession`.
3. Viết `class-sessions.test.ts` đủ các case ở Success Criteria (style `week-grid.test.ts` / `format-schedule.test.ts`).
4. Chạy `pnpm --filter web test` + `pnpm biome check` + typecheck; fix tới xanh.

## Todo

- [x] Xác minh generator/dur model
- [x] `parseStartDate` (ISO-only, roundtrip, year bound) + tests
- [x] `buildClassSessions` (count = max per-sid, skeleton, divergence guard → null, safety cap) + tests
- [x] `sessionTimeRange` / `formatSessionDate` (UTC weekday) / `sessionStatus` / `sessionTopic` + tests
- [x] Test suite + biome + typecheck xanh

## Success Criteria

- [x] Case chuẩn: `days [1,4]` (0-based Mon-first = T3, T6), `startDate "2026-08-25"` (Thứ Ba), 1 enrollment × 26 rows (13 day=2 + 13 day=5) → 26 sessions, dates 25/08 (T3), 28/08 (T6), 01/09 (T3), ... tăng dần strictly; mỗi session `rows.length === 1`.
- [x] Misalignment (Kongming #4): `startDate "2026-08-26"` (Thứ Tư) + `days [1,4]` → occurrence đầu là T6 28/08, KHÔNG phải T3.
- [x] Multi-student: 2 sid × 26 rows → vẫn 26 sessions (count = max per-sid), mỗi session `rows.length === 2`; 2 sid lệch count (26 vs 20) → 26 sessions.
- [x] `parseStartDate`: `"2026-08-25"` → ISO; `""`, `"asap"`, `"26-08"`, `"26/08"`, `"25/08/2026"`, `"2026-02-30"` → `null`.
- [x] Divergence guard: 1 row edit `day` T3→T5 (weekday ∉ days) → `null`; 1 row edit `time` 19:00→20:00 → `null`.
- [x] `parseSchedule` null / `startDate` null / 0 rows → `buildClassSessions` trả `null`.
- [x] `sessionStatus`: slot T3 của sid A có 3 completed + 1 cancelled rows → occurrence T3 slotIndex 1-3 `"completed"`, slotIndex 4 `"cancelled"`, slotIndex 5+ `"upcoming"`; thêm sid B 0 completed → các occurrence trên thành `"upcoming"` (aggregate).
- [x] `sessionTopic`: slot T3 13 occurrences, 1 edited topic "IELTS Speaking mock" → occurrence slotIndex 1 hiện edited topic, slotIndex 2-13 dùng `syLessons[index-1]`; không edit + `index > syLessons.length` → `null`.
- [x] `formatSessionDate("2026-08-25") === "Thứ Ba, 25/08"` — formatter pin `timeZone: "UTC"` nên đúng bất kể timezone môi trường chạy test.
- [x] Wrap nửa đêm: `addMinutes("23:00", 90)` → "00:30" (time-range của lớp 23:00–00:30).
- [x] Tất cả test pass, biome + typecheck sạch, 0 import React trong helper.

## Risk Assessment

- Rủi ro lớn nhất: hiểu sai quy ước day (3 quy ước khác nhau — ghi rõ ở `week-grid.ts:1-14`). Tín hiệu: test case chuẩn (26 buổi) ra occurrence lệch ngày. Phản ứng: đối chiếu trực tiếp output `generateScheduleLessons` trong `apps/server/src/kernel.test.ts` rồi chỉnh helper, không đổi test kỳ vọng.
- In-order prefix heuristic sai khi teacher check-in/cancel ngoài trình tự (ví dụ cancel buổi tương lai): hiển thị lệch chỗ trong slot đó nhưng tổng số mỗi trạng thái vẫn đúng. Chấp nhận — documented limitation; đúng ở luồng chuẩn (check-in tuần tự).
- Divergence guard quá nhạy (teacher edit 1 row → cả tab fallback bảng cũ): cố ý — render-only không có dữ liệu đủ để derive đúng; fallback an toàn hơn là render sai. Ghi nhận limitation trong issue.
