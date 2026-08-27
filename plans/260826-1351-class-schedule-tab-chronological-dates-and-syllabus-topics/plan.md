---
title: "Class schedule tab: chronological dates + syllabus topics"
description: "Tab Lịch học trong class detail: suy ra ngày cụ thể từ startDate + schedule.days ở render-layer (0 schema/server change), sắp xếp buổi theo thứ tự ngày thật, gộp cột Ngày+Giờ thành 'Thứ Ba, 25/08 · 19:00–20:30', nhóm N lesson rows per-enrollment thành 1 dòng/buổi, và map chủ đề buổi thứ k sang syllabus lesson thứ k (topic user-edit được ưu tiên, render-only)."
status: completed
priority: P2
effort: 0.5-1d
tags: [web, ui, schedule, syllabus, class-detail]
branch: feat/class-schedule-tab-chronological-syllabus
blockedBy: []
blocks: []
created: 2026-08-26
---

# Class schedule tab: chronological dates + syllabus topics

## Overview

Tab **Lịch học** của class detail (`apps/web/src/routes/_auth/classes/$classId.tsx:339-373`) hiện có 3 lỗi UX (xác minh bằng screenshot "Lớp Test 1" — T3 & T6 · 19:00–20:30 · 26 buổi):

1. **Thứ tự sai**: các dòng được nhóm theo thứ — 13 dòng T3 rồi 13 dòng T6 — thay vì theo trình tự ngày thật. Nguyên nhân: lesson row **không có cột ngày** (schema chỉ có `day` 1-7, `time`, `dur` — `packages/db/src/schema/lesson.ts`), và server sort `asc(lesson.day), asc(lesson.time), asc(lesson.createdAt)` (`apps/server/src/routes/snapshot.ts:141`).
2. **Cột Ngày nghèo nàn**: chỉ hiện label thứ rút gọn `lessonDayLabel(l.day)` → "T3", không có ngày cụ thể; cột Giờ tách riêng chỉ hiện "19:00".
3. **Cột Chủ đề trống**: đọc `l.topic` nhưng generator gán cứng `topic: ""` (`apps/server/src/routes/kernel.ts:82-105`), không liên kết gì với giáo trình của lớp.

Hướng xử lý: **derive render-layer thuần phía web** — sinh chuỗi ngày cụ thể từ `class.startDate` + `parseSchedule(class.schedule).days`, gắn lesson rows vào mỗi buổi theo slot `(day, time)`, map chủ đề theo index chronological vào cây syllabus per-class đã có (`modules` sort `position` → `lessons` sort `position`). Không đổi schema, không đổi API, không đổi server query.

## Scope Challenge

- Existing: `parseSchedule`/`lessonDayLabel`/`addMinutes` (`apps/web/src/lib/format-schedule.ts`); ISO date math chuẩn `apps/web/src/lib/week-grid.ts` (quy ước day 0-6 JSON / 1-7 lesson / JS getDay ghi rõ ở header dòng 1-14); precedent full weekday `Intl.DateTimeFormat("vi-VN", { weekday: "long" })` (`apps/web/src/lib/dashboard-from-kernel.ts:66-74`); pattern flatten syllabus `sy?.modules.flatMap((m) => m.lessons)` đã dùng ngay tại `$classId.tsx:79`; pattern ghép weekday + dd/MM có sẵn ở `lesson-modal.tsx:115-116`.
- Requested scope: (1) sort buổi theo ngày thật suy từ ngày khai giảng + thứ trong tuần; (2) cột ngày thể hiện đầy đủ thứ + ngày, gộp luôn cột giờ; (3) nội dung buổi học mapping với syllabus. Deliver full, không mở rộng.
- Complexity: 2 file create (helper + test) + 3 file modify (route + Lesson type + mapLessons). 0 service/abstraction mới ngoài 1 pure helper. 2 phase.
- Selected mode: **HOLD SCOPE** — auto-detected **Fast** (feature cục bộ một tab, pattern có sẵn, nguyên nhân đã xác minh bằng code; red-team và validate chạy bởi pipeline vibe 2026-08-26).

## Advisory Checkpoint (--advice)

Kongming phán quyết **GO-WITH-CHANGES** cho thiết kế render-layer:

1. Số buổi điều khiển danh sách phải đến từ **lesson rows thật**, KHÔNG dùng `sessionsTotal` (tránh render buổi ma khi lesson rows đã bị sửa/xóa làm 2 số lệch nhau). *(Bản gốc ghi "distinct slot count"; red-team 2026-08-26 chứng minh distinct slot count tự mâu thuẫn — generator cycle `days[i % len]` khiến 26 rows chỉ có 2 slot distinct. Thay bằng count per-weekday = max rows-per-sid trên từng thứ — xem Red Team Review F1 và code-review critical #1.)*
2. **`startDate` parse fail → helper trả `null`**, UI fallback nguyên trạng bảng theo thứ (weekday-grouped) — không silent render ngày sai.
3. **Không bao giờ ghi syllabus title vào `lesson.topic`** — đó là field user-edit thật (qua lesson-edit API); mapping render-only.
4. Khớp session ↔ lesson rows bằng slot `(day, time)`; **từ chối map theo row index** vì generator cycle `days[i % len]` không align startDate (startDate thứ 4 + days [T3, T6] → row 0 là T3 nhưng occurrence đầu tiên thật là T6).
5. Cấu trúc 2 phase P1 (helper + unit tests) → P2 (rewire table) được giữ nguyên.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Pure helper `class-sessions.ts`: sinh danh sách buổi chronological từ startDate + schedule.days, số buổi = Σ(per-weekday max rows-per-sid) (rows thật, scope theo classId); trả `null` khi startDate/schedule không parse được HOẶC rows diverge khỏi schedule (edit day/time) | P1 |
| 2 | Unit tests cover: parse ISO + invalid formats, misalignment startDate↔days, multi-student + lệch count per-sid, divergence guard, wrap tuần + nửa đêm, status prefix, topic in-order, precedence syllabus | P1 |
| 3 | Bảng Lịch học: 1 dòng/buổi, cột gộp "Thứ Ba, 25/08 · 19:00–20:30", học viên gộp thành list trong 1 cell, chủ đề mapping syllabus (guard con trỏ anomaly), trạng thái per-buổi; fallback nguyên trạng khi helper trả null | P1 |
| 4 | 0 thay đổi server/API/DB (thêm field `classId` vào display `Lesson` chỉ là apps/web mapping của field API đã có); dashboard + /schedule weekly grid không đổi behavior | P1 |

## Design Decisions

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | Derive ngày client-side, không persist cột `lesson.date` | Dashboard + /schedule grid đang derive weekly-recurring từ day-only; thêm cột date = migration + đổi generator + rủi ro break consumer khác. Render-layer khớp pattern snapshot → repos pure-map sẵn có. |
| D2 | Slot `(day, time)` chỉ dùng để **gắn rows vào occurrence** (học viên/status/topic), KHÔNG dùng để đếm số buổi | Generator sinh `sessionsTotal` rows **mỗi enrollment** với cùng `time`, cycle days (F1 red-team: 26 rows → 2 slot distinct). Row-index mapping vẫn bị từ chối (Kongming #4 — generator không align startDate). |
| D3 | Số occurrence **mỗi thứ** = max rows-per-sid trên thứ đó (tổng buổi = Σ các thứ), rows scope theo `classId` | Đến từ rows thật (tinh thần Kongming #1 — không dùng `sessionsTotal`, không dùng distinct slot). Per-weekday là bắt buộc: generator cycle mảng `days` thô nên total lẻ cấp occurrence thừa cho ngày đầu mảng, còn chronology từ startDate ưu tiên ngày đầu sau startDate — hai phân bổ chỉ khớp khi đếm theo từng thứ (code-review critical #1, 2026-08-26). |
| D4 | Occurrence rule: duyệt ngày ISO từ startDate tiến dần, ngày nào có weekday ∈ `schedule.days` (0-6 Mon-first) là 1 occurrence; đủ count thì dừng. **Divergence guard**: mọi row của lớp phải có `(day,time)` thuộc skeleton slot set — vi phạm → trả `null` (fallback). Cận an toàn `count × 7 + 14` ngày → `null` | Đúng ngữ nghĩa weekly-recurring + xử lý đúng case startDate không trùng ngày học đầu tiên. Rows bị edit day/time qua lesson-edit làm dữ liệu lệch schedule JSON → fallback an toàn hơn là nuốt buổi/ghép nhầm (F2/F6). |
| D5 | Chủ đề: edited topic của slot gán **in-order** theo slotIndex (topic thứ n → occurrence thứ n của slot) > `syLessons[k-1]?.title` > "—" | Rows không mang occurrence index (UUID id, không có createdAt trong API) — không thể biết chính xác row nào là buổi nào; in-order là heuristic trung thành nhất với luồng teacher edit theo trình tự. Render-only, không write-back. |
| D6 | Full weekday qua `Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" })` trên `new Date(iso + "T00:00:00Z")` (viết hoa chữ đầu) + `dd/MM` từ `formatDayMonth` | Chuỗi ISO parse thành UTC-midnight — phải pin `timeZone: "UTC"` như quy ước UTC-anchor của `week-grid.ts:1-14`, không pin sẽ lệch 1 ngày ở timezone âm UTC (F4). |
| D7 | Trạng thái per-buổi: per-sid **in-order prefix** trong slot (c completed → c occurrence đầu "Đã học", x cancelled → x occurrence kế "Đã hủy", còn lại "Sắp tới"); aggregate: mọi sid hoàn thành → "Đã học", mọi sid hủy → "Đã hủy", ngược lại "Sắp tới" | Rows không có occurrence index; check-in tuần tự là luồng chuẩn → prefix là heuristic hiển thị trung thực nhất. `absent` giữ parity bảng hiện tại (render "Sắp tới"). Tổng số mỗi trạng thái luôn đúng dù thao tác ngoài trình tự. |
| D8 | Scope rows theo `classId` (display `Lesson` thêm field `classId` map từ `KernelLessonRow.classId` — API đã trả, `mapLessons` đang bỏ) | `classLessons` lọc theo `cls.studentIds` (F5) — sai khi 1 học viên ở 2 lớp (schema enrollment cho phép). Field additive, 0 consumer phá. |
| D9 | Time-range của buổi derive từ schedule: `start` + dur theo công thức generator `(toMinutes(end) - toMinutes(start) + 1440) % 1440` | Deterministic, khớp generator; dur edit per-row (F9) không làm skeleton loạn — khác biệt dur chỉ hiển thị ở /schedule modal (row-level). |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Pure helper + unit tests](./phase-01-class-sessions-helper.md) | Pending |
| 2 | [Rewire schedule tab table](./phase-02-rewire-schedule-tab-table.md) | Pending |

## Success Criteria

- [ ] Lớp "T3 & T6 · 19:00 · startDate 2026-08-25": bảng Lịch học hiện 26 dòng xen kẽ Thứ Ba/Thứ Sáu theo ngày thật tăng dần (25/08, 28/08, 01/09, ...), không còn nhóm 13 dòng T3 rồi 13 dòng T6.
- [ ] Cột ngày gộp: "Thứ Ba, 25/08 · 19:00–20:30" (hoặc tương đương), không còn cột Giờ riêng.
- [ ] Cột Chủ đề: buổi k hiển thị title syllabus lesson thứ k (flatten theo position); lớp chưa import giáo trình hoặc syllabus ngắn hơn → "—"; topic user đã sửa qua lesson-edit hiển thị tại occurrence được gán (in-order heuristic).
- [ ] Cột Trạng thái: buổi đã check-in hiện "Đã học" (in-order prefix), buổi bị cancel hiện "Đã hủy", còn lại "Sắp tới".
- [ ] Lớp nhiều học viên: mỗi buổi đúng 1 dòng, học viên gộp trong 1 cell.
- [ ] Lớp startDate rỗng/legacy HOẶC có row edit day/time lệch schedule: bảng fallback đúng hành vi cũ, không crash, không render ngày sai.
- [ ] Toàn bộ unit test mới pass; `pnpm biome check` + typecheck + existing test suite không regress.

## Risks

| Rủi ro | Mitigation |
|--------|------------|
| `startDate` TEXT tự do ("" mặc định, legacy "26/08") | `parseStartDate` chỉ nhận ISO `yyyy-mm-dd` + roundtrip validity + year bound; format khác → `null` → UI giữ bảng cũ (Kongming #2) |
| Occurrence loop vô hạn nếu logic weekday sai | Cận trên lặp = `count × 7 + 14` ngày → trả `null`; test wrap tuần + boundary |
| Rows diverge khỏi schedule sau lesson-edit (day/time/dur) | Divergence guard `(day,time)` → `null` (fallback); dur không tham gia guard — skeleton dùng schedule-derived dur (D9) |
| Trạng thái/chủ đề hiển thị sai chỗ khi teacher thao tác ngoài trình tự | Heuristic documented (D5/D7) — tổng số mỗi trạng thái vẫn đúng; không có dữ liệu render-only tốt hơn |
| Đổi sort/đổi query server ảnh hưởng dashboard + /schedule | Không đổi server — mọi thay đổi nằm trong tab Lịch học của route `$classId` + 2 file mapping nhỏ apps/web |

## NOT in scope

- Persist ngày thật vào DB (cột `lesson.date`) hay đổi generator/server query.
- Ghi syllabus title vào `lesson.topic` (write-back).
- Hỗ trợ nghỉ lễ/dời lịch/holiday skip, filter theo tuần, export calendar.
- Đổi tab Giáo trình, dashboard, hay trang /schedule.
- Occurrence-level status/topic chính xác tuyệt đối (cần dữ liệu occurrence index — chưa có trong API).

## Related Code Files

- Create: `apps/web/src/lib/class-sessions.ts`, `apps/web/src/lib/class-sessions.test.ts`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (chỉ block `tab === "schedule"`, dòng 339-373 + import), `apps/web/src/lib/mock-data.ts` (interface `Lesson` thêm `classId`), `apps/web/src/lib/repos/lessons.ts` (`mapLessons` map thêm `classId`)
- Tham chiếu (không sửa): `apps/web/src/lib/format-schedule.ts`, `apps/web/src/lib/week-grid.ts`, `apps/server/src/routes/kernel.ts` (generator/dur), `packages/api/src/contracts.ts` (`KernelLessonRow.classId` đã có)

## Red Team Review

### Session — 2026-08-26

**Reviewers:** Security Adversary + Assumption Destroyer (Light tier — Fact Checker; 2 reviewer theo quy mô 2 phase)
**Findings:** 10 (9 accepted — 1 Critical, 5 High, 3 Medium; gộp 3 cặp trùng); 0 rejected nào substantive
**Fact-check:** mọi file/symbol/line citation của plan đều VERIFIED; 2 claim FAILED vì mâu thuẫn nội tại (distinct-slot count; slot-unique-guarantee) — nguồn gốc F1/F2.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | Distinct-slot-count driver tự mâu thuẫn: 26 rows T3&T6 chỉ có 2 slot distinct → bảng sẽ render 2 dòng thay vì 26 (generator cùng time, cycle days) | Critical | Accept | Phase 1 (count = max rows-per-sid), D3 |
| F2 | Rows diverge sau lesson-edit (day/time editable per-row) + cap-hit behavior không định nghĩa → buổi biến mất/danh sách cắt ngắn im lặng | High | Accept | Phase 1 (divergence guard → null; cap → null), D4 |
| F3 | Status per-date không dẫn xuất được; aggregate "mọi rows completed" sai hệ thống trên lớp đang diễn ra | High | Accept | Phase 1 (`sessionStatus` per-sid in-order prefix), D7 |
| F4 | Topic precedence slot-level làm 1 lần edit nhiễm toàn bộ occurrence của slot | High | Accept | Phase 1 (`sessionTopic` in-order theo slotIndex), D5 |
| F5 | `classLessons` lọc theo studentIds không theo classId; helper không thể scope đúng (multi-class student) | High | Accept | Phase 2 (`scheduleLessons` filter classId; `Lesson.classId` + mapLessons), D8 |
| F6 | `Intl vi-VN` trên chuỗi ISO UTC-midnight không pin timezone → weekday lệch 1 ngày ở timezone âm UTC | High | Accept | Phase 1 (`timeZone: "UTC"`), D6 |
| F7 | `parseStartDate` fallback `dd/mm` (năm hiện tại) fabricate ngày; không roundtrip/year-bound guard | Medium | Accept | Phase 1 (ISO-only + roundtrip + year bound) |
| F8 | `syLessons` không guard `sy.classId === classId` → anomaly pointer rò title từ template dùng chung | Medium | Accept | Phase 2 (`safeSyLessons`) |
| F9 | `ClassSession.dur` nguồn không chỉ định khi rows trong slot lệch dur sau edit | Medium | Accept | Phase 1 (dur = schedule-derived theo công thức generator), D9 |
| F10 | Status aggregate bỏ ngữ nghĩa `absent` + che cancellation một phần | Medium | Accept (mức parity) | Phase 1 (absent = chưa hoàn thành — giữ parity bảng hiện tại; documented) |

**Ghi chú adjudication:** F10 accept ở mức "giữ parity" — bảng hiện tại cũng render absent thành "Sắp tới", không regression; việc hiển thị absent riêng là nâng cấp UX ngoài scope lần này. Phần gợi ý "hiển thị kèm đếm per-status" của F3 bị loại (over-engineering cho badge cột Trạng thái); heuristic prefix đủ cho luồng chuẩn.

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01-class-sessions-helper.md, phase-02-rewire-schedule-tab-table.md
- Decision deltas checked: 10 (count driver thay distinct-slot; divergence guard + null contract mở rộng; status prefix rule; topic in-order rule; UTC weekday; ISO-only startDate; classId scoping; syllabus anomaly guard; dur source; absent parity)
- Reconciled stale references: 6 — D3/D4/D5/D6 rewritten; Advisory #1 annotation supersession; Related Code Files thêm 2 file modify; Goals #1/#3 rewording; Risks table thay mitigation status/cap; phase-01 Success Criteria (bỏ "26 slots → 26 sessions" wording, bỏ test dd/mm, thêm test divergence/count lệch); phase-02 Requirements (scheduleLessons, safeSyLessons, fallback dùng classLessons)
- Unresolved contradictions: 0
