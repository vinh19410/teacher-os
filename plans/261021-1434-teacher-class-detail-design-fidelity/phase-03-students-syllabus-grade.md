---
phase: 3
title: "Tab Students + Syllabus + nút Grade"
status: pending
effort: "2h"
dependencies: [1]
---

# Phase 3: Students, Syllabus

## Files

- Modify: `apps/web/src/components/class-detail/class-roster-tab.tsx`, `apps/web/src/components/class-detail/curriculum-management-section.tsx`.
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (chuyển "Thêm học viên", "Sửa học phí" vào tab Học viên — chỉ phần JSX tab, phase 2 không đụng đoạn này).
- Tham chiếu: `apps/web/src/components/ui/avatar.tsx`, `badge.tsx`, `/syllabus` route để xem `SyllabusTree` có tái dùng được không.

## Steps

1. Bảng Học viên: cột `Học viên` (Avatar `size-8 rounded-full bg-muted` + tên, hàng bấm được sang hồ sơ), `Đăng ký`, `Band hiện tại` (chỉ nếu có dữ liệu), `Chuyên cần` (chỉ nếu phase 1 xác nhận có dữ liệu; `text-destructive` khi < 75%), `Học phí` (giữ `Badge` nợ hiện có). Giữ `rosterDebt`, thao tác huỷ/mời đang có.
2. Header của tab: nút "Thêm học viên" và "Sửa học phí" (outline, `size="sm"`).
3. Tab Giáo trình: bọc `CurriculumManagementSection` bằng `Section`; nếu `/syllabus` có phần cây thuần hiển thị thì tái dùng, không copy.
4. Rà `class-roster-tab.tsx` và `curriculum-management-section.tsx` tìm class/token v1 còn sót (`variant="white"` vô nghĩa ở v2 vẫn chạy nên không đổi hàng loạt).

## Verification

- `pnpm --filter web test -- class-roster-tab` xanh (cập nhật nếu cột đổi).
- e2e `class-roster-tuition-debt`, `class-tuition-fee` xanh.
- Ở 375px bảng cuộn ngang trong card, không làm trang cuộn ngang.
