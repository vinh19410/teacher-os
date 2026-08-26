---
title: "Phase 2: Timeline read-only enhancements"
status: todo
priority: P1
effort: "0.5-1d"
dependencies: [1]
---

# Phase 2: Timeline read-only enhancements

## Overview

Nâng cấp `ClassScheduleTable` (bảng lịch học hiện tại) với 2 enhancement không cần mutation: (1) Module badge cạnh Lesson title trong cột "Chủ đề", (2) Expandable row hiển thị `materials` + `objectives` của syllabus lesson tương ứng. Đây là bước đầu tiên user cảm nhận được lợi ích gộp: thấy module boundary trực quan + xem chi tiết lesson mà không rời tab.

## Requirements

- [ ] Cột "Chủ đề" render Module badge nhỏ (chip/tag) ở đầu cell, kế đến là Lesson title (giữ nguyên logic edited-topic-override).
- [ ] Khi không có `moduleTitle` (session không map syllabus, edited topic thuần), không hiển thị badge — chỉ text.
- [ ] Row có `lessonId` hiển thị chevron expand ở đầu row.
- [ ] Click chevron (hoặc click row) → mở sub-row hiển thị `lesson.materials` + `lesson.objectives`.
- [ ] Nếu `lesson.materials` và `lesson.objectives` đều trống → hiển thị empty state "Chưa có tài liệu và mục tiêu".
- [ ] Expand state per-row là local (không persist).
- [ ] Legacy fallback path (`sessions === null`) không nhận cải tiến — vẫn 4 cột read-only.
- [ ] Keyboard accessible: Space/Enter mở/đóng expand khi row focused.

## Architecture

**Data path**
- `ClassScheduleTable` nhận thêm prop `syllabus: Syllabus | null` (thay vì chỉ `syLessons`).
- Với mỗi session row, gọi `sessionLessonInfo(session, syllabus)` (từ P1) → có `title`, `moduleTitle`, `lessonId`.
- Nếu `lessonId`, tra ngược lesson trong syllabus (via helper mới `lessonById(syllabus, lessonId)` hoặc dùng `syllabusLesson.materials/objectives` inline).

**Rendering**
- Badge component: reuse `Badge` từ `apps/web/src/components/ui/badge.tsx` (nếu có), variant "outline" hoặc "secondary".
- Expandable row: dùng pattern colspan sub-row (row liền dưới với `colSpan={4}` chứa nội dung), hoặc `<details>` nếu shadcn/ui đã có Accordion-in-row pattern. Chọn approach đơn giản hơn — colspan sub-row.
- State: `const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set())` trong `ClassScheduleTable`.

**A11y**
- `aria-expanded` trên row cha, `role="row"`.
- Sub-row có `aria-label="Chi tiết lesson"`.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — cập nhật `ClassScheduleTable` props + render logic (dòng ~479-574).
- Optional Create: `apps/web/src/components/class-detail/session-row-details.tsx` — nếu sub-row nội dung phức tạp thì tách; nếu ngắn thì inline.
- Modify: `apps/web/src/lib/class-sessions.ts` — thêm helper `lessonById(syllabus, id)` nếu chưa có.

## Implementation Steps

1. Cập nhật signature `ClassScheduleTable` nhận `syllabus` thay vì `syLessons`.
2. Trong `$classId.tsx` chỗ render `<ClassScheduleTable>`, truyền `syllabus` object thay vì `syLessons` array.
3. Trong bảng, dùng `sessionLessonInfo()` cho mỗi session. Render badge nếu `moduleTitle`, render chevron nếu `lessonId`.
4. Thêm state `expandedIdx` + handler toggle.
5. Render sub-row conditional với `materials`/`objectives` (dùng `whitespace-pre-wrap` cho multiline).
6. Verify legacy fallback không bị ảnh hưởng — grep `sessions === null` branch, giữ nguyên.
7. Chạy dev server → mở Class Detail tab Lịch học → verify: badge hiển thị đúng, expand hoạt động, keyboard access.
8. Chạy `pnpm test` + biome check.

## Todo

- [ ] Đổi prop `ClassScheduleTable` từ `syLessons` sang `syllabus`
- [ ] Render Module badge trong cột Chủ đề (skip nếu `moduleTitle` null)
- [ ] Thêm chevron + state `expandedIdx`
- [ ] Sub-row hiển thị `materials` + `objectives` (empty state khi trống)
- [ ] A11y: `aria-expanded`, keyboard toggle Space/Enter
- [ ] Verify legacy fallback (`sessions === null`) không đổi
- [ ] Manual QA: lớp có syllabus + lớp không syllabus + session mix edited/non-edited
- [ ] `pnpm test` + biome check xanh

## Success Criteria

- [ ] Session có syllabus mapping → thấy badge Module + chevron.
- [ ] Session không có syllabus (edited topic hoặc index > lessons) → chỉ text, không badge, không chevron.
- [ ] Expand row → hiển thị materials + objectives (hoặc empty state).
- [ ] Keyboard: focus row, Enter/Space → toggle expand.
- [ ] Legacy fallback vẫn hiển thị 4 cột như cũ.
- [ ] Không có mutation trong phase này (0 kernel action calls).

## Risk Assessment

**Risk 1**: Badge chiếm quá nhiều chiều ngang khi Module title dài → break layout column.
- Signal: Badge wrap 2 dòng hoặc đẩy title xuống dưới.
- Response: `max-width` + `truncate` cho badge; tooltip full title khi hover.

**Risk 2**: Sub-row colspan không đúng khi legacy fallback đang render (4 cột) vs enhanced (4 cột + chevron column).
- Signal: Sub-row lệch cột trong DOM.
- Response: Chỉ render enhanced version khi `sessions !== null`; giữ 4 cột legacy nguyên vẹn.

**Risk 3**: Performance khi lớp 72 sessions với 30 expanded → re-render toàn bảng mỗi lần toggle.
- Signal: Lag khi click expand nhanh.
- Response: `useMemo` cho `sessionLessonInfo()` per row; state `Set` (đã đúng). Nếu vẫn lag, memoize row component.

**Risk 4**: `lessonById` nếu syllabus có duplicate lesson id → tra sai.
- Signal: Sub-row hiển thị materials của lesson khác.
- Response: Assert lesson id unique trong test; nếu chưa, dùng path (moduleIdx, lessonIdx) làm key thay id.
