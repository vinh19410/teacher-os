---
title: "Plan: cột Học phí (nợ theo lớp) trong tab Học viên — issue #216"
date: 2026-09-21
summary: "Tạo plan 2 phase hiển thị học viên còn nợ học phí theo enrollment của lớp trong roster tab; issue #216, validation 13/13 claims."
---

# Plan: cột Học phí (nợ theo lớp) trong tab Học viên — issue #216

## What happened

Chạy `/ak:plan --github` cho yêu cầu: tab "Học viên" của trang chi tiết lớp (`apps/web/src/routes/_auth/classes/$classId.tsx`) phải cho giáo viên/admin thấy học viên nào còn nợ học phí.

Scout phát hiện dữ liệu đã đủ trên client: kernel snapshot có `invoices` (wire row `KernelInvoiceRow` đã mang `enrollmentId` từ lâu, `snapshot.ts` cũng select sẵn) và `data.enrollments` — chỉ thiếu map field xuống `Invoice` client (`repos/invoices.ts` đang bỏ qua) và một helper tính nợ. Không cần đụng server/DB.

Interview 2 quyết định với người dùng: (1) phạm vi nợ **theo lớp** qua `enrollmentId` của enrollment lớp đang xem, không theo tổng nợ học viên; (2) hiển thị **cột trong bảng** — không chip lọc, không KPI mới.

Plan `plans/260921-0419-class-roster-tuition-debt/` (2 phase, ~4h):
- Phase 1: thêm `eid` vào `Invoice` + `mapInvoices`, pure helper `rosterDebtByStudent()` trong `tuition-from-kernel.ts` (convention nợ = status ≠ "paid", khớp `tuitionTotals`), unit tests.
- Phase 2: cột "Học phí" 3 trạng thái (tiền đỏ / "Đã đủ" / "—") trong roster tab + e2e `class-roster-tuition-debt.spec.ts` theo pattern `create-invoice.spec.ts`.

## Decision

- Tính nợ client-side từ snapshot thay vì endpoint per-class — repo không có pattern GET per-resource, mọi collection đã trong store.
- Scoping theo `enrollmentId` (không phải `studentId`): `invoiceCreateSchema` luôn bắt enrollment hợp lệ nên eid đáng tin với dữ liệu từ API; legacy `eid:""` bị loại khỏi view lớp nhưng vẫn hiện ở trang Học phí.
- Ba trạng thái cell để phân biệt "chưa thu" với "chưa từng lập hóa đơn".
- Edge đã biết + chấp nhận: học viên rời lớp rồi enroll lại → hóa đơn cũ trỏ enrollmentId đã xóa, không đếm.

## Next steps

- Validation gate đạt: 13/13 claims verified (Light tier), `ak plan validate` OK, whole-plan sweep không còn mâu thuẫn.
- Issue #216 đã tạo với label `ready to review`; store sync issue/branch `vinh19410/issue-216-class-roster-tuition-debt`.
- Task hydration bỏ qua (2 phase < ngưỡng 3 phase).
- Triển khai: `/ak:cook plans/260921-0419-class-roster-tuition-debt/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
