---
title: Issue 135+62 tuition due-note va KPI tu invoice that
date: 2026-08-30
summary: "Map due/note vao web Invoice, KPI tuition tu invoice that, e2e mo rong; vibe --ship --beta --advice"
---

# Issue 135+62 tuition due-note va KPI tu invoice that

## Kết quả

Một PR đóng 2 issues (#135 + #62), cùng surface `/tuition`:

- **#135** — `Invoice` web + `mapInvoices` giờ mang `due` (ISO) và `note` từ wire; bảng Hóa đơn có cột "Đến hạn" (dd/mm cho unpaid/overdue, "—" cho paid/legacy rỗng); note hiện tooltip (`<span title>`) quanh tag Loại.
- **#62** — toàn bộ KPI `/tuition` tính từ store thật: lead `Đã thu ${fmtVND}`, StatCard Đã thu/Còn nợ từ `tuitionTotals` (paid vs unpaid+overdue), "Gói sắp hết" = `pkg.remaining ≤ 4`. Không còn số hardcode nào trên trang (QC re-test 2026-08-27: account rỗng → 0đ).

## Điểm tricky

1. **Red-team bắt 8 lỗi plan**, đáng giá nhất: fixture `apps/web/test/fixtures/mock-data.ts` có 3 Invoice literal sẽ vỡ type dây chuyền khi thêm field required, và gate typecheck sai lệnh (`build` = vite build không typecheck; phải `check-types`).
2. **Cảnh tensơ UTC-drift**: `formatDue` cấm `new Date()` — tái dùng `formatDayMonth` + export thêm `isValidISODate` (roundtrip guard) từ week-grid để chặn cả `2026-02-30`.
3. **Va chạm kongming bắt mà red-team bỏ sót**: KPI render `fmtVND` cùng chuỗi "400.000đ" với cell bảng → 2 assertion e2e cũ chết strict mode; fix bằng scope `invoiceRegion` + assert exact qua num-div `toHaveText`.
4. Ngưỡng KPI "Gói sắp hết": badge danger ≤2 và warn ≤4 cùng chữ "Sắp hết" — KPI lấy ≤4 để không mâu thuẫn bảng ngay trên cùng trang.

## Bằng chứng

vitest web 387/387 · server 188/188 · root `pnpm test` (turbo 4/4 + ci-workflow + topology-drift) xanh · `turbo run check-types` 6/6 · e2e Playwright local full suite 37 pass/1 skip pre-existing (spec create-invoice mở rộng: due tường minh 2026-12-25 → "25/12", mark-paid → KPI flip exact → reload persist).

## Ghi chú pipeline

vibe `--ship --beta --advice`: kongming 3 checkpoint (plan gates GO / pre-ship GO / e2e-flake + Deploy-Staging risk), review độc lập APPROVE + 3 Minor đã fix, ship beta → develop.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
