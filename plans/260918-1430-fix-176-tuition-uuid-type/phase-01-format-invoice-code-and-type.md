# Phase 1: Format Invoice Code and Type

**Status:** Completed

## Context
- Issue: #176
- Files touched:
  - `apps/web/src/lib/tuition-from-kernel.ts`
  - `apps/web/src/lib/tuition-from-kernel.test.ts`
  - `apps/web/src/routes/_auth/tuition.tsx`
  - `apps/web/src/routes/_auth/students/$studentId.tsx`
  - `apps/web/src/lib/kernel-runtime.contract.test.ts`

## Tasks

### 1. Pure Helpers (`tuition-from-kernel.ts`)
- Export `DEFAULT_INVOICE_TYPE = "Học phí"`.
- Implement `formatInvoiceCode(id: string): string`:
  - Trả về `"—"` nếu `!id`.
  - Nếu `id` bắt đầu bằng `INV-` (case-insensitive): trả về `id.toUpperCase()`.
  - Loại bỏ gạch nối (`id.replace(/-/g, "")`), lấy tối đa 8 ký tự cuối, trả về `INV-${suffix.toUpperCase()}`.
- Implement `formatInvoiceType(type?: string | null): string`:
  - Trim chuỗi `type`.
  - Nếu rỗng, chỉ khoảng trắng, `"—"`, `"-"`, trả về `DEFAULT_INVOICE_TYPE` (`"Học phí"`).
  - Trả về `trimmed` nếu có giá trị hợp lệ khác.

### 2. UI Updates
- `apps/web/src/routes/_auth/tuition.tsx`:
  - Import `formatInvoiceCode`, `formatInvoiceType` từ `@/lib/tuition-from-kernel`.
  - Mã cell: `<span key="id" title={i.id} className="font-mono text-meta text-xs">{formatInvoiceCode(i.id)}</span>`.
  - Loại cell: `<span key="t" title={i.note || undefined}><Tag>{formatInvoiceType(i.type)}</Tag></span>`.
- `apps/web/src/routes/_auth/students/$studentId.tsx`:
  - Import `formatInvoiceCode`, `formatInvoiceType` từ `@/lib/tuition-from-kernel`.
  - Bảng tab tuition:
    - Mã cell: `<span key="id" title={inv.id} className="font-mono text-meta text-xs">{formatInvoiceCode(inv.id)}</span>`.
    - Loại cell: `<Tag key="type">{formatInvoiceType(inv.type)}</Tag>`.

### 3. Tests
- `apps/web/src/lib/tuition-from-kernel.test.ts`:
  - Test `formatInvoiceCode` với UUID 36 ký tự, mã `INV-0001`, `INV-084`, `inv-1`, mã ngắn, rỗng.
  - Test `formatInvoiceType` với `""`, `"   "`, `"—"`, `"-"`, `null`, `undefined`, `"Gói 12 buổi"`.
- `apps/web/src/lib/kernel-runtime.contract.test.ts`:
  - Test kiểm tra `tuition.tsx` sử dụng `formatInvoiceCode(i.id)` và `formatInvoiceType(i.type)`.

## Verification Commands
- `pnpm --filter web test src/lib/tuition-from-kernel.test.ts`
- `pnpm --filter web test src/lib/kernel-runtime.contract.test.ts`
- `pnpm test`
- `pnpm check`
- `pnpm check-types`
