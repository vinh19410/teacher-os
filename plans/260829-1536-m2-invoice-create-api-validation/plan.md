---
title: "M2: API tạo invoice + validation (amount/due/enrollment) — issue #60"
description: "POST /api/invoices: tạo invoice cho enrollment với amount, due, note; validation org-scoped; mở rộng schema invoice (due, note, enrollment_id) + migration; wire row mở rộng; test TDD."
status: pending
priority: P1
effort: "0.5d"
tags: [m2, invoice, api, server]
created: 2026-08-29
---

# M2: API tạo invoice + validation (amount/due/enrollment) — issue #60

## Overview

Bổ sung endpoint **`POST /api/invoices`** tạo invoice gắn với một enrollment đã tồn tại, với body `{ enrollmentId, amount, due, note }`. Validation sống ở contract (`packages/api/src/contracts.ts`, zod `.strict()`) và server (`apps/server/src/routes/kernel.ts`) — đúng pattern mark-paid đang hoạt động. Schema `invoice` hiện có được **tái dùng và mở rộng** (thêm cột `due`, `note`, `enrollment_id` qua migration drizzle), không tạo bảng mới.

## Scope boundary (issue #60)

- **Trong scope:** contract schema + route server + validation amount/due/enrollment + migration DB + mở rộng wire row + unit tests. Docblock `invoice.ts` cập nhật.
- **Ngoài scope:** wire AddInvoiceModal (#61), totals tuition (#62), E2E money loop (#63). Không đổi UI runtime web; duy nhất fixture type `apps/web/src/lib/repos/kernel.test.ts` được cập nhật (additive required fields làm vỡ `check-types` web). POST tạo mới **non-idempotent** (consistent `POST /syllabi`) — chống double-click là việc của modal ở #61.

## Quyết định thiết kế (đã chốt từ scout + issue)

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Định danh người nộp | Body nhận `enrollmentId`; server resolve enrollment (org-scoped) **và verify student của enrollment cùng org** → suy ra `studentId`, lưu cả hai cột | Issue #60 nói "invoice cho enrollment"; invoice vẫn giữ `studentId` notNull để không phá read path. Verify student cùng org tránh tạo row "invisible" trong snapshot (read path join student theo cùng org — snapshot.ts innerJoin) |
| Cột `enrollment_id` | `text notNull default ""`, không FK constraint | Nhất quán style cột text mặc định `""` của bảng; orphaned `enrollmentId` (nếu enrollment bị xóa) chấp nhận được vì validation nằm ở write-time |
| Định dạng `due` | ISO `yyyy-mm-dd`, regex ở contract + roundtrip-guard server (`parseStartDateStrict` pattern) | Đơn vị wire display dd/mm là việc của web (#61); ISO lưu DB sortable, không mơ hồ; kế thừa precedent `moveDate` (occurrenceEditSchema) |
| `amount` | `z.number().int().min(1)` | Invoice học phí 0đ vô nghĩa; khác `price` package (min 0) vì invoice là một khoản thu cụ thể |
| `note` | `z.string().trim().max(500).default("")` | Tùy chọn, giới hạn chống junk |
| Response | `{ id } satisfies CreatedResponse`, status 201 | Mirror `POST /syllabi` |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `POST /api/invoices` tạo invoice org-scoped từ enrollmentId, trả 201 `{id}` | P1 |
| 2 | Validation: amount nguyên dương, due là ngày thật ISO, enrollment phải tồn tại trong org | P1 |
| 3 | Schema `invoice` mở rộng `due`/`note`/`enrollment_id` + migration; read path (`KernelInvoiceRow`, `loadInvoices`) trả thêm 3 trường | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| [Phase 1](./phase-01-contract-schema.md) | Contract + DB migration + wire row | Pending |
| [Phase 2](./phase-02-route-tests.md) | Route POST /api/invoices + validation + tests | Pending |

## Success Criteria

- [ ] `POST /api/invoices` với body hợp lệ tạo row invoice mới: status `unpaid`, `studentId` suy từ enrollment, lưu `due`/`note`/`enrollmentId`; trả 201 `{ id }`.
- [ ] Body sai (amount ≤ 0, due sai regex/ngày không tồn tại, field lạ, thiếu field) → 400 `{error:"invalid body"}`.
- [ ] `enrollmentId` không tồn tại hoặc thuộc org khác → 404 `{error:"enrollment not found"}`.
- [ ] Không session → 401; Origin sai → 403; Content-Type sai → 415 (giữ nguyên guard hiện có).
- [ ] Snapshot/GET invoices trả thêm `due`, `note`, `enrollmentId` (additive, không phá consumer hiện có).
- [ ] Test cũ assert `POST /api/invoices` → 404 được thay bằng bộ test mới (happy path + validation + cross-org enrollment + cross-org student + auth guards + tạo 2 invoice cùng enrollment → 2 row riêng biệt).
- [ ] Web fixture `apps/web/src/lib/repos/kernel.test.ts` cập nhật 3 field mới; root `pnpm check` (biome) và `pnpm check-types` (toàn workspace) xanh.

## Risk Assessment

- **Migration SQLite cột mới** — additive, `default ""`, không rewrite bảng; rủi ro thấp. Signal rủi ro: `pnpm db:generate` sinh SQL ALTER hỏng → kiểm tra file migration trước khi commit; response pre-decided: sửa SQL tay theo style migration hiện có.
- **Test cũ đổi kỳ vọng** — assertion `POST /api/invoices → 404` (kernel.test.ts ~650-658) phải cập nhật cùng PR; nếu quên sẽ đỏ CI ngay (detect được, không âm thầm).
- **Giả định "reusing schema invoice" đủ dùng** — nếu DOD #61 (modal) cần thêm field (method/type/date khi tạo), đó là việc của issue #61 mở rộng contract, không phải #60.
