---
phase: 3
title: "Web read-path v2 + contract chain"
status: pending
priority: P1
effort: "1.5d"
dependencies: [2]
---

# Phase 3: Web read-path v2 + contract chain

## Overview

Hoàn thành chuỗi contract K6 phía web và dựng dual-mode read path trong `class-sessions.ts`: mọi row có date ⇒ group `(class_id, date)` theo chronology = ClassSession v2 (topic/dur/time ĐỌC TỪ bucket rows); tồn tại ≥1 row NULL-date trong class ⇒ nguyên class rơi legacy heuristic (đóng băng, fallback-only). Gate của phase này là **pinned diff set** K4 — không phải "zero visual diff": bốn mốc pin tường minh gồm behavior thay đổi có chủ đích.

## Requirements

- Functional:
  - `KernelLessonRow.date` đi đến hết chuỗi: contracts → snapshot projection → mapLessons (repos/lessons.ts) → type Lesson (mock-data) → pick ClassSessionLesson (class-sessions.ts:40-43).
  - `buildClassSessions` v2: nhánh mới — **gate duy nhất là any-NULL-per-class: rows.every(r => r.date != null)** ⇒ sessions từ distinct dates đã sort; ngược lại giữ nguyên thuật toán walk hiện tại byte-for-byte. **KHÔNG mirror count-vector/conforms() client-side (red-team round-2 N1 Critical): một lần moveDate hợp lệ làm count-vector lệch vĩnh viễn mà không có recompute path — mirror đó tự hủy feature cốt lõi; identity sau full-dating chính là date, group-by-date không cần tái dựng heuristic. Class fully-dated với count-vector "lệch công thức" (đã moveDate) PHẢI render v2 — fixture pin chống regression vĩnh viễn (xem Success Criteria).** conforms() (P1) chỉ sống ở backfill-time server-side.
  - **Dual-mode TƯỜNG MINH cho toàn bộ helper prefix** (red-team High ×2): `sessionStatus` (:221-233), `sessionStudents` (:240-248), `sidStateAt` (:209-213), `isSequentialHead` (:345-352) hiện dùng `slotIndex` như ordinal-within-slot — nhánh v2 PHẢI đọc trực tiếp status từng row-bucket (bucket = đúng 1 occurrence: all-completed→completed, all-cancelled→cancelled, else upcoming; students = sid-set của bucket) KHÔNG chạy phép-tính-prefix trên slotIndex. Không rewire ⇒ badge aggregate tính sai vĩnh viễn trên class v2 (`sessionAttendanceState` :384-421 gọi `sessionStatus()` ngay dòng đầu; consumer: class-schedule-table.tsx:152-153, session-attendance-modal.tsx:45,56). Nhánh legacy giữ nguyên code.
  - Field semantics: `dur`/`time` đọc row-bucket (docblock cập nhật "Schedule-derived" :54-55); `dateISO` = date identity; `slotIndex` populate giá trị nào được ghi rõ docblock, nhưng **không còn helper nào dùng nó để làm prefix-math trên nhánh v2**.
  - `sessionTopic()` v2: topic-bucket-first (row đầu non-empty theo id-sort deterministic trong bucket), fallback syllabus index; unique-list fan (:256-269 cũ) chỉ serve legacy. **Policy lossy khai báo (red-team round-2 N14): bucket chứa ≥2 topic authored KHÁC nhau sẽ hiển thị đúng MỘT winner (id-min) — mất phân phối per-sid của legacy; ghi rõ Behavior Changes plan.md mục 7 + fixture parity multi-authored-topics (không thêm wire field createdAt).**
  - Targeting: helper mới `sessionRowTargets(session)` trả các row upcoming CỦA BUCKET per sid (1 row/sid khi conforms-P1 đạt); `firstUpcomingLessonId` + sequential-head GIỮ cho legacy branch duy nhất; CTA #91 (`sessionAttendanceState`) chọn dated-row-exact khi v2.
  - Divergence guard cũ (:104-110) chỉ áp nhánh legacy; guard nhánh v2 = **any-NULL-class-wide duy nhất** (count-vector ĐÃ BỎ khỏi gate — N1).
- Non-functional:
  - Docblock slot-bag (:311-322) viết lại DUAL-MODE (R5): cụm "never iterate session.rows" scoped legacy path; ⚠️ CỤM CHỮ NÀY là regex-pin `not.toMatch(/session\.rows/)` phủ class-schedule-table.tsx và session-attendance-modal.tsx (kernel-runtime.contract.test.ts khối #91 ~284-295) — comment mới đặt trong class-sessions.ts thì OK, nhưng cấm literal `session.rows` rơi vào JSX/comment của 2 file bị pin (red-team Medium #8).
  - Consumers hiển thị ngoài danh sách helper dual-mode KHÔNG sửa logic — verify compile-level + parity pin (trước đây ghi "compile-level only" là thiếu: sessionStatus/sessionStudents có behavior diff qua branch).

## Architecture

```ts
// class-sessions.ts — v2 entry
export function buildClassSessions(input): ClassSession[] | null {
  if (
    input.lessons.length > 0 &&
    input.lessons.every((r) => r.date !== null) // any-NULL-per-class — GATE DUY NHẤT (N1)
  ) {
    return buildClassSessionsV2(input); // group theo date, sort chronology
  }
  return buildClassSessionsLegacy(input); // code hiện hành giữ nguyên — FROZEN
}
```

Vì `KernelCommandResult`/bus KHÔNG đổi ở phase này (P4 mới thêm call mới), rủi ro surface thuần read-side. Mọi consumer hiển thị (tab Buổi học, dashboard today/atrisk source dùng chung skeleton?) tiếp tục nhận `ClassSession[]` shape bất biến.

## Related Code Files

- Modify: `apps/web/src/lib/class-sessions.ts` (+ `class-sessions.v2.test.ts` parity fixture reuse)
- Modify: `apps/web/src/lib/mock-data.ts` (type Lesson +date), `apps/web/src/lib/repos/lessons.ts` (mapLessons), `apps/web/src/lib/format-schedule.ts` (chỉ nếu type import dính)
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts`, `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts` (pins v2)
- Modify: components tiêu thụ display KHÔNG sửa logic (verify bằng compile-level only)

## Implementation Steps

1. Type-chain K6 end-to-end (contracts web side), unit test mapLessons preserves/nulls date.
2. Tests-first v2 fixture port từ class-sessions.test.ts theo cùng case matrix P1 chạy qua buildClassSessions API pública; **pinned diff set K4 mở rộng thành NĂM mốc**: (a) class chưa-edit render ≡ legacy output **trên BỀ MẶT so sánh derived per-session projection `{dateISO, slotIndex?, status, students[], topic, time, dur}` — CẤM deep-equal trực tiếp mảng `rows` vì legacy share MỘT array reference xuyên mọi occurrence cùng slot (`rowsBySlot` class-sessions.ts:114-132) nên structural-equality thô là bất khả thi; negative-test ghi nhận shared-bag behavior như materialization của FROZEN (red-team round-2 N11)**; (b) class có topic-edits render theo expectation V2; (c) CTA lessonId == dated-row id của bucket (không min-UUID); (d) mirror fixture startDate-off-day — ngày-set & thứ tự chrono GIỐNG hệt, chỉ nhãn slotIndex/index dịch (diff có chủ đích, pin giá trị mới — red-team Low #12); (e) class fully-dated count-vector-lệch (simulate hậu moveDate) render V2 bình thường — pin chống regression N1.
3. Implement buildClassSessionsV2 + sessionTopic v2 + sessionRowTargets + các helper dual-mode (sessionStatus/sessionStudents/sidStateAt/isSequentialHead); rewire sessionAttendanceState v2-branch.
4. Docblock rewrite dual-mode trong class-sessions.ts (giữ cụm "never iterate session.rows" CHỈ trong file này, không đụng 2 file bị pin).
5. Contract pins: buildClassSessions không đổi signature; negative pin nhánh legacy FROZEN (source-text anchors walk loop / required-map đứng im); pins #91 regex toàn bộ still-match.
6. Gates xanh.

## Success Criteria

- [ ] Pin (a): derived-projection equality trên fixture chưa-edit giữa v2 & legacy outputs (không so raw rows arrays); Pin (d) startDate-off-day nhãn-dịch pinned.
- [ ] Pin (b) mis-fan regression: topic chỉnh vào occurrence k hiển thị ĐÚNG k ngay khi render đầu (test đặt tên `renders edited topic on its own occurrence`).
- [ ] Pin (c) attendance/CTA với data 2-sid lệch-prefix: mỗi sid nhận đúng dated-row id của bucket đang xem.
- [ ] Pin (e) anti-N1: class fully-dated có count-vector lệch công thức (hậu moveDate simulate) VẪN đi nhánh v2 đủ chronology + CTA — vĩnh viễn, không rớt legacy.
- [ ] Helper dual-mode: sessionStatus/sessionStudents trả đúng semantics-v2 trên fixture có completed-mid-sequence (bucket all-completed nhưng vị trí chrono muộn) — guard chống reg tái-dùng prefix-math trên v2.
- [ ] Any-NULL-in-class ⇒ null-output (legacy) — kể cả 1 row NULL duy nhất giữa hàng trăm dated rows; time-divergence fixture từ P1 cũng legacy (NULL-theo-class từ backfill).
- [ ] Legacy branch source-text anchors (walk loop, required-map) đứng im — frozen assertion.
- [ ] Gates xanh + check-types sạch toàn app.

## Risk Assessment

**R11 (HIGH) Shape-drift vô ý làm vỡ consumers ngầm** (dashboard/schedule tab): signal type-error hoặc render sai nơi ngoài tab; response: compile-fixtures + sweep grep consumers `buildClassSessions|ClassSession|sessionStatus|sessionStudents` khai báo danh sách file-test ở step 2 trước implement; helper behavioral diffs chỉ nằm trong 4 hàm dual-mode đã kê khai.
**R12 (MEDIUM) Dual-maintenance leo thang:** dev mới sửa nhánh legacy tưởng nó sống — signal PR diff chạm legacy fn; response: docblock FROZEN + header warning + review checklist item.
**R13 (LOW) slotIndex semantic gây hiểu nhầm test cũ:** response: KHÔNG rename field; chỉ docblock; helper v2 không đọc nó; alias `occurrenceIndex` nếu cần đọc thuận P4.
