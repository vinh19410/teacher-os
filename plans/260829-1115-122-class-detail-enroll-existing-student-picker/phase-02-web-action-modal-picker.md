---
phase: 2
title: "Web action + modal picker"
status: pending
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Web action + modal picker

## Overview

Nối action kernel `enroll-student` từ web xuống endpoint Phase 1, và nâng cấp `AddStudentModal` thành modal 2 chế độ khi có `classId`: **Học viên có sẵn** (picker) / **Tạo học viên mới**. Trang `/students` (không `classId`) giữ nguyên form tạo mới, không toggle.

## Requirements

- Functional: chọn học viên chưa enroll (có ô lọc) + nhập gói → enroll; sau submit thành công modal đóng, snapshot refresh (roster/KPI tự tăng).
- Non-functional: tái dùng `useKernelFormSubmit` (double-submit guard, notice committed/unknown + reconcile) — không tự chế submit path.

## Architecture

- `data-actions.ts`: thêm variant `| { type: "enroll-student"; classId: string; studentId: string; payload: { total: number; price: number; mode: "Online" | "Offline" } }`.
- `repos/kernel.ts` `kernelCommand`: case `enroll-student` → `POST /api/classes/${classId}/enroll`, body `{ studentId, total, price, mode }`.
- `data-store-reducer.ts`: case `enroll-student` cho fixture mode — mirror case `add-student` với `classId`: push `studentId` vào `class.studentIds`, set `pkg` từ payload (done 0, remaining total); student không đổi. Unknown class/student → `state` nguyên vẹn (giống test `add-student with unknown classId`).
- `add-student-modal.tsx`:
  - Khi `classId` có: toggle segmented 2 nút `"Học viên có sẵn"` / `"Tạo học viên mới"`. **Default mode: "Học viên có sẵn" khi danh sách học viên đủ điều kiện (org chưa enroll vào lớp này) khác rỗng, ngược lại "Tạo học viên mới"** — deterministic theo dữ liệu, giữ flow e2e hiện có (org trống → thẳng form tạo mới).
  - Chế độ picker: ô lọc theo tên/SĐT + danh sách radio/select hiển thị `name — phone`; chọn 1 học viên; giữ các trường gói (Số buổi gói / Đơn giá / Hình thức). Submit → `run({ type: "enroll-student", classId, studentId, payload })`.
  - Rỗng danh sách đủ điều kiện → thông báo `"Tất cả học viên đã ở trong lớp này."` + nút chuyển sang tạo mới.
  - Chế độ tạo mới: form hiện tại nguyên trạng (validation name/phone giữ nguyên).
  - Khi không `classId` (`/students`): render form tạo mới như cũ, **không** toggle.
  - **Tiêu đề modal theo chế độ**: picker → `"Thêm học viên"`; tạo mới → giữ nguyên `"Thêm học viên mới"`. e2e `class-operations.spec.ts` đang assert đúng chuỗi `"Thêm học viên mới"` — với org trống, default mode là tạo mới nên chuỗi giữ nguyên, spec không vỡ.
  - Reset state (mode, selected, filter, form, error/notice qua `reset` của hook) khi modal mở lại/đổi class — host đã mount bằng `key`.

## Related Code Files

- Modify: `apps/web/src/lib/data-actions.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts`
- Modify: `apps/web/src/lib/data-store-reducer.ts`
- Modify: `apps/web/src/lib/data-store-reducer.test.ts` (tests-first)
- Modify: `apps/web/src/components/modals/add-student-modal.tsx`

## Implementation Steps

1. **TDD — reducer tests trước** trong `data-store-reducer.test.ts`: `enroll-student` push đúng studentId vào class, set pkg (done 0); unknown classId / unknown studentId → state unchanged. Chạy FAIL.
2. Thêm case `enroll-student` vào reducer → GREEN.
3. Thêm variant `KernelAction` + case `kernelCommand` (mapping test nếu đã có file test mapping theo pattern hiện hữu — nếu không có thì thêm assert vào test reducer/kernel repo theo pattern repo).
4. Refactor `AddStudentModal`: tách form tạo mới thành hàm render nội bộ; thêm toggle + picker + trường gói dùng chung `Field/Input/Select`; submit qua `useKernelFormSubmit` cho cả 2 mode.
5. Kiểm tra host `$classId.tsx` không cần đổi (modal tự quản mode) — chỉ xác nhận props `classId` truyền đúng.

## Success Criteria

- [ ] Reducer + mapping tests GREEN.
- [ ] QC flow thủ công: mở lớp có học viên chưa enroll → modal mặc định picker → chọn → Lưu → roster + KPI tăng.
- [ ] `/students` modal không đổi UI.
- [ ] `pnpm --filter web test` GREEN.

## Risk Assessment

- Default-mode heuristic đổi behavior e2e `class-operations` (org trống lúc thêm student → rơi về tạo mới) → signal: e2e FAIL ở bước điền tên; response: giữ heuristic, chỉ chỉnh spec nếu thực sự cần.
- Picker render cả học viên đang ở lớp khác → không sao (chỉ loại trừ `cls.studentIds` của lớp hiện tại).
