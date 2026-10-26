---
phase: 3
title: "E2E AC-003"
status: pending
priority: P1
effort: "2h"
dependencies: ["phase-02"]
---

# Phase 3: E2E AC-003

## Files

- Create: `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`.
- Modify: helper seed trong `apps/e2e/specs/helpers` — thêm `seedOrgMember({ teacherEmail, role })` tạo user + membership role `ta` / `class_teacher` vào org của giáo viên (chỉ dùng cho test, vì UI mời nhân sự thuộc TOS-48).

## Kịch bản

1. **Số tiền không hợp lệ:** seed hóa đơn 4.500.000, thu trước 2.000.000 (qua API TOS-16) → `/debts` → `Thu` → nhập `0` → thấy lỗi inline, nút "Lưu phiếu thu học phí" disabled → nhập `3.000.000` → vẫn lỗi → nhập `2.500.000` → nút bật.
2. **Phân quyền:** đăng nhập thành viên role `ta` → `page.goto("/debts")` → URL về `/dashboard`, thấy thông báo; sidebar không có "Công nợ"; `page.request.post("/api/invoices/<id>/payments")` → 403. Lặp với `class_teacher` cho `/tuition`.
3. Hồi quy: `create-invoice`, `tuition-bank-transfer`, `invoice-detail` vẫn xanh.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-payment-validation-and-guard`
- Trước khi merge vào `develop`: full suite Playwright.
