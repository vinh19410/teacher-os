---
title: "Fix #176: Hóa đơn: cột Mã hiển thị UUID đầy đủ, cột Loại trống thành '—'"
description: "Rút gọn mã hóa đơn dạng UUID thành mã ngắn gọn (INV-XXXXXXXX) và gán nhãn mặc định 'Học phí' cho cột Loại khi trống hoặc '—'."
status: completed
priority: P3
effort: 20m
issue: 176
branch: vinh19410/issue-176-tuition-uuid-type
tags: [bugfix, frontend, tuition, invoices, formatting]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #176: Hóa đơn: cột Mã hiển thị UUID đầy đủ, cột Loại trống thành '—'

## Overview

Theo Dogfood QA vòng 2 (Issue #18 trong `dogfood-output/report.md`, GitHub Issue #176):
1. Bảng Hóa đơn (`apps/web/src/routes/_auth/tuition.tsx:184-190`, DataTable "Mã"/"Loại"):
   - Cột "Mã" render trực tiếp `{i.id}` — UUID 36 ký tự (`6b2ac60c-1d64-4156-977d-07a52f554cdd`) chiếm rộng bảng, vỡ layout và không đọc được.
   - Cột "Loại" render `<Tag>{i.type}</Tag>`. Khi tạo hóa đơn qua `POST /api/invoices`, trường `type` mặc định là rỗng `""` (hoặc `"—"`), dẫn đến `<Tag>` hiển thị pill rỗng không có chữ hoặc hiển thị `"—"`.
2. Trang chi tiết học viên tab Học phí (`apps/web/src/routes/_auth/students/$studentId.tsx:216-220`) cũng có bảng tương tự với `inv.id` và `inv.type` chưa qua định dạng.

Mục tiêu:
1. Thêm pure helpers `formatInvoiceCode(id: string)` và `formatInvoiceType(type?: string | null)` vào `apps/web/src/lib/tuition-from-kernel.ts`.
2. `formatInvoiceCode`: Rút gọn UUID hoặc ID dài thành mã ngắn dạng `INV-XXXXXXXX` (8 ký tự cuối viết hoa), giữ nguyên các mã đã có prefix `INV-` (như `INV-0001`, `INV-084`), đồng thời giữ thuộc tính `title={i.id}` trên thẻ `<span>` để người dùng có thể hover xem đầy đủ UUID khi cần.
3. `formatInvoiceType`: Gán nhãn mặc định rõ ràng `"Học phí"` khi `type` rỗng, chỉ chứa khoảng trắng, `"—"`, `"-"`, `null` hoặc `undefined`. Nếu có giá trị tùy biến (như `"Gói 12 buổi"`), giữ nguyên giá trị đó.
4. Cập nhật bảng Hóa đơn trong `apps/web/src/routes/_auth/tuition.tsx` và `apps/web/src/routes/_auth/students/$studentId.tsx`.
5. Bổ sung unit tests trong `tuition-from-kernel.test.ts` và contract test trong `kernel-runtime.contract.test.ts`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Cột Mã hiển thị mã ngắn gọn dễ đọc (`INV-XXXXXXXX` hoặc giữ nguyên `INV-...`), hover xem full UUID | P3 |
| 2 | Cột Loại hiển thị nhãn mặc định `"Học phí"` thay vì pill rỗng hoặc `"—"` | P3 |
| 3 | Đồng bộ cách hiển thị trên cả `/tuition` và `/students/$studentId` | P3 |
| 4 | Unit tests & contract tests khóa chặt hành vi, 100% test pass | P3 |

## Key Decisions

- **Vị trí helper:** Đặt trong `apps/web/src/lib/tuition-from-kernel.ts` - cùng nơi chứa `tuitionTotals`, `packagesEndingSoon`, `formatDue`. Đây là module phụ trách toàn bộ presentation helpers của miền Hóa đơn & Học phí.
- **Không thay đổi model / snapshot mapper:** `Invoice.id` trong state và API payload bắt buộc giữ nguyên UUID gốc để các mutation (`POST /api/invoices/:id/mark-paid`) hoạt động chính xác. Việc rút gọn chỉ là tầng hiển thị UI.
- **Tooltip full UUID:** Thẻ `<span key="id" title={i.id} ...>` cho phép copy hoặc tra cứu toàn bộ UUID khi cần tích hợp hệ thống.
- **Nhãn mặc định "Học phí":** Phù hợp với bản chất module học phí và toàn bộ luồng tạo hóa đơn học viên.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Format Invoice Code and Type](./phase-01-format-invoice-code-and-type.md) | Completed |

## Success Criteria

- [x] `formatInvoiceCode` chuẩn hóa UUID thành `INV-XXXXXXXX` và giữ nguyên mã `INV-...`.
- [x] `formatInvoiceType` trả về `"Học phí"` cho chuỗi rỗng, `"—"`, null/undefined.
- [x] Bảng hóa đơn tại `/tuition` render `formatInvoiceCode(i.id)` và `<Tag>{formatInvoiceType(i.type)}</Tag>`.
- [x] Bảng hóa đơn tại `/students/$studentId` render tương ứng.
- [x] Mọi unit tests, contract tests, `pnpm check`, `pnpm check-types`, `pnpm test` đều pass.
