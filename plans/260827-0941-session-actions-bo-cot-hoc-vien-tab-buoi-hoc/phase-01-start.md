---
phase: 1
title: "Bỏ cột Học viên khỏi bảng buổi học"
status: pending
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 1: Bỏ cột Học viên khỏi bảng buổi học

## Overview

Xóa cột **Học viên** khỏi cả hai dạng bảng của tab Buổi học: main timeline table (4→3 cột) và legacy fallback (5→4 cột). Cột này chỉ liệt kê tên text — khi lớp đông thì tràn chỗ, không mang thông tin hành động (điểm danh đã có roster modal từ #91).

## Requirements

- Functional:
  - Main table headers: `[Ngày & Giờ | Chủ đề | Trạng thái]` (class-schedule-table.tsx:143–146).
  - Legacy fallback headers: `["Ngày", "Giờ", "Chủ đề", "Trạng thái"]` (class-schedule-table.tsx:85).
  - Expanded detail row `colSpan={3}` (hiện `{4}` ở dòng 271).
  - Xóa compute `attendees`/`students` ở main row render (dòng 151–155) và cell students (dòng 176); xóa cell `s?.name` ở legacy (dòng 87, 96).
  - Giữ nguyên: prop `studentById`, `sessionStudents` (roster modal + phase 2 còn dùng), CTA Điểm danh #91, roster tab label `"Học viên"`.
  - Cập nhật doc comment đầu file (dòng 29–44) — bỏ mô tả "the slot's students" khỏi danh sách cột.
- Non-functional: không thay đổi logic `buildClassSessions`/`sessionAttendanceState`; bảng hẹp hơn trên mobile.

## Architecture

Pure presentation change — chỉ `ClassScheduleTable` + contract test. Không đụng data layer, không đụng server.

## Related Code Files

- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx`
- Modify: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts`
- Delete: không

## Implementation Steps

1. Main table: xóa `<th>Học viên</th>` (dòng 144) và cell students (dòng 176); dọn compute `attendees`/`students` (dòng 151–155) — giữ `attendees` nếu `isGroupSession`/`checkInId` còn dùng (kiểm tra: `attendees.length` dùng cho `isGroupSession` dòng 158 — **giữ compute attendees, chỉ xóa chuỗi `students` join-name**).
2. Legacy fallback: bỏ `"Học viên"` khỏi headers (dòng 85) và cell `s?.name ?? ""` (dòng 96); bỏ `const s = studentById(l.sid)` nếu không còn dùng (dòng 87).
3. Expanded detail row: `colSpan={4}` → `colSpan={3}` (dòng 271).
4. Doc comment (dòng 29–44): bỏ "the slot's students" khỏi mô tả cột; ghi thêm ghi chú "cột Học viên đã bỏ (issue này) — danh sách học viên xem ở roster modal / tab Học viên".
5. Contract test `class-detail-sessions-tab.contract.test.ts`:
   - Legacy headers assertion (dòng ~68–73, hiện pin `["Ngày","Giờ","Học viên","Chủ đề","Trạng thái"]` tại dòng 71): đổi thành `["Ngày", "Giờ", "Chủ đề", "Trạng thái"]`.
   - Main table: hiện KHÔNG pin main headers (chỉ `<th>Ngày & Giờ</th>` được pin) — **thêm assertion pin 3 cột mới + negative assertion**: source `ClassScheduleTable` không chứa `>Học viên</th>` (phân biệt với roster tab label `{ id: "roster", label: "Học viên" }` ở dòng 29 — KHÔNG đụng).
6. Chạy gates: `pnpm check && pnpm test && pnpm check-types` (từ repo root, per docs/code-standards.md).

## Success Criteria

- [ ] Main table 3 cột, legacy fallback 4 cột, không còn cột Học viên ở bất kỳ dạng bảng nào.
- [ ] Negative assertion `>Học viên</th>` vắng mặt trong main thead có trong contract test.
- [ ] Roster tab + SessionAttendanceModal + CTA Điểm danh hoạt động nguyên vẹn (test #91 vẫn xanh, không sửa).
- [ ] Expanded row `colSpan={3}` không lệch layout.
- [ ] Gates xanh.

## Risk Assessment

**Risk 1 (MEDIUM): Search-replace nhầm chữ "Học viên".** Contract test pin cả roster tab label `"Học viên"` (dòng 29) — hai chữ giống nhau, ngữ cảnh khác.
- Signal: contract test roster-tab assertion fail.
- Response: chỉ sửa assertions liên quan table headers; đọc diff kỹ trước commit.

**Risk 2 (LOW): Xóa nhầm compute `attendees`.** `isGroupSession` (dòng 158) và `checkInId` vẫn cần `sessionAttendanceState`/attendees-derived logic.
- Signal: CTA group/1:1 đổi hành vi sau refactor.
- Response: chỉ xóa chuỗi `students` (map/join names); giữ mọi compute mà CTA dùng; e2e #91 là regression net.
