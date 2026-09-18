# Technical Journal: Fix #118 Form Accessibility & List Empty States

- **Date**: 2026-09-18
- **Author**: Dispatched Worker (Orca)
- **Target Issue**: [#118](https://github.com/vinh19410/teacher-os/issues/118) - `[QC][P2] Form thiếu aria/required; list trống không empty state`
- **Branch**: `vinh19410/issue-118-aria-empty-states`
- **Target Branch**: `develop` (beta)

## Context & Motivation

QC phát hiện trên staging:
1. Các form đăng nhập/đăng ký và modal tạo (`AddStudentModal`, `AddClassModal`, `AddInvoiceModal`, `AddSyllabusModal`, `AddLessonModal`, `AddModuleModal`, v.v.): label có dấu `*` nhưng input trong DOM thiếu thuộc tính `required` và `aria-required="true"`. Lỗi validate chỉ là text màu, không announce tới assistive technologies do thiếu `aria-invalid="true"`, `aria-describedby` và `role="alert"`.
2. Các trang danh sách khi workspace rỗng (`/students`, `/classes`, `/tuition`, `/syllabus`, `/schedule`): `DataTable` chỉ render header cột và một khoảng trắng `<tbody>` rỗng; `/syllabus` và `/schedule` không có hướng dẫn hay CTA.

## Solutions Implemented

1. **Form Accessibility**:
   - `apps/web/src/components/ui/field.tsx`: Nâng cấp `Field` tự động phát hiện `required` từ nhãn chứa `*` hoặc prop `required`, tự động inject `required={true}` và `aria-required="true"` vào input/select/textarea con. Khi có `error`, tự động inject `aria-invalid="true"` và `aria-describedby` trỏ tới ID của message lỗi; message lỗi có `role="alert"`, `aria-live="polite"`. Text `help` cũng được liên kết qua `aria-describedby`.
   - `apps/web/src/components/auth/auth-field.tsx`: Thêm `required` prop, truyền `required` và `aria-required` vào `<input>`, bổ sung `role="alert"` cho error message.
   - `apps/web/src/components/sign-in-form.tsx` & `apps/web/src/components/sign-up-form.tsx`: Cung cấp `required` cho các trường bắt buộc.
2. **List Empty States**:
   - `apps/web/src/components/ui/data-table.tsx`: Bổ sung `emptyMessage?: ReactNode` (mặc định "Chưa có dữ liệu.") và render một dòng `<tr><td colSpan={...}>` thay vì để `<tbody>` rỗng.
   - `/students`: Bổ sung Empty State Card với tiêu đề, mô tả và CTA "+ Thêm học viên"; xử lý filter empty card khi bộ lọc không có kết quả.
   - `/classes`: Bổ sung Empty State Card với tiêu đề, mô tả và CTA "+ Tạo lớp học"; xử lý filter empty card khi bộ lọc không có kết quả.
   - `/tuition`: Bổ sung Empty Card cho gói học hoạt động và Empty State Card kèm CTA "+ Tạo hóa đơn" cho mục hóa đơn.
   - `/syllabus`: Bổ sung Empty State Card với tiêu đề, mô tả và CTA "+ Tạo syllabus"; xử lý filter empty card.
   - `/schedule`: Bổ sung Empty State Card với CTA "Quản lý lớp học" khi workspace chưa có lớp nào; thông báo tuần rỗng khi tuần không có buổi; Việt hóa legend ("Học thử (Trial)", "Thi thử (Mock)", "Ôn tập (Review)").

## Verification

- `apps/web/src/components/ui/field.test.tsx`: 8/8 tests passed.
- `apps/web/src/components/ui/data-table.test.tsx`: 3/3 tests passed.
- `apps/web/src/lib/empty-states.test.tsx`: 6/6 tests passed.
- `apps/web/src/components/sign-in-form.test.tsx`: 2/2 tests passed.
- Full web test suite: 54 test files, 574 tests passed.
- Server test suite: 11 test files, 229 tests passed.
- `pnpm check-types`: Clean across 10 packages.
- `pnpm check`: Clean formatting and linting.
