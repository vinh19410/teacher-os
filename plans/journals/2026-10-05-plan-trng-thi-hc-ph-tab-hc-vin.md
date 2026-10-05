---
title: Plan trạng thái học phí ở tab Học viên
date: 2026-10-05
summary: "Lập plan #322: badge trạng thái học phí theo lớp; Quá hạn suy ra ở client vì server không bao giờ ghi overdue"
---

# Plan trạng thái học phí ở tab Học viên

## What happened
- Lập plan `plans/261005-0844-class-roster-tuition-status/` (issue #322) cho tab Học viên ở chi tiết lớp: thay ô Học phí (tiền đỏ / "Đã đủ" / "—" từ #216) bằng badge Đã thu / Chưa thu / Quá hạn / Chưa lập phiếu kèm số tiền nợ.
- Scout phát hiện server chỉ ghi `invoice.status` là `unpaid`/`paid`; không có writer `overdue` nào trong `apps/server/src` hay `packages/api/src`. Nhãn "Quá hạn" ở `/tuition` và hồ sơ học viên (`students/$studentId.tsx`) vì vậy chưa từng hiện với dữ liệu thật.
- `create-invoice.spec.ts` và `class-roster-tuition-debt.spec.ts` dùng hạn cố định `2026-12-25`; khi suy ra Quá hạn từ `due`, hai spec này sẽ hỏng sau ngày đó.
- `pnpm --filter web test -- <pattern>` bỏ qua bộ lọc và chạy cả 113 file test; lệnh đúng là `pnpm --filter web exec vitest run <pattern>`.

## Decision
- Suy ra Quá hạn ở client bằng pure helper `effectiveInvoiceStatus` (so chuỗi ISO với `todayISOVietnam()`); hạn đúng hôm nay vẫn là Chưa thu. Không đổi server/DB.
- Dùng chung nhãn/variant (`format-invoice.ts`) cho roster, `/tuition` và hồ sơ học viên để ba màn hình không lệch nhau.
- Hai spec e2e đổi sang ngày đến hạn tương đối.

## Next steps
- Thực thi bằng `/ak:cook plans/261005-0844-class-roster-tuition-status/plan.md`.
- Commit/push thư mục plan để các link trong issue #322 hoạt động.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
