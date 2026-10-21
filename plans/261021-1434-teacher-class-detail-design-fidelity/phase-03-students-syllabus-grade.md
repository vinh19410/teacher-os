---
phase: 3
title: "Tab Students + Syllabus + nút Grade"
status: done
effort: "2h"
dependencies: [1]
---

# Phase 3: Students, Syllabus

## Files

- Modify: `apps/web/src/components/class-detail/class-roster-tab.tsx`, `apps/web/src/components/class-detail/curriculum-management-section.tsx`.
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (chuyển "Thêm học viên", "Sửa học phí" vào tab Học viên — chỉ phần JSX tab, phase 2 không đụng đoạn này).
- Tham chiếu: `apps/web/src/components/ui/avatar.tsx`, `badge.tsx`, `/syllabus` route để xem `SyllabusTree` có tái dùng được không.

## Steps

1. Bảng Học viên (5 cột): `Học viên` (Avatar + tên, hàng bấm được sang hồ sơ), `Đăng ký` (badge trạng thái + số buổi còn lại), `Band mục tiêu` (`s.targetBand` — "Current band" của design không có data, không bịa), `Học phí` (giữ `Badge` nợ hiện có), `Thao tác`. **Bỏ cột `Chuyên cần`** (chốt red-team: không có data tin được). Giữ `rosterDebt`, thao tác huỷ/mời đang có.
2. Header của tab: dải thông tin `Học phí: {fmtVND(cls.tuitionFee)} / học viên` (hoặc `Học phí: —` — hợp đồng hook) + nút `Sửa` (exact, mở `EditClassFeeModal` — **nút "Sửa" duy nhất trên trang**) + nút `+ Thêm học viên vào lớp` (giữ nguyên nhãn, mở `EnrollStudentModal`) — cả hai `outline size="sm"`.
3. Tab Giáo trình: bọc `CurriculumManagementSection` bằng `Section`. **Descope tách `SyllabusTree`** (đảo finding red-team theo advisory 2026-10-21): cây `/syllabus` gắn chặt `useSyllabusMutations` + `collapsed` + modal (#221 chủ động đưa vào "Quản lý buổi" — `curriculum-management-section.tsx:22-26`); refacor route 469 dòng nằm ngoài mục tiêu fidelity trang lớp. Ghi lệch có chủ đích vào `DESIGN.md`.
4. Rà `class-roster-tab.tsx` và `curriculum-management-section.tsx` tìm class/token v1 còn sót (`variant="white"` vô nghĩa ở v2 vẫn chạy nên không đổi hàng loạt).

## Verification

- `pnpm --filter web test -- class-roster-tab` xanh (cập nhật nếu cột đổi).
- e2e `class-roster-tuition-debt`, `class-tuition-fee` xanh — cả hai cần bước mở tab Học viên trước khi
  assert `Học phí: …` / click `Sửa`; 13 spec file bấm `+ Thêm học viên vào lớp` thêm helper
  `openClassRosterTab` (tạo mới trong `helpers.ts`).
- Ở 375px bảng cuộn ngang trong card, không làm trang cuộn ngang.
