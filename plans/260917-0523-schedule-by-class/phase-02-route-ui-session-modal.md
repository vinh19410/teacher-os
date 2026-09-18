---
title: "Phase 2: Route UI theo lớp + ClassSessionModal"
status: pending
priority: P1
effort: 3h
dependencies: [1]
---

# Phase 2: Route UI theo lớp + ClassSessionModal

## Context Links

- `apps/web/src/routes/_auth/schedule.tsx` (route cần sửa)
- `apps/web/src/components/schedule/lesson-modal.tsx` (pattern action per-lessonId — giữ nguyên, còn 5 consumer khác)
- `apps/web/src/components/class-detail/class-schedule-table.tsx` (pattern in-place check-in per row, issue #91)
- `apps/web/src/lib/use-direct-kernel-action.ts`, `apps/web/src/lib/use-kernel-form-submit.ts` (hook action hiện có)

## Overview

- **Priority**: P1
- **Status**: pending
- Đổi render lưới tuần của `/schedule` sang block buổi lớp (tên lớp là nhãn chính) và thêm modal buổi học liệt kê từng học viên với action riêng. Không đổi `LessonModal` (vẫn phục vụ các consumer khác).

## Key Insights

- Block "Dự kiến" (projected) đã hiển thị tên lớp từ trước → sau thay đổi, block thật và block dự kiến cùng cấu trúc, lưới nhất quán tự nhiên.
- Modal phải derive rows **live** từ `data.lessons` qua `findSessionRows` (Phase 1) thay vì giữ snapshot rows trong state — check-in/hủy refresh snapshot và modal phải phản ánh ngay.
- Server action vẫn per-`lessonId` (`check-in`, `cancel-lesson`, `lesson-edit`) — modal lớp chỉ là lớp hiển thị gom, mỗi hàng học viên gọi action của row đó.

## Requirements

### Functional

- [x] Block buổi thật trên lưới hiển thị: giờ (mono), **tên lớp** (semibold), dòng phụ `type · topic(0..30)`; bỏ hoàn toàn tên học viên khỏi block
- [x] Số học viên hiển thị gọn trên block khi `rows.length > 1` (vd `2 HV`) — giữ block compact
- [x] Style trạng thái giữ nguyên: `completed` → opacity + line-through tên lớp; `cancelled` toàn bộ → opacity thấp; mixed → bình thường
- [x] Click block mở `ClassSessionModal` với ref `{ classId, dateISO: l.date ?? dates[i], day, time }`
- [x] Modal: tiêu đề `Tên lớp — {ngày}` (format như `formatSessionDate`), thời gian + dur, topic, zoom (row đầu có giá trị)
- [x] Modal: mỗi học viên một hàng — tên, badge trạng thái, và khi row `upcoming`: nút **Điểm danh** + menu/nút **Hủy** + **Sửa** (mở `LessonEditForm` cho row đó, như editing-branch của `LessonModal`)
- [x] Projected block: giữ nguyên hành vi display-only (div, không click, nhãn "Dự kiến · chưa có học viên")
- [x] Dọn import: `studentById` không còn dùng trong `schedule.tsx`

### Non-functional

- [x] Không đổi gì `lesson-modal.tsx`, `lesson-edit-form.tsx` (tái sử dụng nguyên trạng)
- [x] A11y: modal dùng `Modal` hiện có (focus trap, Esc); các nút có tên rõ ràng cho e2e (`getByRole("button", { name: "Điểm danh" })` scope theo hàng)

## Architecture

```
schedule.tsx
  ├─ selectWeekColumnSessions()   (Phase 1) → cột session entries
  ├─ selectProjectedWeekBlocks()  (không đổi) → projected blocks
  ├─ entries = [...sessions, ...blocks].sort(by time)
  └─ click session → ClassSessionModal(ref)
        └─ findSessionRows(data.lessons, ref) → hàng theo học viên
             └─ useDirectKernelAction per lessonId (check-in / cancel)
             └─ useKernelFormSubmit + LessonEditForm per lessonId (sửa)
```

## Related Code Files

- Modify: `apps/web/src/routes/_auth/schedule.tsx` — thay selector, render block lớp, state mở modal
- Create: `apps/web/src/components/schedule/class-session-modal.tsx` — modal buổi lớp
- Không đổi: `lesson-modal.tsx`, `lesson-edit-form.tsx`, server, schema

## Implementation Steps

1. Sửa `schedule.tsx`: thay `selectWeekColumnLessons` bằng `selectWeekColumnSessions`; hợp nhất entries (session + projected) sort theo `time`; render block theo yêu cầu functional ở trên; đổi state `openLesson` → `openSession` (ref, không giữ rows).
2. Tạo `class-session-modal.tsx`: props `{ ref: SessionRef | null; onClose }`; derive `className` từ `data.classes`, rows từ `findSessionRows`; render header + danh sách học viên.
3. Wire actions mỗi hàng: `useDirectKernelAction` cho check-in/cancel (reuse pattern `act()` của LessonModal — toast + close hoặc giữ modal mở để điểm danh tiếp học viên khác: **chọn giữ modal mở**, chỉ chặn nút của row đang pending).
4. Wire "Sửa": toggle form `LessonEditForm` nội vùng hàng (collapse các hàng khác khi đang sửa), submit qua `useKernelFormSubmit` như LessonModal.
5. Kiểm tra `routes-matcher.ts` không cần đổi (không thêm route mới).
6. Chạy `pnpm --filter web test` — sửa test component/contract nếu render thay đổi ảnh hưởng.

## Success Criteria

- Lớp 1:2 hiển thị 1 block với tên lớp; block 1:1 hiện tên lớp (không còn tên học viên ở bất kỳ block nào)
- Modal điểm danh row A → badge row A cập nhật live, modal không đóng; sửa/hủy row đúng `lessonId`
- Projected block vẫn không-click, e2e projected hiện tại không đổi vẫn đúng

## Risk Assessment

- **Modal mở trong lúc snapshot refresh** → rows derive từ store mỗi render nên tự cập nhật; nhưng `ref.time/date` là state tĩnh — chấp nhận (không đổi trong mùa mutation).
- **Nút "Điểm danh" trùng tên giữa các hàng** làm e2e ambiguous → mỗi hàng bọc `role="group"`/aria-label theo tên học viên để selector scope được.

## Security Considerations

- Action vẫn đi qua kernel endpoint hiện có (auth + CSRF không đổi); modal không hiển thị dữ liệu mới ngoài những gì `/schedule` đã có.

## Next Steps

- Phase 3 cập nhật e2e theo block-identity mới.
