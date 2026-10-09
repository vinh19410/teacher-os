---
phase: 1
title: "Dòng hóa đơn đã thanh toán + số liệu thu tay"
status: pending
priority: P2
effort: 1.5h
dependencies: []
---

# Phase 01 — Dòng hóa đơn đã thanh toán + số liệu thu tay

## Context

- Component: `apps/student/src/components/overview/tuition-list.tsx` (dùng ở
  `apps/student/src/routes/_auth/index.tsx` → `StudentTuitionSection`).
- Contract: `StudentInvoiceItem` (`packages/api/src/contracts.ts:2101`), có `amount`,
  `paidAmount`, `amountDue`, `status`.
- Rule "đã thanh toán" trên server: `apps/server/src/lib/payment-instructions.ts:81`.
- Tag sẵn có: `Tag` export từ `apps/student/src/components/overview/class-card.tsx:131` (tone
  mặc định `neu-in`, `hot` = nền cam).
- Badge success theo `DESIGN.md`: `bg-chip`.
- Mẫu test render tĩnh + mock `Link`: `apps/student/test/overview.test.tsx`.

## Files

| File | Thao tác |
|---|---|
| `apps/student/src/components/overview/tuition-list.tsx` | Sửa |
| `apps/student/src/components/overview/class-card.tsx` | Sửa (thêm tone success cho `Tag`) |
| `apps/student/test/tuition-list.test.tsx` | Tạo mới |

## Steps

1. **Tag tone success.** Thêm prop `success?: boolean` vào `Tag`, map sang
   `bg-chip text-fg`. Giữ nguyên hai tone cũ để `ClassBadges` không đổi.
2. **Helper trong `tuition-list.tsx`:**
   - `isSettled(inv) = inv.status === "paid" || inv.amountDue <= 0`.
   - `paidOf(inv) = isSettled(inv) ? inv.amount : inv.paidAmount`.
   - `dueOf(inv) = isSettled(inv) ? 0 : inv.amountDue`.
3. **Tổng:** `totalPaid` cộng `paidOf`, `totalDue` cộng `dueOf`.
4. **Dòng đã thanh toán:** trong `<Link>`, khi `isSettled(inv)`:
   - Cột trái: chỉ tên khoản `{inv.type || "Học phí"}`, bỏ dòng `Hạn …`.
   - Cột phải: `fmtVnd(inv.amount)` (mono, như số tiền hiện tại) và `<Tag success>Đã thanh toán</Tag>`.
   - Không render `0đ` và `Đã nhận …`.
   Dòng chưa thanh toán giữ nguyên markup.
5. **Docstring:** sửa comment của `TuitionList` ("danh sách khoản chưa đóng") cho đúng: danh sách
   mọi hóa đơn, khoản đã thanh toán hiện gọn với badge.
6. **Test** `apps/student/test/tuition-list.test.tsx` (mock `@tanstack/react-router` như
   `overview.test.tsx`, render bằng `renderToStaticMarkup`):
   - hóa đơn `amountDue = 0` → có "Đã thanh toán" và số tiền, không có "Đã nhận", "Hạn", `>0đ<`.
   - hóa đơn `status = "paid"`, `paidAmount = 0` → có badge, "Đã đóng" = amount, "Còn lại" = `0đ`.
   - hóa đơn đóng một phần → vẫn có `Đã nhận x / y` và `Hạn …`, không có badge.
   - mảng rỗng → không render gì.

## Validation

```bash
pnpm --filter student test
pnpm check
pnpm check-types
```

Kiểm tra trực quan student overview (dev stack port 8003) ở 1440×900, 768×1024, 375×812, cả dark
và light, và focus bàn phím trên các dòng. Chụp screenshot đưa vào PR.

## Risks

- Dòng đã thanh toán ngắn hơn dòng chưa đóng, nên chiều cao các dòng không đều. Chấp nhận được vì
  đó chính là mục tiêu "hiển thị đơn giản".
- e2e `tuition-bank-transfer` click link `/Học phí/` đầu tiên và mong có QR. Seed của spec đó là
  hóa đơn `unpaid`, nên không bị ảnh hưởng.

## Rollback

Revert commit; thay đổi chỉ nằm ở client student, không có migration.
