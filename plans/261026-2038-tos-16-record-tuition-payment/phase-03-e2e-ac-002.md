---
phase: 3
title: "E2E AC-002"
status: pending
priority: P1
effort: "2h"
dependencies: ["phase-02"]
---

# Phase 3: E2E AC-002

## Files

- Create: `apps/e2e/specs/debt-record-payment.spec.ts` (tái dùng seed của `debt-ledger-filters.spec.ts` từ TOS-15).

## Kịch bản (2 dòng Examples)

Seed học viên "Nguyễn Minh Anh" với hóa đơn 4.500.000, **due +10 ngày** (ngoài cửa sổ `due_soon` +7 để badge rơi đúng "Còn nợ", không phải "Sắp đến hạn"). Ngày +10 tính theo giờ VN cùng nguồn với `todayISO` của `debtLedger` — dùng helper `isoInDaysFromTodayVN` sẵn có của spec TOS-15, không tính UTC (tránh CI chạy gần nửa đêm lệch cửa sổ).

1. `/debts` → dòng học viên Còn nợ 4.500.000 → bấm `Thu` → nhập 2.000.000, phương thức Tiền mặt, ghi chú "Đợt 1" → hộp thoại báo "→ Còn nợ" → "Lưu phiếu thu học phí" → dòng: Đã thu 2.000.000, Còn nợ 2.500.000, badge "Còn nợ"; KPI "Tổng đã thu" tăng 2.000.000 (refresh được await trước khi hộp thoại đóng — assert sau khi hộp thoại đóng xong, không đếm thời gian cứng).
2. `Thu` lần nữa → "Thu toàn bộ 2.500.000" → lưu → Còn nợ 0, badge "Đã thu đủ"; reload giữ nguyên.
3. Mở `/tuition/$invoiceId` → thấy 2 giao dịch với phương thức (Tiền mặt) + ghi chú ("Đợt 1").

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-record-payment`
- Trước khi merge vào `develop`: full suite Playwright.
