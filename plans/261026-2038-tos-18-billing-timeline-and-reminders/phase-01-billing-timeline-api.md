---
phase: 1
title: "GET /api/students/:id/billing-timeline"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: API dòng thời gian

## Goal

Cung cấp endpoint `GET /api/students/:id/billing-timeline` (org-scoped, dưới `requireFinanceRole`) trả danh sách sự kiện phát hành hóa đơn (`invoice_issued`) và giao dịch thanh toán đã khớp (`payment` từ QR Bank-Hub hoặc thu thủ công) của học viên, sắp xếp mới nhất trước theo `createdAt`, không lộ dữ liệu thô (`raw` hay `content` sao kê ngân hàng).

## Files to Create or Modify

- Modify: `packages/api/src/contracts.ts` — thêm `billingTimelineEventSchema`, `BillingTimelineEvent`, `billingTimelineResponseSchema`, `BillingTimelineResponse`.
- Modify: `apps/server/src/routes/kernel.ts` — thêm handler `kernel.get("/students/:id/billing-timeline", requireFinanceRole, ...)`.
- Modify: `apps/server/src/lib/require-finance-role.test.ts` — thêm `GET /api/students/:id/billing-timeline` vào `FINANCE_ENDPOINTS`.
- Create: `apps/server/src/routes/billing-timeline.test.ts` — unit/integration test cho timeline API.

## Contract

```ts
// Updated: Validation & Red-Team Session 1 — thêm id cho payment, chuẩn hóa at = createdAt.toISOString(), ẩn content của bank_hub
export type BillingTimelineEvent =
  | {
      kind: "invoice_issued";
      at: string; // invoice.createdAt.toISOString()
      invoiceId: string;
      code: string; // `INV-${invoice.id.slice(-8).toUpperCase()}`
      type: string; // invoice.type.trim() || "Khác"
      amount: number;
      due: string;
      status: "unpaid" | "paid";
    }
  | {
      kind: "payment";
      id: string; // paymentTransaction.id
      at: string; // paymentTransaction.createdAt.toISOString()
      invoiceId: string;
      code: string; // `INV-${invoiceId.slice(-8).toUpperCase()}`
      amount: number;
      source: "bank_hub" | "manual";
      method: string; // manual -> INVOICE_PAYMENT_METHOD_LABEL[method] ?? "Khác"; bank_hub -> ""
      note: string; // manual -> content; bank_hub -> "" (không lộ sao kê gốc)
    };

export interface BillingTimelineResponse {
  events: BillingTimelineEvent[];
}
```

## Tasks & Steps

### Task 1.1 — Định nghĩa contract `BillingTimelineEvent` và `BillingTimelineResponse`
- **Goal:** Khai báo kiểu và Zod schema cho response của `GET /api/students/:id/billing-timeline` trong `@teacher-os/api/contracts`.
- **Target files and symbols:** `packages/api/src/contracts.ts` (`billingTimelineEventSchema`, `BillingTimelineEvent`, `billingTimelineResponseSchema`, `BillingTimelineResponse`).
- **Steps:**
  1. Mở `packages/api/src/contracts.ts` và thêm `billingTimelineEventSchema` (discriminatedUnion theo `kind`: `"invoice_issued"` và `"payment"`) cùng `billingTimelineResponseSchema = z.object({ events: z.array(billingTimelineEventSchema) }).strict()`.
  2. Export các type `BillingTimelineEvent` và `BillingTimelineResponse`.
- **Success criteria:** TypeScript biên dịch `packages/api` không lỗi.
- **Verify:** `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 1.2 — Viết test đỏ cho `GET /api/students/:id/billing-timeline` và `requireFinanceRole`
- **Goal:** Tạo bộ test kiểm tra toàn bộ hành vi, thứ tự sắp xếp, bảo mật PII và phân quyền của endpoint timeline trước khi cài đặt handler.
- **Target files and symbols:** `apps/server/src/routes/billing-timeline.test.ts`, `apps/server/src/lib/require-finance-role.test.ts` (`FINANCE_ENDPOINTS`).
- **Steps:**
  1. Tạo `apps/server/src/routes/billing-timeline.test.ts` kiểm tra:
     - Học viên có 2 hóa đơn + 1 giao dịch `sepay_bankhub` (`matched`) + 2 phiếu thu `manual` (`cash`, `transfer`) → trả 5 sự kiện đúng thứ tự `createdAt` giảm dần (khi cùng `createdAt` thì `payment` đứng trước `invoice_issued`, tie-break theo `id` giảm dần), đúng `source`, `method`, `code`.
     - Giao dịch `unmatched` hoặc của học viên khác không xuất hiện.
     - Không lộ `raw`, `provider`, `providerTxnId`, `bankAccountXid`, `recordedBy`; sự kiện `bank_hub` có `note === ""` (không lộ `content` chuyển khoản ngân hàng), sự kiện `manual` giữ `note === content`.
     - Học viên org khác hoặc không tồn tại → 404; chưa đăng nhập → 401; role `ta` / `class_teacher` → 403 `finance-forbidden`.
  2. Trong `apps/server/src/lib/require-finance-role.test.ts`, thêm `{ method: "GET", path: () => "/api/students/stu-1/billing-timeline" }` vào `FINANCE_ENDPOINTS`.
- **Success criteria:** Chạy test thất bại (red phase) vì route chưa được cài đặt (trả 404 thay vì 200/403).
- **Verify:** `pnpm --filter server test -- billing-timeline` exits non-zero with assertion failure; passing test before implementation is a failure.

### Task 1.3 — Cài đặt handler `GET /api/students/:id/billing-timeline` trong `kernel.ts`
- **Goal:** Xử lý truy vấn hóa đơn + giao dịch matched của học viên và trả về `{ events }` đã sắp xếp.
- **Target files and symbols:** `apps/server/src/routes/kernel.ts` (`kernelRoutes`).
- **Steps:**
  1. Đăng ký `kernel.get("/students/:id/billing-timeline", requireFinanceRole, async (c) => ...)` trong `apps/server/src/routes/kernel.ts`.
  2. Kiểm tra học viên thuộc `ctx.orgId`: query `student` theo `and(eq(student.id, studentId), eq(student.orgId, ctx.orgId))`. Nếu không tồn tại → trả `c.json({ error: "student not found" }, 404)`.
  3. Query tất cả hóa đơn của học viên trong org (`and(eq(invoice.orgId, ctx.orgId), eq(invoice.studentId, studentId))`) và tất cả giao dịch matched bằng `INNER JOIN invoice` trên `and(eq(paymentTransaction.invoiceId, invoice.id), eq(paymentTransaction.orgId, ctx.orgId), eq(paymentTransaction.matchStatus, "matched"), eq(invoice.orgId, ctx.orgId), eq(invoice.studentId, studentId))` (chỉ tốn 3 bind params, không bao giờ chạm giới hạn 100 biến SQL của D1).
  4. Ánh xạ hóa đơn sang `invoice_issued` (`status: inv.status === "paid" ? "paid" : "unpaid"`, `code: "INV-" + inv.id.slice(-8).toUpperCase()`, `type: inv.type.trim() || "Khác"`, `at: inv.createdAt.toISOString()`) và giao dịch sang `payment` (`source: tx.provider === "manual" ? "manual" : "bank_hub"`, `method: tx.provider === "manual" ? (INVOICE_PAYMENT_METHOD_LABEL[tx.method as InvoicePaymentMethod] ?? "Khác") : ""`, `note: tx.provider === "manual" ? tx.content : ""`, `at: tx.createdAt.toISOString()`).
  5. Sắp xếp mảng sự kiện giảm dần theo `createdAtMs`, nếu bằng nhau thì `payment` xếp trước `invoice_issued`, nếu cùng `kind` thì xếp giảm dần theo `id` / `invoiceId`. Trả `c.json({ events } satisfies BillingTimelineResponse)`.
- **Success criteria:** Toàn bộ unit test của `billing-timeline.test.ts` và `require-finance-role.test.ts` đều xanh.
- **Verify:** `pnpm --filter server test -- billing-timeline require-finance-role` exits 0 and `pnpm check && pnpm check-types` exits 0.

## Verification

- `pnpm --filter server test -- billing-timeline require-finance-role`
- `pnpm check`, `pnpm check-types`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
