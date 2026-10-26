---
phase: 4
title: "E2E AC-004"
status: pending
priority: P1
effort: "2h"
dependencies: ["phase-03"]
---

# Phase 4: E2E AC-004

## Files

- Create: `apps/e2e/specs/debt-timeline-and-reminders.spec.ts` (tái dùng seed TOS-15/16; giao dịch bank-hub seed qua `bank-hub-mock` như `tuition-bank-transfer.spec.ts`).

## Kịch bản

1. **Timeline:** "Nguyễn Minh Anh" có hóa đơn 4.500.000, 1 giao dịch QR Bank-Hub 1.000.000, 1 phiếu thu Tiền mặt 1.000.000 → `/debts` → (eye) → drawer có 3 mục đúng thứ tự mới nhất trước, nhãn "QR Bank-Hub" và "Thu thủ công · Tiền mặt"; Esc đóng, focus về nút (eye).
2. **Nhắc phí:** tích "Nguyễn Minh Anh" + 1 học viên nợ khác → "Gửi nhắc học phí (2)" → xác nhận → toast + link → màn Nhật ký thông báo `[5]` có bản ghi "Nhắc học phí" cho 2 học viên; quay lại bấm gửi lần 2 → toast báo đã nhắc hôm nay, `[5]` không thêm dòng.
3. Kịch bản 1 lặp ở 375×812.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-timeline-and-reminders`
- Trước khi merge vào `develop`: full suite Playwright.
