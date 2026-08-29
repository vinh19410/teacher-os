---
phase: 2
title: "Route POST /api/invoices + validation + tests"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Route POST /api/invoices + validation + tests

## Overview

Thêm route `POST /api/invoices` trong `apps/server/src/routes/kernel.ts`: resolve enrollment org-scoped → suy ra `studentId` → insert invoice (`status: "unpaid"`) → trả 201 `{ id }`. TDD: viết toàn bộ test trước, đỏ rồi mới code xanh.

## Requirements

- Functional: tạo invoice từ enrollment; trả 201 với id mới (server-assigned).
- Non-functional: giữ nguyên guard auth/CSRF hiện có; lỗi 400/404 chung style không leak chi tiết zod; chỉ mutate bảng `invoice`.

## Architecture

Data flow: `kernelCtx` (orgId/userId từ session membership) → `readBody(c, invoiceCreateSchema)` → select enrollment `where and(eq(enrollment.id, body.enrollmentId), eq(enrollment.orgId, ctx.orgId))` → 404 nếu không thấy → select student `where and(eq(student.id, enrollment.studentId), eq(student.orgId, ctx.orgId))` → 404 nếu không thấy (tránh row "invisible" trong snapshot vì read path innerJoin student cùng org) → insert `{ id: crypto.randomUUID(), orgId, studentId, amount, due, note, enrollmentId, status: "unpaid" }` → `c.json({ id } satisfies CreatedResponse, 201)`.

## Related Code Files

- Modify: `apps/server/src/routes/kernel.ts` — route mới, đặt cạnh mark-paid (~dòng 1173).
- Modify: `apps/server/src/kernel.test.ts` — thay assertion `POST /api/invoices → 404`; thêm bộ test mới; mở rộng `insertInvoice`.
- Modify: `apps/server/src/routes/snapshot.ts` — `loadInvoices` chọn thêm 3 cột.

## Implementation Steps

1. **Tests trước (đỏ):** trong `kernel.test.ts`, xóa/sửa block test cũ assert `POST /api/invoices` → 404 (~650-658). Thêm describe mới:
   - Happy path: seed org/class/student/enrollment → POST body hợp lệ → 201 `{id}`; row trong `GET /api/invoices` có `amount`, `due`, `note`, `enrollmentId`, `status: "unpaid"`, `studentId` đúng từ enrollment. POST 2 lần cùng enrollmentId → 2 row riêng biệt (duplicate là hành vi hợp lệ — nhiều kỳ học phí).
   - Validation 400: amount 0 / âm / thập phân; due `2026-02-30` (regex pass nhưng ngày không tồn tại — roundtrip guard) / sai format; field lạ; thiếu enrollmentId.
   - Enrollment 404: id không tồn tại; id thuộc org khác → cùng một message `enrollment not found`.
   - Cross-org student: enrollment thuộc org hiện tại nhưng student của enrollment thuộc org khác (chèn trực tiếp qua db) → 404 `enrollment not found` (canh cùng lớp bug với test "malformed cross-org student relation is hidden from invoice reads" hiện có).
   - Guards: không session 401; Origin sai 403; Content-Type form 415.
2. Chạy `pnpm --filter server test` → xác nhận đỏ đúng vị trí.
3. Implement route theo pattern mark-paid: `unauthorized`, `readBody`, `CreatedResponse`; roundtrip-guard due với `parseStartDateStrict` (reuse util hiện có) → fail thì 400.
4. Chạy lại tests → xanh toàn bộ.
5. `pnpm check` + `pnpm check-types` **chạy ở root, vô điều kiện** (web fixture đã cập nhật ở phase 1) → xanh.

## Success Criteria

- [ ] Toàn bộ test mới xanh; không test nào bị skip.
- [ ] Route đặt trong `kernel.ts`, mutation ownership đúng theo docs/code-standards.md.
- [ ] `pnpm check`, `pnpm check-types` xanh.
