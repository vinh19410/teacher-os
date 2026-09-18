---
title: "Fix #118: Form accessibility (aria/required/error announce) và List empty states"
description: "Sửa lỗi thiếu required/aria-required/aria-invalid/aria-describedby trên form login và các modal tạo; bổ sung empty state cards và empty rows cho danh sách rỗng (/students, /classes, /tuition, /syllabus, /schedule) kèm CTA và Việt hóa legend."
status: completed
priority: P2
effort: 2h
issue: 118
branch: vinh19410/issue-118-aria-empty-states
tags: [bugfix, frontend, a11y, empty-state, forms, ui]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #118: Form thiếu aria/required; list trống không empty state

## Overview

Theo báo cáo QC và kết quả Dogfood QA trên staging (Issue #118):
1. **Form thiếu aria / required / error announcement**:
   - Form Login / Sign-up và toàn bộ modal tạo (`AddStudentModal`, `AddClassModal`, `AddInvoiceModal`, `AddSyllabusModal`, `AddLessonModal`, `AddModuleModal`, v.v.): label có dấu sao `*` nhưng input thực tế trong DOM không có `required` hay `aria-required="true"`.
   - Khi có lỗi nhập liệu: text hiển thị màu đỏ nhưng không được announce tới screen readers (thiếu `aria-invalid="true"`, thiếu `aria-describedby` nối tới ID của thông báo lỗi, và thông báo lỗi thiếu `role="alert"` / `aria-live="polite"`).
2. **List trống không có empty state**:
   - `/students`, `/classes`, `/tuition`: khi dữ liệu rỗng, `DataTable` chỉ render header cột và một khoảng trống `<tbody>` rỗng không một dòng thông báo "Chưa có dữ liệu".
   - `/syllabus`: khi chưa có template nào, grid rỗng hoàn toàn, không có thông báo hướng dẫn hay CTA.
   - `/schedule`: khi chưa có lớp học nào được tạo, giao diện tuần trống trơn không có CTA điều hướng; legend hiển thị tiếng Anh thuần túy (Trial, Mock, Review).
   - `/assignments`: đã được xử lý một phần trong issue #166, cần đảm bảo đồng bộ quy chuẩn với toàn hệ thống.
   - Mẫu chuẩn cần theo: `/reports` và `/assignments` hiển thị empty card có tiêu đề, copy hướng dẫn thân thiện và nút CTA hành động.

## Root Cause Analysis

1. **`Field` component (`apps/web/src/components/ui/field.tsx`)**:
   - `Field` là component bọc chung cho hầu hết các form modal và trang thiết lập.
   - `Field` nhận `label`, `error`, `help`, nhưng chỉ inject `id` vào child control khi `childId` chưa có; hoàn toàn không truyền `required`, `aria-required`, `aria-invalid`, hay `aria-describedby`.
   - Text lỗi `{error && <span className="text-[11px] text-danger">{error}</span>}` chỉ là `<span>` tĩnh, không có `id`, không có `role="alert"` hay `aria-live="polite"`.
2. **`AuthField` component (`apps/web/src/components/auth/auth-field.tsx`)**:
   - Không khai báo prop `required` trong `AuthFieldProps`, không truyền `required` hay `aria-required` vào thẻ `<input>`.
   - Text lỗi chưa có `role="alert"`.
3. **`DataTable` component (`apps/web/src/components/ui/data-table.tsx`)**:
   - Khi `rows.length === 0`, `<tbody>` rỗng hoàn toàn, dẫn tới hiện tượng header bảng trơ trọi trên khoảng trắng.
4. **Các trang danh sách (`/students`, `/classes`, `/tuition`, `/syllabus`, `/schedule`)**:
   - Chưa kiểm tra điều kiện danh sách rỗng (`length === 0`) ở cấp độ trang/workspace để hiển thị Empty State card tương tự `/reports` và `/assignments`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bổ sung `aria-required`, `required`, `aria-invalid`, `aria-describedby` và `role="alert"` tự động trong `Field` component | P2 |
| 2 | Bổ sung `required`, `aria-required`, `role="alert"` trong `AuthField` và form đăng nhập / đăng ký | P2 |
| 3 | Bổ sung fallback row với `emptyMessage` (mặc định "Chưa có dữ liệu.") trong `DataTable` khi `rows.length === 0` | P2 |
| 4 | Bổ sung Empty State Card chuẩn mực kèm copy hướng dẫn và nút CTA cho `/students`, `/classes`, `/tuition`, `/syllabus`, `/schedule` | P2 |
| 5 | Xử lý filter empty state khi người dùng lọc không có kết quả trên các trang danh sách | P2 |
| 6 | Cập nhật legend lịch dạy `/schedule` sang song ngữ / tiếng Việt thân thiện | P2 |
| 7 | Viết unit tests kiểm tra form accessibility và list empty states | P2 |
| 8 | Đảm bảo 100% test suite, lint check và typecheck sạch sẽ (`pnpm test`, `pnpm check`, `pnpm check-types`) | P1 |

## Non-Goals

- Không thay đổi backend API contracts hay schema database.
- Không thay đổi các quy tắc validation logic nghiệp vụ đã có.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Form accessibility: Field & AuthField required, aria-invalid, aria-describedby, role alert](./phase-01-form-accessibility.md) | Completed |
| 2 | [List empty states: DataTable fallback, Students, Classes, Tuition, Syllabus, Schedule](./phase-02-list-empty-states.md) | Completed |

## Success Criteria

- [x] Mọi input trong `Field` có nhãn chứa `*` hoặc prop `required` đều mang `required` và `aria-required="true"`.
- [x] Khi `Field` có `error`, input có `aria-invalid="true"`, `aria-describedby` trỏ tới ID của thông báo lỗi; thông báo lỗi có `role="alert"` và `aria-live="polite"`.
- [x] Form đăng nhập và đăng ký có `required` và `aria-required="true"` trên các trường bắt buộc; lỗi có `role="alert"`.
- [x] `DataTable` render dòng "Chưa có dữ liệu." khi `rows.length === 0`.
- [x] `/students`, `/classes`, `/tuition`, `/syllabus`, `/schedule` hiển thị Empty State card kèm CTA khi danh sách rỗng.
- [x] Khi lọc không có kết quả, hiển thị thông báo rỗng phù hợp.
- [x] Legend trên `/schedule` hiển thị nhãn tiếng Việt rõ ràng: "1:1", "1:2", "Học thử (Trial)", "Thi thử (Mock)", "Ôn tập (Review)".
- [x] `pnpm test`, `pnpm check`, `pnpm check-types` pass 100%.
