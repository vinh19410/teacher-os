---
phase: 1
title: "Invoice due/note mapping + types"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Invoice due/note mapping + types

## Overview

Đưa `due` (ISO yyyy-mm-dd) và `note` từ `KernelInvoiceRow` (wire) vào web `Invoice` type và `mapInvoices`, kèm unit test mapping — nền để Phase 2 render ngày đến hạn. Đóng nửa type/mapping của issue #135.

## Requirements

- Functional: mọi invoice load từ kernel snapshot mang đúng `due`/`note` gốc trong store web.
- Non-functional: field required (không optional) — ép mọi consumer thấy dữ liệu mới; không đổi shape wire.

## Architecture

`KernelInvoiceRow` (packages/api contracts, đã có `due`/`note`) → `mapInvoices` (apps/web/src/lib/repos/invoices.ts) → web `Invoice` (apps/web/src/lib/mock-data.ts) → `data.invoices` store. Một chiều, thuần mapping — không state, không side effect.

## Related Code Files

- Modify: `apps/web/src/lib/mock-data.ts` (interface `Invoice`: thêm `due: string`, `note: string` với docblock ISO như contract)
- Modify: `apps/web/src/lib/repos/invoices.ts` (`mapInvoices` map 2 field mới)
- Modify: `apps/web/src/lib/repos/invoices.test.ts` (test cases mới + cập nhật expected của test `toEqual` hiện có)
- Modify: `apps/web/test/fixtures/mock-data.ts` (3 invoice literal INV-081/INV-084/INV-086 thêm `due: ""`/`note: ""` — red-team đã xác nhận fixture này được `data-store-reducer.test.ts` import nên vỡ type dây chuyền nếu bỏ sót)

## Implementation Steps (TDD)

1. RED: thêm test vào `invoices.test.ts` — (a) snapshot với `due: "2026-09-15"`, `note: "Học phí tháng 9"` map sang `Invoice` giữ nguyên 2 field; (b) `due: ""`/`note: ""` (legacy row) map thành chuỗi rỗng, không crash; (c) cập nhật expected object của test "maps the student relation…" hiện có (dùng `toEqual`) thêm `due`/`note`. Chạy → fail (thiếu property).
2. GREEN: thêm `due`/`note` vào interface `Invoice` (kèm docblock "ISO yyyy-mm-dd từ API #60; dd/mm là display concern") và map trong `mapInvoices`.
3. Cập nhật fixture `apps/web/test/fixtures/mock-data.ts`: 3 invoice literal thêm `due: ""`, `note: ""`.
4. Chạy `pnpm turbo run check-types` toàn workspace — gate typecheck thật (`build` là `vite build` không typecheck; red-team finding #G).
5. Chạy biome check trên các file đã sửa.

## Todo

- [x] Test RED: case due/note mapping + legacy rỗng + cập nhật toEqual hiện có
- [x] GREEN: `Invoice` + `mapInvoices` mang due/note
- [x] Fixture mock-data.ts thêm due/note vào 3 literal
- [x] `check-types` + biome + vitest xanh

## Success Criteria

- [x] `mapInvoices` trả `due`/`note` đúng cho row thường và row legacy rỗng
- [x] Unit test mapping có case `due`/`note` (DOD #135)
- [x] `pnpm turbo run check-types` toàn workspace không lỗi mới

## Risk Assessment

Thêm field required vỡ type nơi khác → red-team đã quét lại toàn bộ consumer: ngoài `mapInvoices`, chỉ có fixture `apps/web/test/fixtures/mock-data.ts` (đã đưa vào scope) và spread trong reducer (an toàn). Nếu hiện thêm consumer mới sau phase 1, bổ sung literal tương tự — không hạ field xuống optional.
