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
  - Xóa chuỗi join tên `students` (map + join, dòng 152–155) và cell students `{students || "—"}` (dòng 176); xóa cell `s?.name ?? ""` ở legacy (dòng 96) cùng `const s = studentById(l.sid)` nếu hết dùng (dòng 87). `attendees` (dòng 151) **GIỮ NGUYÊN** — `isGroupSession` phụ thuộc `attendees.length` (dòng 158); Requirements này là hướng DUY NHẤT, không có cách đọc nào bảo xóa `attendees`.
  - Giữ nguyên: prop `studentById` **bao gồm pass-through xuống `SessionAttendanceModal` (class-schedule-table.tsx:301)** — không xoá khỏi signature lẫn destructuring dù cột tên biến mất (rốt ruột còn 1 consumer thật); `sessionStudents` (roster modal + tư liệu phase 2 còn dùng), compute `attendees` → `isGroupSession`, CTA Điểm danh #91, roster tab label `"Học viên"`.
  - Cập nhật doc comment đầu file (dòng 29–44) — bỏ mô tả "the slot's students" khỏi danh sách cột.
- Non-functional: không thay đổi logic `buildClassSessions`/`sessionAttendanceState`; bảng hẹp hơn trên mobile.

## Architecture

Pure presentation change — chỉ `ClassScheduleTable` + contract test. Không đụng data layer, không đụng server.

## Related Code Files

- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx`
- Modify: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts`
- Delete: không

## Implementation Steps

> **Thứ tự TDD red-green bắt buộc:** viết các assertion contract TRƯỚC (bước 1 — sẽ ĐỎ), rồi mới sửa component để xanh (bước 2–5). Không đảo lại.

1. Contract test `class-detail-sessions-tab.contract.test.ts` (biến nguồn `scheduleTableSrc` đọc đúng file component đã tồn tại :23–26 — mọi assertion mới đặt trên biến NÀY):
   - Rename 2 test title CÙNG COMMIT: ":59 renders enhanced 4-column table…" → "**3-column**"; ":68 preserves legacy 5-column fallback…" → "**4-column** fallback" (không thì suite tự nói sai sau merge).
   - Legacy headers assertion (mảng literal tại :70–72): flip thành equality-style pin `["Ngày", "Giờ", "Chủ đề", "Trạng thái"]`.
   - Main table: hiện KHÔNG pin main headers (chỉ regex `<th…>Ngày & Giờ</th>` tại :60 được pin) — **thêm positive pin 3 `<th>`** (mirror style regex :60) + **negative assertion scoped `scheduleTableSrc`**: `expect(scheduleTableSrc).not.toMatch(/>\s*Học viên\s*<\/th>/)`. Regex `\s*` tolerant hơn literal chống JSX serialization thay đổi. KHÔNG áp lên `classDetailSrc` hay thư mục rộng hơn — label roster hợp lệ sống trong `$classId.tsx:114` và các file khác.
   - Thêm pin colSpan expanded row trên `scheduleTableSrc`: `toMatch(/colSpan=\{3\}/)` + `not.toMatch(/colSpan=\{4\}/)` (site colSpan duy nhất của web src — verified; thay thế cho việc không có e2e structural coverage).
   - Chạy test: PHẢI đỏ (assertions chưa thỏa vì source còn cột cũ).
2. Main table: xóa `<th>Học viên</th>` (dòng 144) và cell students (dòng 176); dọn compute `attendees`/`students` (dòng 151–155) — giữ `attendees` nếu `isGroupSession`/`checkInId` còn dùng (kiểm tra: `attendees.length` dùng cho `isGroupSession` dòng 158 — **giữ compute attendees, chỉ xóa chuỗi `students` join-name**).
3. Legacy fallback: bỏ `"Học viên"` khỏi headers (dòng 85) và cell `s?.name ?? ""` (dòng 96); bỏ `const s = studentById(l.sid)` nếu không còn dùng (dòng 87).
4. Expanded detail row: `colSpan={4}` → `colSpan={3}` (dòng 271).
5. Doc comment (dòng 29–44): bỏ "the slot's students" khỏi mô tả cột (dòng 32); đổi cụm "weekday-grouped 5-column table" (dòng 36) thành "weekday-grouped 4-column table"; ghi thêm ghi chú "cột Học viên đã bỏ (issue #93) — danh sách học viên xem ở tab Học viên; điểm danh chi tiết qua roster modal khi buổi actionable (#91)".
6. Chạy gates: `pnpm check && pnpm test && pnpm check-types` (từ repo root, per docs/code-standards.md).

## Success Criteria

- [x] Main table 3 cột, legacy fallback 4 cột, không còn cột Học viên ở bất kỳ dạng bảng nào.
- [x] Negative assertion `/>\s*Học viên\s*<\/th>/` vắng mặt trên `scheduleTableSrc`; guard legacy là array-pin flipped 4 phần tử (legacy `<th>` sinh runtime từ headers array — không thể negative-text).
- [x] Pin `colSpan={3}` positive+negative có trong contract test; layout expanded row không lệch.
- [x] Doc comment + 2 test titles đồng bộ ("3-column" / "4-column fallback"); không còn chữ "5-column"/"4-column table" chỉ sai cấu trúc mới.
- [x] Roster tab + SessionAttendanceModal + CTA Điểm danh hoạt động nguyên vẹn (`attendees` còn nguyên; test #91 vẫn xanh, không sửa).
- [x] Gates xanh.

## Risk Assessment

**Risk 1 (MEDIUM): Search-replace nhầm chữ "Học viên".** Contract test pin cả roster tab label `"Học viên"` (contract test :29; label thực khai báo ở `$classId.tsx:114`) — hai chỗ giống nhau về chuỗi, khác ngữ cảnh; bảng khác trong app cũng chứa text "Học viên" nhưng ngoài scope file này.
- Signal: contract test roster-tab assertion fail.
- Response: chỉ sửa assertions liên quan table headers; mọi assertion mới scoped trên `scheduleTableSrc`; đọc diff kỹ trước commit.

**Risk 2 (LOW): Xóa nhầm compute `attendees`.** `isGroupSession` (dòng 158) và `checkInId` vẫn cần `sessionAttendanceState`/attendees-derived logic.
- Signal: CTA group/1:1 đổi hành vi sau refactor.
- Response: chỉ xóa chuỗi `students` (map/join names); giữ mọi compute mà CTA dùng; e2e #91 là regression net.
