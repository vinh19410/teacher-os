---
phase: 3
title: "Fix derive sessionsDone collapse (weekly recurrence) + flip pin test đỏ #55"
status: pending
priority: P1
effort: "1h30"
dependencies: []
---

# Phase 3: Fix derive sessionsDone + flip pin test

## Overview

Hand-off #55 mục (a): derive `sessionsDone` tại `apps/web/src/lib/repos/classes.ts:28-46` đang
đếm DISTINCT `${day}|${time}` mỗi class — đúng cho "1 buổi 1:2 = 2 rows đếm 1" (invariant 7,
comment `classes.ts:14-18`) nhưng SAI cho weekly recurrence: 12 buổi sinh trên 2 slot
(days {2,4}, cùng time) check-in đủ vẫn ra 2/12. Fix: đếm **số buổi đã dạy theo series thật** —
nhóm các lesson row `status === "completed"` theo `enrollmentId` (mỗi enrollment là 1 series
`sessionsTotal` buổi, generator `kernel.ts:81-104`) rồi lấy max mỗi class. Cách này đồng thời
thỏa (i) weekly recurrence: 12 completed rows / 1 enrollment → 12/12; (ii) invariant 7: lớp 1:2
2 enrollment × 12 completed rows → max = 12 (không phải 24). Pin test đỏ có chủ đích
`classes.test.ts:289-345` được FLIP sang green assertions (comment trong test chỉ đích danh
issue #56 = plan này).

## Requirements

- Functional:
  - `mapClasses` (`classes.ts`): thay `Map<string, Set<string>>` distinct-pairs bằng
    `Map<classId, Map<enrollmentId, number>>` đếm rows `status === "completed"`;
    `sessionsDone = max(counts per enrollment)` của class đó (0 khi không có).
  - Flip pin test `classes.test.ts:289-345`: đổi describe-title (bỏ "collapse pin … red-target",
    ghi "derive from real lesson rows (#56)"), giữ nguyên fixture 12 rows/1 enrollment và thêm:
    (1) 12 completed → `sessionsDone === 12`; (2) 2 enrollment × 12 completed (lớp 1:2) →
    `=== 12`; (3) 4 completed + 4 cancelled + 4 upcoming → `=== 4`; (4) 0 completed → `=== 0`;
    (5) **interleaved (red-team #7)**: enrollment A completed các buổi 1-6, enrollment B completed
    buổi 7-12 (tập KHÔNG lồng nhau) → pin hành vi lower-bound `=== 6` + comment ghi rõ giới hạn.
  - **Cập nhật describe "Wave 4" `classes.test.ts:185-265` (red-team #6)**: title hiện pin
    thuật toán CŨ "counts distinct (day,time) pairs of completed lessons, not rows" (dòng 256) +
    comment fixture "A half-checked 1:2 still counts as one delivered session" (dòng 245) —
    mâu thuẫn thuật toán mới. Giữ numeric assertions (đúng trùng số: en-1 3 completed → max 3),
    đổi title/comment phản ánh semantics mới "max completed rows per enrollment"; KHÔNG weaken
    assertion số.
  - **Blast-radius (red-team #6)**: trước khi kết luận an toàn, grep `sessionsDone` trên toàn bộ
    `apps/web/src/**/*.test.ts`; consumers của derive: `$classId.tsx:67-68,110`,
    `classes/index.tsx:58,92`, `syllabus/$syllabusId.tsx:245` (tự đúng qua `useClasses` —
    verify không regress UI khác).
  - Update comment derive trong `classes.ts:12-19` phản ánh semantics mới (đếm theo series
    enrollment, max; weekly recurrence đúng; invariant 7 giữ; **lower-bound khi 1:2 check-in
    lệch — occurrence-union khả thi nhưng fragile khi edit đổi day, đòi cột ngày ở DB**).
  - Class detail progress (`$classId.tsx:67-68,110`) dùng `cls.sessionsDone` qua `useClasses`
    → tự đúng sau fix; KHÔNG sửa `$classId.tsx`.
- Non-functional:
  - Pure function — không đổi signature `mapClasses(snapshot)`.
  - DB column `sessionsDone` KHÔNG đụng (legacy, no writer, "Do not trust it" —
    `contracts.ts` KernelClassRow doc).
  - KHÔNG đụng file nào khác của luồng classes ngoài 2 file trên.

## Architecture

Data flow (đã có, chỉ đổi phép đếm): snapshot `['kernel']` → `mapKernelSnapshot`
(`repos/kernel.ts:137-149`) → `mapClasses` → `MockData.classes[].sessionsDone` → screens
(classes list progress ring, `$classId.tsx` progress). Vì generator sinh rows per enrollment
với `day = days[i % days.length] + 1` (`kernel.ts:96-99`), mỗi enrollment của 1 lớp có cùng
số buổi bằng `sessionsTotal` — max per class là ước lượng "số occurrence đã dạy" đúng với cả
hai hình thái lớp (1:1 và 1:2). Enrollment lệch series (học sinh vào muộn/series ngắn) không
làm giảm progress lớp (max = series đầy đủ đã dạy) — semantics "lớp đã dạy bao nhiêu buổi".

## Related Code Files

- Create: (không)
- Modify: `apps/web/src/lib/repos/classes.ts` (derive + comment), `apps/web/src/lib/repos/classes.test.ts` (flip pin test 289-345 + update title/comment describe Wave-4 185-265)
- Delete: (không)

## Implementation Steps (TDD)

1. **Tests Before** — trong `classes.test.ts`, viết lại describe 289-345 thành 4 green
   assertions ở Requirements (fixture cũ giữ + thêm enrollment thứ 2 cho case 1:2, thêm
   status trộn cho case 3). Chạy `pnpm -F web test` → case (1) ĐỎ với derive cũ (ra 2 thay
   vì 12) — pin đỏ đúng chỗ.
2. **Refactor/Implement** — sửa derive trong `classes.ts:28-34` theo Architecture (thay Set
   bằng nested Map đếm per enrollment; dòng 46 lấy max). Update JSDoc 12-19.
3. **Tests After** — `pnpm -F web test` xanh toàn file: 4 case mới pass; các test cũ của
   `mapClasses` (kể cả `kernel.test.ts:221` "stored 3, 0 completed lessons → 0") vẫn pass.
4. **Regression Gate** — `pnpm test` && `pnpm check-types` && `pnpm exec biome check .` &&
   `pnpm build`.

## Success Criteria

- [x] Weekly recurrence: 12/12 sau khi check-in đủ (case 1 pass).
- [x] Lớp 1:2 (2 enrollment × 12 completed) → 12/12, không 24 (case 2 pass — invariant 7 giữ).
- [x] Interleaved 1:2 (A 1-6, B 7-12) → pin lower-bound 6 + comment giới hạn (case 5).
- [x] Cancelled không đếm; trộn status đếm đúng (case 3, 4 pass).
- [x] Describe Wave-4 (185-265) title/comment phản ánh semantics mới; grep `sessionsDone` toàn
  web test không còn chỗ nào pin thuật toán cũ.
- [x] Pin test cũ không còn tồn tại ở dạng đỏ-có-chủ-đích (describe title mới phản ánh #56).
- [x] DB column `sessionsDone` và mọi file server/api/db không đổi (git diff scoped 2 file web).
- [x] 4 gate commands xanh.

## Risk Assessment

- **Assumption "mỗi enrollment có series đủ `sessionsTotal`"** — enrollment sinh sau với lớp
  đã chạy được vài tuần vẫn sinh full series (generator không nhận start-date; hành vi hiện
  có của #55, không đổi ở #56). Signal: nếu tương lai có partial-series, max vẫn đúng hơn
  MIN/plain-count cho ngữ nghĩa "lớp đã dạy bao nhiêu buổi"; nếu red-team phàn nàn semantics
  → response pre-decided: giữ max, ghi chú vào JSDoc.
- **Assumption "completed = đã dạy"**: hiện chỉ có 2 write paths status (check-in → completed,
  cancel → cancelled); "absent" không có write path (`dashboard-from-kernel.ts:20` comment) —
  không cần xử lý absent. Signal: nếu #tương-lai thêm absent write path, derive này cần tính
  lại (absent là buổi đã diễn ra nhưng chưa điểm danh?) — out of scope, ghi TODO trong comment.
- **Test cũ khác phụ thuộc distinct-pairs**: `kernel.test.ts:221` chỉ cover "0 completed → 0"
  (không phụ thuộc cách đếm >0) — verified an toàn; nếu có test nào khác đỏ sau flip, đọc kỹ
  trước khi sửa (không weaken assertion).
- **Sửa nhầm pin test của #55 ở chỗ khác**: chỉ đụng đúng describe 289-345; grep
  "red-target for #56" sau khi xong phải trả 0 match trong classes.test.ts.
