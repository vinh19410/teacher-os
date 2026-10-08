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
2. Tạo lớp A học phí 10.000.000, lớp B học phí 6.000.000; enroll học viên vào cả hai và kích hoạt. **Lưu ý: tổ hợp 1 học viên × 2 lớp là combo chưa có precedent trong specs** (red-team #12 trong bảng plan.md) — assert riêng từng bước kích hoạt lớp B thành công để failure dễ chẩn đoán.
3. Tạo hóa đơn 2.000.000 cho enrollment lớp A, mark-paid. **Bắt buộc chọn enrollment tường minh trong picker "Học viên *"** — modal mặc định `activeEnrollments[0]` (`add-invoice-modal.tsx:53`), thứ tự theo `createdAt` nên KHÔNG bảo đảm là lớp A; chọn `selectOption` với label `"QC Tuition Summary E2E · <tên lớp A>"` (format label `student · class` tại `add-invoice-modal.tsx:68`). Precedent `create-invoice.spec.ts:127` chỉ assert label chứa tên học viên vì org đó có 1 enrollment — KHÔNG áp dụng được phần picker.
4. Mở `/students/<id>` → tab "Học phí":
   - Thẻ Tổng học phí `16.000.000đ`, Đã đóng `2.000.000đ`, Còn lại `14.000.000đ`.
   - Dòng lớp A: `10.000.000đ` / `2.000.000đ` / `8.000.000đ`; dòng lớp B: `6.000.000đ` / `0đ` / `6.000.000đ`.
5. Reload → số liệu giữ nguyên.
6. Click dòng hóa đơn vẫn mở `/tuition/<invoiceId>` (không hồi quy #345).

## Quy tắc assert (chống strict-mode double-match)

Chuỗi tiền lặp nhiều lần trên màn (`2.000.000đ` ≥ 3 nơi, `6.000.000đ` 2 nơi trong dòng lớp B):

- Assert số trên thẻ KPI bằng locator scope theo label thẻ, theo tiền lệ `kpiCard()` của `create-invoice.spec.ts:70-88` (`.grid.grid-cols-3 > div` + `filter({ hasText: label })` + exact match) — ngoại lệ CSS có chủ đích, không vi phạm tinh thần "không selector mong manh".
- Assert số trong bảng theo lớp scope theo `getByRole("row")` chứa tên lớp, rồi `getByRole("cell")`.
- Cấm `getByText("2.000.000đ")` trần và cấm `.first()` để né strict mode.

## Screenshot

Chụp **trong context của spec e2e** (DB e2e bị wipe mỗi run — `boot.ts:74-78` — nên "Student Test 1" của dev stack không tồn tại ở đây): sau bước 5, set viewport 1440×900 / 768×1024 / 375×812 lần lượt và `page.screenshot()` tab Học phí của học viên e2e. Lưu vào thư mục screenshot dùng cho PR.

## Tasks & Steps

1. [x] Viết spec theo kịch bản trên (kể cả screenshot 3 viewport trong context e2e).
2. [x] Chạy spec mới với port override (dev stack chiếm 8000/8001/8003).
3. [x] Chạy đủ gate local — **full suite e2e** theo AGENTS.md (red-team #4: Phase 1 refactor `revenueByPeriod`/`tuitionTotals` dùng chung với `/tuition`, full suite là safety net duy nhất vì develop không có CI; `tuition-bank-transfer.spec.ts` trong suite phủ đường ledger `paidAmount` thật).
4. [x] Screenshot đã chụp trong context e2e (mục "Screenshot" ở trên) ở 1440×900, 768×1024, 375×812; kiểm tra focus bàn phím đi qua link lớp và dòng hóa đơn theo `REVIEW.md`.

## Verification

```bash
pnpm check
pnpm check-types
pnpm --filter web test
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e specs/student-tuition-summary.spec.ts
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e
```

Pass khi mọi lệnh exit 0 và có đủ 3 screenshot (từ context e2e) để đính kèm PR. Kiểm tra thêm focus bàn phím đi qua link lớp và dòng hóa đơn theo `REVIEW.md`.
