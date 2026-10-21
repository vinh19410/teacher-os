---
phase: 3
title: "Timeline buổi học, bảng bài tập, giáo trình, bạn cùng lớp"
status: pending
effort: "2h"
dependencies: [1]
---

# Phase 3: Nội dung các tab

## Files

- Modify: `apps/student/src/components/class/class-lesson-list.tsx`, `classmates-tab.tsx`, và hàm `SyllabusTab` + khối tab/assignments trong `class-detail-view.tsx`.
- Create: `apps/student/src/components/class/class-assignment-table.tsx`.
- Giữ: `findNextLessonId`, `lessonDayLabel`, `LESSON_STATUS` export hiện có (test đang import).

## Steps

1. **Timeline** (`class-lesson-list.tsx`): card `rounded-xl border bg-card p-6`; mỗi `li` grid `[2rem_1fr] gap-4 pb-5`, đường dọc `absolute left-4 top-8 bottom-0 w-px bg-border`; chấm 32px: `completed` → `Check` nền primary, `absent` → `X` nền destructive, `cancelled` → `X` nền muted + tên gạch ngang, `upcoming` → `CircleDashed`; buổi tới có `ring-[3px] ring-ring/30` và nội dung trong thẻ `rounded-lg border bg-muted/40 p-3` + `Badge` "Buổi tới"; buổi sau đó `opacity-60`. Dòng nhỏ "Buổi {i} · {ngày}". **Giữ `aria-current="true"` trên `li` buổi tới**, nhãn "Đã học / Vắng / Đã huỷ / Sắp tới" qua `Badge outline`. Bỏ dòng bài về nhà (không có dữ liệu). Tiêu đề `h2` "Buổi học" giữ lại (e2e lọc theo heading này) nhưng dùng `sr-only` nếu design không hiển thị.
2. **Bảng bài tập**: `class-assignment-table.tsx` theo `Table` của design (`rounded-md border`, `th h-10 text-muted-foreground`, hàng `hover:bg-muted/50`). Cột: Bài tập | Hạn | Trạng thái | hành động. Trạng thái dùng `deriveAssignmentStatus` (Badge default cho chưa làm, secondary cho đã nộp, điểm band đậm cho đã chấm). Hành động: "Làm ngay" (chưa nộp) / "Xem lại" hoặc "Nhận xét" (đã nộp/chấm) là `Link` có `aria-label` cũ (`Làm bài: …` / `Xem lại kết quả: …`); bài `source !== "class_assignment"` không có link, giống hành vi hiện tại. Trang chi tiết thôi dùng `AssignmentList`; `AssignmentList` vẫn phục vụ `/assignments`.
3. **Giáo trình**: một card `divide-y`; hàng `px-5 py-3`: chủ đề hoàn thành → `Check` trong chấm tròn primary, chưa → `CircleDashed text-muted-foreground`; bên phải `{done}/{total} buổi` dạng `tabular-nums`. Bỏ số thứ tự trong ô vuông.
4. **Bạn cùng lớp**: thay ô vuông bằng `AvatarInitials` tròn `size-8`; tên `text-sm font-medium truncate`, "(bạn)" `text-muted-foreground font-normal`. Giữ `data-testid="classmate-card"`/`classmates-grid`, không thêm band (quyền riêng #378).
5. Tab bar trong `class-detail-view.tsx` chuyển sang `Tabs` phase 1; giữ `data-testid="class-tab-{id}"`.

## Verification

- `pnpm --filter student test -- class-detail classmates` xanh (cập nhật snapshot/assertion theo DOM mới, **không nới assert** `Buổi tới` / `aria-current`).
- Ảnh: timeline có đường dọc liên tục, buổi tới nổi, buổi tương lai mờ; bảng bài tập cuộn ngang được ở 375px.
