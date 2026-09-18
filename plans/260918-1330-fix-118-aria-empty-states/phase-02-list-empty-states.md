# Phase 2: List Empty States & Schedule Legend

## Objective

Xử lý triệt để tình trạng "bảng/danh sách rỗng chỉ có header, không có empty state" trên các trang:
- `/students`: Empty State Card khi chưa có học viên + filter empty card khi bộ lọc không có kết quả.
- `/classes`: Empty State Card khi chưa có lớp học + filter empty card khi bộ lọc không có kết quả.
- `/tuition`: Empty card cho danh sách gói học + Empty State Card kèm CTA cho danh sách hóa đơn.
- `/syllabus`: Empty State Card khi chưa có template + filter empty card khi bộ lọc không có kết quả.
- `/schedule`: Empty State Card khi chưa có lớp học nào + notice khi tuần không có buổi học + Việt hóa legend (Trial, Mock, Review).
- `DataTable`: Fallback table row hiển thị `emptyMessage` (mặc định "Chưa có dữ liệu.") khi `rows.length === 0`.

## Changes

1. **`apps/web/src/components/ui/data-table.tsx`**:
   - Thêm `emptyMessage?: ReactNode` vào `DataTableProps`.
   - Khi `rows.length === 0`, render `<tr><td colSpan={headers.length} className="px-4 py-8 text-center text-muted-fg text-sm">{emptyMessage ?? "Chưa có dữ liệu."}</td></tr>`.

2. **`apps/web/src/routes/_auth/students/index.tsx`**:
   - Khi `students.length === 0`: render Empty State Card với `data-testid="students-empty-state"`, tiêu đề "Chưa có học viên nào", đoạn mô tả và nút CTA "+ Thêm học viên".
   - Khi `filter !== "Tất cả"` và `list.length === 0`: render card thông báo "Không có học viên nào phù hợp với bộ lọc.".

3. **`apps/web/src/routes/_auth/classes/index.tsx`**:
   - Khi `classes.length === 0`: render Empty State Card với `data-testid="classes-empty-state"`, tiêu đề "Chưa có lớp học nào", đoạn mô tả và nút CTA "+ Tạo lớp".
   - Khi `filter !== "Tất cả"` và `list.length === 0`: render card thông báo "Không có lớp học nào phù hợp với bộ lọc.".

4. **`apps/web/src/routes/_auth/tuition.tsx`**:
   - Khi `data.students.length === 0` (mục gói học): render card thông báo "Chưa có gói học nào đang hoạt động.".
   - Khi `data.invoices.length === 0` (mục hóa đơn): render Empty State Card với `data-testid="tuition-invoices-empty"`, tiêu đề "Chưa có hóa đơn nào", đoạn mô tả và nút CTA "+ Tạo hóa đơn".

5. **`apps/web/src/routes/_auth/syllabus/index.tsx`**:
   - Khi `templates.length === 0`: render Empty State Card với `data-testid="syllabus-empty-state"`, tiêu đề "Chưa có syllabus nào", đoạn mô tả và nút CTA "+ Tạo syllabus".
   - Khi `filter !== "Tất cả"` và `list.length === 0`: render card thông báo "Không có giáo trình nào phù hợp với bộ lọc.".

6. **`apps/web/src/routes/_auth/schedule.tsx`**:
   - Khi `data.classes.length === 0`: render Empty State Card với `data-testid="schedule-empty-state"`, tiêu đề "Chưa có lịch dạy nào", đoạn mô tả và nút CTA "Quản lý lớp học" (chuyển tới `/classes`).
   - Khi `slotCount === 0` và `data.classes.length > 0`: hiển thị thông báo "Không có buổi học nào trong tuần này." phía trên lịch tuần.
   - Cập nhật legend:
     - "1:1"
     - "1:2"
     - "Học thử (Trial)"
     - "Thi thử (Mock)"
     - "Ôn tập (Review)"

7. **Unit tests**:
   - Viết `apps/web/src/components/ui/data-table.test.tsx` kiểm tra fallback empty row.
   - Cập nhật / bổ sung tests kiểm tra empty states trên các route `students`, `classes`, `tuition`, `syllabus`, `schedule`.
