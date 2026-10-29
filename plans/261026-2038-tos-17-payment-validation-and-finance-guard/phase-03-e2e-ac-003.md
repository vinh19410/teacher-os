---
phase: 3
title: "E2E AC-003"
status: completed
priority: P1
effort: "2h"
dependencies: ["phase-02"]
---

# Phase 3: E2E AC-003

## Files to Create or Modify

- Create: `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`.
- Modify: `apps/e2e/specs/helpers.ts` — thêm `seedOrgMember(page, { teacherEmail, role, name? })` tạo tài khoản qua `/api/auth/sign-up/email` và gắn `membership.role` (`"ta"` / `"class_teacher"`) vào đúng org của giáo viên (chỉ dùng cho test, vì UI mời nhân sự thuộc TOS-48).

## Tasks & Steps

### Task 3.1 — Thêm helper `seedOrgMember` và E2E spec `debt-payment-validation-and-guard.spec.ts`
- **Goal:** Kiểm chứng E2E cả 2 kịch bản của AC-003 trên trình duyệt thật kèm chụp screenshot 3 viewport (1440×900, 768×1024, 375×812).
- **Target files and symbols:** `apps/e2e/specs/helpers.ts` (`seedOrgMember`), `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`.
- **Steps:**
  1. Thêm `seedOrgMember` vào `apps/e2e/specs/helpers.ts`: lấy `orgId` từ `orgIdForTeacherEmail(teacherEmail)`, gọi `page.request.post(`${API_ORIGIN}/api/auth/sign-up/email`)` để tạo user + session cookie, và ghi `membership` với `role` (`"ta"` hoặc `"class_teacher"`) gắn vào `orgId` trong `local.db`.
  2. Tạo `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`:
     - **Scenario 1 (Số tiền không hợp lệ):** seed hóa đơn 4.500.000, thu trước 2.000.000 (còn nợ 2.500.000) → mở hộp thoại `Thu` trên `/debts` → nhập `0` → thấy lỗi inline `"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ"`, nút `"Lưu phiếu thu học phí"` bị disabled → nhập `3000000` → vẫn lỗi và nút disabled → nhập `2500000` → hết lỗi, nút bật và lưu thành công; chụp screenshot 3 viewport.
     - **Scenario 2 (Phân quyền tài chính):** đăng nhập thành viên `ta` qua `seedOrgMember` → `page.goto("/debts")` → bị điều hướng về `/dashboard`, thấy thông báo `"Bạn không có quyền xem Sổ công nợ"`, sidebar không có `"Công nợ"` và `"Doanh thu"`; gọi `POST /api/invoices/:id/payments` và `GET /api/invoices/:id/transactions` → 403. Lặp với `class_teacher` truy cập `/tuition` → về `/dashboard` và gọi API công nợ → 403.
- **Success criteria:** E2E spec mới và các spec hồi quy học phí/công nợ chạy xanh trên cổng 8100/8101/8103/8104.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-payment-validation-and-guard debt-record-payment create-invoice invoice-detail` exits 0.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-payment-validation-and-guard`
- Trước khi merge vào `develop`: chạy hồi quy E2E và `pnpm check`, `pnpm check-types`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
