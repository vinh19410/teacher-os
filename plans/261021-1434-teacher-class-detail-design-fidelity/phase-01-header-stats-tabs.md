---
phase: 1
title: "Header, hàng stat, tabs + dọn token chết"
status: pending
effort: "2h"
dependencies: []
---

# Phase 1: Header, stat, tabs

## Files

- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (header, stat, danh sách tab, tab mặc định, `validateClassDetailSearch`).
- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx` (dòng 333, 342, 350), `session-actions-modal.tsx` (dòng 173) — chỉ thay class chết.
- Tham chiếu (không sửa): `components/ui/page-head.tsx`, `card.tsx` (`StatCard` đã có `sub`, `hot`).

## Steps

1. Back link: dùng nút ghost `Button variant="ghost" size="sm"` + icon `ArrowLeft`, nhãn "Lớp học", đích `/classes`.
2. Header: `kicker` = `${loại} · ${lịch} · ${phòng/hình thức}` theo mẫu design; bỏ `lead`. Chỉ giữ "Giao bài tập" (outline) và thêm "Thêm buổi" (primary, mở `ClassSessionsManageModal` hoặc form thêm buổi hiện có). Chuyển "Thêm học viên" / "Sửa học phí" sang phase 3 (câu hỏi mở 3).
3. Stat: giảm còn 4 thẻ `grid-cols-2 lg:grid-cols-4`: Học viên (sub = khoảng ngày), Buổi đã học `x/y` (sub = `% giáo trình`), Chuyên cần (chỉ khi kiểm chứng được dữ liệu, `hot` khi còn buổi chưa điểm danh; không thì thay bằng Bài đang mở), Bài chờ nộp (sub = "Trên N bài đã giao"). Tính từ dữ liệu có sẵn trong route (`classAssignments`, `cls.sessionsDone`); bỏ biến không còn dùng.
4. Tabs: `Sessions & practice` · `Học viên` · `Giáo trình` · `Từ vựng` · `Ghi chú` (câu hỏi mở 1, 2). Mở rộng `CLASS_DETAIL_TABS` và ánh xạ giá trị cũ: `sessions`/`assignments` → tab Sessions & practice (giữ `assignmentsView` khi `assignments`); `roster` → Học viên.
5. Thay `bg-muted/40/30` → `bg-muted/40`, `text-foreground-2` → `text-muted-foreground`.

## Verification

- `pnpm --filter web test -- '\$classId'` xanh (cập nhật assertion tab/stat đã đổi, không nới lỏng).
- `grep -rnE "foreground-2|muted/40/30" apps/web/src` rỗng.
- Mở `/classes/<id>` ở 1440/768/375: header 2 nút, 4 stat, tab segmented không tràn ngang ở 375.
