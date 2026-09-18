---
title: "Fix #176: Hóa đơn — mã ngắn đọc được + nhãn Loại mặc định"
description: "Cột Mã render UUID đầy đủ, Loại trống thành '—' ở /tuition và student detail. Fix: helper invoiceCode (INV + 8 ký tự cuối) + invoiceType (nhãn 'Khác' khi trống) dùng chung 2 bảng."
status: in-progress
priority: P3
effort: 1h
issue: 176
branch: fix/176-invoice-code-type
tags: [frontend, bugfix, tuition]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #176: Hóa đơn — mã ngắn + Loại mặc định

## Overview

`/tuition` và student detail (tab Học phí) render `invoice.id` nguyên UUID ở cột Mã, và cột Loại để `type` trống → DataTable coerce thành "—". `invoiceCreateSchema` không nhận type (luôn "") nên mọi hóa đơn tạo từ form đều rỗng — cần nhãn mặc định trung thực. Expected chấp nhận "8 ký tự cuối của id".

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Mã hóa đơn: `INV-XXXXXXXX` (8 ký tự cuối, uppercase) ở cả 2 bảng — UUID gốc vẫn grep được từ tiền tố | P1 |
| 2 | Loại trống → "Khác" (không đoán ngữ nghĩa sai) | P1 |
| 3 | Helper dùng chung + unit tests | P1 |

## Non-Goals

- Không thêm sequence number trong DB (phình scope P3).
- Không đổi invoiceCreateSchema (thêm type là feature khác).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Helper + wire 2 bảng + tests](./phase-01-invoice-code.md) | Pending |

## Success Criteria

- [ ] Unit test invoiceCode/invoiceType
- [ ] vitest apps/web xanh; tsc sạch; biome repo-wide exit 0
- [ ] CI PR xanh → merge beta → đóng issue

## Red-Team Record (4 personas, 2026-09-18)

**Assumptions** — "Khác" trung thực hơn "Gói học viên" vì add-invoice thủ công (#61) không có type; 8 ký tự cuối đủ phân biệt ở quy mô pilot (va chạm 1/4.3e9). Không blocker.

**Failure** — (F1) helper pure + test. (F2) student detail dùng `inv.id` làm cell text → đổi invoiceCode không phá key. Không blocker.

**Scope** — 2 bảng + helper + test. Không scope creep.

**Security** — không lộ thêm gì (UUID đã public trong UI; rút gọn còn giảm bề mặt). Không blocker.

**Verdict: GO**.
