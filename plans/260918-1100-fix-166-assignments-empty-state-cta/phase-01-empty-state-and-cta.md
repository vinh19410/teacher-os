---
phase: 1
title: "Bổ sung Empty State card, CTA button, AddAssignmentModal và unit tests"
status: completed
depends: []
files:
  - apps/web/src/components/modals/add-assignment-modal.tsx (new)
  - apps/web/src/routes/_auth/assignments/index.tsx
  - apps/web/src/routes/_auth/assignments/index.test.tsx (new)
---

# Phase 1: Bổ sung Empty State card, CTA button, AddAssignmentModal và unit tests

## Chi tiết thay đổi

1. **`apps/web/src/components/modals/add-assignment-modal.tsx`** (mới):
   - Tạo Modal `AddAssignmentModal` với `open` và `onClose`.
   - Tiêu đề: "Tạo bài tập".
   - Nội dung giải thích:
     - "Tính năng giao bài tập trực tiếp đang được hoàn thiện. Bài tập hiện được quản lý và đồng bộ thông qua các buổi học của Lớp học hoặc gắn với từng Học viên."
     - Cung cấp các nút hành động:
       - Nút chính (primary): "Đến trang Lớp học" (`navigate({ to: "/classes" })` + `onClose()`).
       - Nút phụ (secondary): "Đến trang Học viên" (`navigate({ to: "/students" })` + `onClose()`).
       - Nút đóng: "Đóng" (`onClose()`).

2. **`apps/web/src/routes/_auth/assignments/index.tsx`**:
   - Thêm state `modalOpen` (`useState(false)`).
   - Đổi container của `ChipFilter` thành `mb-4 flex flex-wrap items-center justify-between gap-4`.
   - Bổ sung nút `<Button onClick={() => setModalOpen(true)}>+ Tạo bài tập</Button>`.
   - Tách / render điều kiện cho phần nội dung:
     - Nếu `data.assignments.length === 0`: Render `Card` với `variant="white"`, padding, căn giữa:
       - `data-testid="assignments-empty-state"`
       - Heading `h2` "Chưa có bài tập nào".
       - Text giải thích "Bài tập được đồng bộ khi học viên tham gia lớp học hoặc được quản lý theo từng học viên. Hãy thêm học viên hoặc tạo lớp học để bắt đầu quản lý bài tập."
       - 2 nút CTA: "Quản lý lớp học" (`onClick={() => navigate({ to: "/classes" })}`) và "Quản lý học viên" (`onClick={() => navigate({ to: "/students" })}`).
     - Nếu `data.assignments.length > 0`:
       - Nếu `list.length === 0`: Render bên trong Card một thông điệp rỗng `p` font-mono text-meta text-xs text-center: "Không có bài tập nào phù hợp với bộ lọc."
       - Nếu `list.length > 0`: Render `<DataTable ... />` như hiện tại.
   - Thêm `<AddAssignmentModal open={modalOpen} onClose={() => setModalOpen(false)} />`.
   - Export `AssignmentsView` để có thể test độc lập với mock data và navigation.

3. **`apps/web/src/routes/_auth/assignments/index.test.tsx`** (mới):
   - Test 1: Workspace trống (`assignments: []`):
     - Hiển thị empty state với tiêu đề "Chưa có bài tập nào".
     - Có 2 nút CTA dẫn tới Lớp học và Học viên.
     - Thanh công cụ có nút "+ Tạo bài tập".
   - Test 2: Click "+ Tạo bài tập" mở `AddAssignmentModal` với hướng dẫn và nút điều hướng.
   - Test 3: Workspace có bài tập:
     - Render bảng `DataTable` với các dòng bài tập.
     - Lọc trạng thái hoạt động chính xác.
     - Khi lọc không có kết quả: hiển thị thông báo bộ lọc rỗng.
   - Test 4: KPI lead giữ nguyên định dạng `${data.assignments.length} bài tập · ${pendingCount} cần xử lý`.

## Verification Commands

```bash
cd apps/web && pnpm vitest run src/routes/_auth/assignments/index.test.tsx
pnpm test
pnpm check
pnpm check-types
```
