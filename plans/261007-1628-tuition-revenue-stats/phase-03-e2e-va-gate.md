---
title: "Phase 3: E2E + gate local + screenshot 3 viewport"
status: done
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: E2E + gate local + screenshot 3 viewport

## Overview

Rename menu vỡ **2 e2e specs** đang match text "Học phí" để click sidebar web — sửa đồng bộ, thêm
1 spec mới cho biểu đồ, rồi chạy full gate local (CI chỉ chạy trên `main`, gate chuẩn của repo là
bộ lệnh local) và chụp screenshot 3 viewport theo REVIEW.md.

## Key Insights

- **Chỉ 2 specs web vỡ** (red-team đã trace từng selector về app render thật):
  - `apps/e2e/specs/create-invoice.spec.ts:83` — `getByText("Học phí", { exact: true })` (click sidebar web).
  - `apps/e2e/specs/student-package-validation.spec.ts:124` — `getByText("Học phí", { exact: true })`.
- **KHÔNG đụng** `tuition-bank-transfer.spec.ts:240,245`: hai selector đó render bởi **apps/student**
  (spec `goto(STUDENT_ORIGIN)` tại dòng 236; heading từ `apps/student/src/components/overview/tuition-list.tsx:18`,
  link từ `inv.type || "Học phí"` dòng 37) — student app không bị rename, đổi selector ở đây là làm
  vỡ spec đang pass.
- Giữ nguyên: `student-row-detail.spec.ts:27` (tab học viên), `class-roster-tuition-debt.spec.ts`,
  `class-tuition-fee.spec.ts` (nghĩa class fee).
- **Seed không đặt được `createdAt` qua API** (`invoiceCreateSchema` strict, `contracts.ts:1133-1141`;
  DB default = now) → dùng pattern `seedInvoice` direct-SQL có sẵn
  (`tuition-bank-transfer.spec.ts:38-59`, INSERT với cột `created_at` truyền tường minh) để backdate.
  Invoice "paid" tạo bằng SQL `status='paid', paid_amount=0` — đúng shape mark-paid thật mà rule
  revenue xử lý (full amount).
- Gate local chuẩn repo (AGENTS.md): `pnpm check` → `pnpm check-types` → unit test từng app → e2e
  với override port `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.
- e2e stack không cần env worktree đặc biệt (kinh nghiệm #340).

## Requirements

- [x] 2 specs vỡ selector đã sửa sang "Doanh thu", pass.
- [x] `tuition-bank-transfer.spec.ts` giữ nguyên và vẫn pass (bằng chứng student app không ảnh hưởng).
- [x] Spec mới `apps/e2e/specs/tuition-revenue-chart.spec.ts`: seed 2 invoice **khác tháng**
      (tháng này paid + tháng trước unpaid, qua direct-SQL) → thấy section biểu đồ với nhãn 2 tháng,
      toggle "Quý" đổi URL thành `?ky=quarter`.
- [x] Full gate local xanh: `pnpm check`, `pnpm check-types`, `pnpm --filter web test`,
      `pnpm --filter server test`, e2e gate với port override.
- [x] Screenshot `/tuition` 3 viewport (1440×900, 768×1024, 375×812) lưu `screenshots/` trong plan dir;
      kiểm tra keyboard focus toggle (Tab + Enter) theo REVIEW.md.

## Implementation Steps

1. Sửa 2 specs vỡ: `create-invoice.spec.ts:83` và `student-package-validation.spec.ts:124` —
   thay `"Học phí"` → `"Doanh thu"` (vai trò text click sidebar web).
2. Viết `tuition-revenue-chart.spec.ts` theo khung spec có sẵn (auth helper dùng chung
   `./helpers` — mẫu `create-invoice.spec.ts:4`):
   - Seed direct-SQL: invoice A tháng hiện tại `status='paid', paid_amount=0` (backdate không cần);
     invoice B tháng trước `status='unpaid'` — truyền `created_at` lùi 1 tháng như `seedInvoice`.
   - Assert: heading "Doanh thu", nhãn 2 tháng hiện trên trục (theo `revenueByPeriod` — kỳ rỗng
     vẫn fill nên assert theo nhãn tháng cụ thể + tooltip/legend có "Phát hành").
   - Toggle "Quý" → `expect(page).toHaveURL(/ky=quarter/)`; assert tập nhãn đổi thành `Q…`.
3. Chạy tuần tự gate: `pnpm check && pnpm check-types && pnpm --filter web test && pnpm --filter server test`.
4. Chạy e2e gate:
   ```bash
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e
   ```
5. Chụp screenshot 3 viewport (Playwright screenshot hoặc dev server + browser), lưu
   `plans/261007-1628-tuition-revenue-stats/screenshots/`; kiểm tra focus ring toggle bằng Tab.

## Todo

- [x] Sửa `create-invoice.spec.ts:83`
- [x] Sửa `student-package-validation.spec.ts:124`
- [x] Spec mới `tuition-revenue-chart.spec.ts` (seed direct-SQL backdate)
- [x] Gate: check + check-types + web test + server test
- [x] Gate: e2e (port override)
- [x] Screenshot 3 viewport + keyboard focus

## Success Criteria

- Toàn bộ gate xanh; `tuition-bank-transfer.spec.ts` pass mà không cần sửa.
- Screenshots đủ 3 viewport, chart đọc rõ ở 375px (nhãn không chồng).

## Risk Assessment

- **Assert hình học SVG của recharts dễ vỡ khi bump version** — assert qua text/aria-label/nhãn
  trục/URL param, không assert pixel hình học.
- **Direct-SQL seed lệch shape thật (thiếu cột mới)** — copy nguyên pattern `seedInvoice` và chỉ
  đổi `created_at`/`status`; nếu schema thêm cột notNull mới thì seed function phải cập nhật theo.

## Security Considerations

- Spec mới chỉ seed data trong org test qua direct-SQL local, không đụng secret; không hardcode credential.
