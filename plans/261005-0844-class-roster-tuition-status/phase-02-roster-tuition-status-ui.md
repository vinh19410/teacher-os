---
phase: 2
title: "UI tab Học viên, Học phí, hồ sơ học viên + e2e"
status: pending
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: UI tab Học viên, Học phí, hồ sơ học viên + e2e

## Goal

Ô "Học phí" của tab Học viên hiển thị badge trạng thái + số tiền nợ;
`/tuition` và tab Học phí trong hồ sơ học viên dùng chung helper/nhãn để
"Quá hạn" hiện nhất quán; e2e phủ vòng đời Chưa lập phiếu → Chưa thu → Quá
hạn → Đã thu.

## Files to Create / Modify

- Modify: `apps/web/src/components/class-detail/class-roster-tab.tsx`
- Create: `apps/web/src/components/class-detail/class-roster-tab.test.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`
- Modify: `apps/web/src/routes/_auth/tuition.tsx`
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx`
- Modify: `apps/e2e/specs/class-roster-tuition-debt.spec.ts`
- Modify: `apps/e2e/specs/create-invoice.spec.ts`

## Tasks & Steps

- [ ] **`class-roster-tab.tsx`**: tách IIFE ô Học phí (dòng ~89-125) thành
  component export `RosterTuitionCell({ debt, isInvited })`:
  - `isInvited` → `<span className="font-mono text-meta text-xs">—</span>` (giữ nguyên)
  - `!debt` → `<Badge variant="muted">Chưa lập phiếu</Badge>`
  - `debt.status === "paid"` → `<Badge variant="success" dot>Đã thu</Badge>`
  - `unpaid` / `overdue` → `<span className="flex items-center gap-2 whitespace-nowrap">`
    gồm `<Badge variant={INVOICE_STATUS_VARIANT[status]} dot>{INVOICE_STATUS_LABEL[status]}</Badge>`
    và `<span className="font-mono">` số `fmtVND(debt.outstanding)`; thêm
    `font-semibold text-danger` khi `overdue`.
  - Nhãn/variant lấy từ `@/lib/format-invoice`, không hard-code.
  - Cập nhật type prop `rosterDebt` sang `Map<string, RosterDebt>` (import type từ `@/lib/tuition-from-kernel`).
- [ ] **`$classId.tsx`** (`:134-137`): `rosterDebtByStudent(classId, data.enrollments, data.invoices, todayISOVietnam())`
  trong `useMemo`; comment ngắn: ngày tính lại khi data đổi/reload, tab mở qua
  nửa đêm không tự chuyển.
- [ ] **`tuition.tsx`**: xóa `INV_LABEL`; trong bảng Hóa đơn tính
  `const status = effectiveInvoiceStatus(i, today)` (với `const today = todayISOVietnam()`
  một lần trong component) rồi render
  `<Badge variant={INVOICE_STATUS_VARIANT[status]} dot>{INVOICE_STATUS_LABEL[status]}</Badge>`.
  Cột hạn và nút "Đã nhận" giữ điều kiện `i.status !== "paid"` hiện tại.
- [ ] **`students/$studentId.tsx`**: xóa `INV_STATUS_LABEL`/`INV_VARIANT`
  (`:63-72`), badge ở `:296` dùng `effectiveInvoiceStatus` + map dùng chung.
- [ ] **`class-roster-tab.test.tsx`**: theo mẫu `renderToStaticMarkup` của
  `components/classes/class-assignments-tab.test.tsx`, test `RosterTuitionCell`
  5 ca: invited (`—`), không có debt (`Chưa lập phiếu`), paid (`Đã thu`, không
  có số tiền), unpaid (`Chưa thu` + `400.000đ`), overdue (`Quá hạn` + class `text-danger`).
- [ ] **`class-roster-tuition-debt.spec.ts`**:
  - Thêm helper ngày tương đối giờ VN (ví dụ `isoInDays(n)` dùng
    `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })`), `createInvoice(page, amount, due)`.
  - Trước hóa đơn: `rosterFee("Chưa lập phiếu")`.
  - Hóa đơn 1 (hạn +30 ngày): `Chưa thu` + `400.000đ`.
  - Hóa đơn 2 (hạn −1 ngày): `Quá hạn` + `800.000đ`; kiểm tra thêm hàng hóa đơn đó ở `/tuition` hiện `Quá hạn`.
  - Thu hết: `Đã thu`, không còn `800.000đ`, còn nguyên sau reload.
  - Cập nhật JSDoc đầu file (bỏ "Đã đủ").
- [ ] **`create-invoice.spec.ts`** (`:130`, `:152`): đổi hạn cố định
  `2026-12-25` sang hôm nay + 30 ngày (giờ VN), kỳ vọng `dd/mm` tính từ cùng
  ngày đó, để "Chưa thu" ở `:142` không thành "Quá hạn" sau 25/12/2026.
- [ ] Verify UI ở 1440×900, 768×1024, 375×812: ô Học phí không xuống dòng vỡ
  badge (bảng có `overflow-x-auto`), focus bàn phím của row không đổi. Chụp
  screenshot roster cho PR.

## Verification

```bash
pnpm --filter web exec vitest run tuition-from-kernel format-invoice class-roster-tab
pnpm check
pnpm check-types
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e exec playwright test class-roster-tuition-debt create-invoice
```

Pass khi tất cả lệnh thoát mã 0 và `grep -rn "Đã đủ\|INV_LABEL\|INV_STATUS_LABEL" apps/web/src apps/e2e/specs`
không còn kết quả.

## Risks

- `rosterFee(page, "Đã thu")` scope trong row nên không đụng StatCard "Đã thu (VND)" ở `/tuition`.
- Badge "Chưa lập phiếu" thêm chữ vào row: kiểm tra 375px không đẩy cột Thao tác (Kích hoạt / Hủy lời mời) ra khỏi vùng cuộn.
