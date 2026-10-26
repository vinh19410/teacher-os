---
phase: 2
title: "Route /debts: 3 KPI, chip trạng thái, tìm kiếm debounce, lọc lớp, bảng học viên"
status: pending
priority: P1
effort: "5h"
dependencies: ["phase-01"]
---

# Phase 2: UI Sổ công nợ

## Files

- Create: `apps/web/src/routes/_auth/debts/index.tsx`, `apps/web/src/routes/_auth/debts/index.test.tsx`.
- Modify: `apps/web/src/components/layout/sidebar.tsx` (mục "Công nợ", icon từ lucide, map `/debts`), `apps/web/src/components/command-search/search-index.ts` (thêm trang vào ⌘K), `apps/web/src/routeTree.gen.ts` (sinh lại), `apps/web/src/routes-matcher.ts` nếu có danh sách route.

## Bố cục (theo wireframe `[4]`, token design v2)

- `PageHead` kicker "Học phí", title "Sổ công nợ học viên"; action: nút outline "+ Tạo khoản thu" mở `AddInvoiceModal` sẵn có. Chỗ cho nút "Gửi nhắc học phí (N)" để TOS-18 điền.
- Hàng 3 `StatCard` (`data-testid="debt-kpis"`): "Tổng phải thu kỳ này", "Tổng đã thu", "Tổng còn nợ quá hạn" (tile `hot` khi > 0); `sub` = "N học viên".
- Thanh lọc: ô tìm "Tìm học viên / SĐT" (debounce 300ms) · `ChipFilter` trạng thái kèm badge đếm `aria-hidden` · select "Lớp" (Tất cả lớp + danh sách lớp).
- `DataTable` cột: Học viên · Lớp · Phải đóng · Đã thu · Còn nợ · Hạn đóng (badge "Quá hạn"/"Sắp đến hạn"/"Xong") · Thao tác (để trống, TOS-16/18 điền). Click dòng → `/students/$studentId`.
- Empty state: chưa có hóa đơn nào → hướng dẫn tạo khoản thu; lọc không ra kết quả → "Không có học viên khớp bộ lọc" + nút xóa lọc.
- Mobile 375: KPI xếp 1 cột, bảng cuộn ngang trong card như `/tuition`.

## Tasks & Steps

1. Test component đỏ (kernel harness có sẵn `apps/web/src/test/kernel-harness.tsx`):
   - Render đúng số dòng + giá trị VNĐ (`fmtVND`).
   - Bấm chip "Quá hạn" → `navigate` với `search.status = "overdue"`, `replace: true`.
   - Gõ tìm → chưa navigate ngay; sau 300ms (fake timers) navigate 1 lần.
   - Đổi select lớp → KPI đổi; đổi chip → KPI không đổi.
   - Vào `/debts?status=clear` → chip "Đã thu đủ" active.
2. Viết route + sidebar cho xanh.
3. Chạy dev, verify 3 viewport + Tab focus; chụp screenshot cho PR; `pnpm design:compare`.

## Verification

- `pnpm --filter web test -- debts sidebar`
- `pnpm check`, `pnpm check-types`
