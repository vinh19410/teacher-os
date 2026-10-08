---
phase: 3
title: "E2E 2 lớp + gate local + screenshot"
status: pending
priority: P2
effort: "1.5h"
dependencies: [2]
---

# Phase 3: E2E 2 lớp + gate local + screenshot

## Goal

Chứng minh trên app thật rằng tab Học phí cộng học phí của 2 lớp và trừ đúng
số tiền đã thu, còn đúng sau reload.

## Files to Create / Modify

- Create: `apps/e2e/specs/student-tuition-summary.spec.ts`

Tái dùng helper sẵn có: `signUpViaUi`, `seedStudent` (`apps/e2e/specs/helpers.ts`);
luồng tạo lớp có học phí theo `class-tuition-fee.spec.ts` (label "Học phí / học viên (VND)");
luồng enroll + kích hoạt theo `class-roster-tuition-debt.spec.ts`; luồng tạo hóa đơn +
mark-paid theo `create-invoice.spec.ts`.

## Kịch bản

1. Sign up, seed học viên `QC Tuition Summary E2E`.
2. Tạo lớp A học phí 10.000.000, lớp B học phí 6.000.000; enroll học viên vào cả hai và kích hoạt.
3. Tạo hóa đơn 2.000.000 cho enrollment lớp A, mark-paid.
4. Mở `/students/<id>` → tab "Học phí":
   - Thẻ Tổng học phí `16.000.000đ`, Đã đóng `2.000.000đ`, Còn lại `14.000.000đ`.
   - Dòng lớp A: `10.000.000đ` / `2.000.000đ` / `8.000.000đ`; dòng lớp B: `6.000.000đ` / `0đ` / `6.000.000đ`.
5. Reload → số liệu giữ nguyên.
6. Click dòng hóa đơn vẫn mở `/tuition/<invoiceId>` (không hồi quy #345).

Assert theo role/text (`getByRole`, `getByText`), không dùng selector CSS mong manh.

## Tasks & Steps

1. [ ] Viết spec theo kịch bản trên.
2. [ ] Chạy spec mới với port override (dev stack chiếm 8000/8001/8003).
3. [ ] Chạy đủ gate local.
4. [ ] Chụp tab Học phí của Student Test 1 ở 1440×900, 768×1024, 375×812; kiểm tra focus bàn phím đi qua link lớp và dòng hóa đơn theo `REVIEW.md`.

## Verification

```bash
pnpm check
pnpm check-types
pnpm --filter web test
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e specs/student-tuition-summary.spec.ts
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e specs/invoice-detail.spec.ts specs/student-row-detail.spec.ts
```

Pass khi mọi lệnh exit 0 và có đủ 3 screenshot để đính kèm PR.
