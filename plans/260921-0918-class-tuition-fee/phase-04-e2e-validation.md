---
phase: 4
title: "E2E & validation sweep"
status: todo
priority: P1
effort: 1h
dependencies: [3]
---

# Phase 4: E2E & validation sweep

## Goal

E2E phủ vòng đời học phí (tạo có/không fee → sửa → xóa) và chạy toàn bộ gate repo để merge được.

## Context Links

- `apps/e2e/specs/create-class-validation.spec.ts` — pattern: `signUpViaUi` → sidebar "Lớp học" → "+ Tạo lớp" → `dialog.getByLabel(...)` → assert lỗi qua `dialog.getByRole("alert")`
- `apps/e2e/specs/helpers.ts` — `signUpViaUi`, helpers ngày/VN timezone
- `apps/e2e/specs/create-invoice.spec.ts` — pattern assert giá trị tiền trong bảng/dialog

## Files to Create / Modify

- Create: `apps/e2e/specs/class-tuition-fee.spec.ts`

## Implementation Steps

1. Spec mới, mỗi test tự `signUpViaUi` (org bootstrap sẵn ở GET /kernel đầu tiên):
	- **Tạo lớp có học phí**: mở "+ Tạo lớp", điền required (mirror spec validation: Tên, kỹ năng Writing, ngày học T2), fill "Học phí / học viên (VND)" = `5000000`, submit → dialog đóng; vào lớp → hiển thị "Học phí: 5.000.000đ / học viên" (định dạng `fmtVND` vi-VN).
	- **Tạo lớp bỏ trống học phí** → chi tiết lớp hiện "Học phí: —".
	- **Sửa học phí**: mở modal Sửa, prefill đúng `5000000`; đổi thành `6000000`, lưu → modal đóng, text cập nhật không reload.
	- **Xóa học phí**: mở modal Sửa, xóa trắng input, lưu → "Học phí: —".
	- **Validate input xấu**: nhập `0` hoặc quá 12 chữ số → `dialog.getByRole("alert")` hiện thông điệp lỗi tiếng Việt, dialog không đóng.

2. Chạy spec đến xanh (`--headed` debug khi selector lệch — labels là nguồn sự thật, selector convention `getByLabel`).

3. Validation sweep toàn repo (thứ tự): `pnpm check` (biome, bao gồm format plan không cần) → `pnpm check-types` → `pnpm --filter web test` → `pnpm --filter server test` → `pnpm --filter e2e e2e` (full suite để bắt drift selector từ feature này).

## Todo

- [ ] Spec `class-tuition-fee.spec.ts` 5 case trên
- [ ] Full e2e suite xanh
- [ ] `pnpm check`, `pnpm check-types`, web + server tests xanh

## Verification

- `pnpm check && pnpm check-types && pnpm --filter web test && pnpm --filter server test && pnpm --filter e2e e2e` — exit 0 toàn bộ

## Risk Assessment

- Selector drift (repo vừa sửa UI — commit 6a3507c) → luôn lấy label tiếng Việt trong code, không hardcode text suy diễn; chạy spec mới trước full suite.

## Security Considerations

- Không có; chỉ đọc/ghi qua UI thật có auth.

## Next Steps

- Merge; vấn đề mở cho tương lai: endpoint sửa lớp tổng quát, default amount hóa đơn từ học phí lớp (out of scope có chủ đích).
