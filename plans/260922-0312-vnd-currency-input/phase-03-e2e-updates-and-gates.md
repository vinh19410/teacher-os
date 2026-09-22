---
title: "Phase 3: Cập nhật e2e + gates toàn diện"
status: todo
---

# Phase 3: Cập nhật e2e + gates toàn diện

## Goal

Cập nhật đúng các assertion e2e mà mask làm thay đổi (giá trị hiển thị của input, case nhập số âm), chạy full gates web + e2e cho mọi flow tiền.

## Context Links

- Phase 02: `./phase-02-apply-to-money-inputs.md`
- Specs bị ảnh hưởng (đã rà toàn bộ `apps/e2e/specs/*.spec.ts` theo label tiền): `class-tuition-fee.spec.ts`, `create-invoice.spec.ts`, `student-package-validation.spec.ts`; specs chỉ fill số dương (không cần sửa): `student-package-without-class.spec.ts:28`, `class-roster-tuition-debt.spec.ts:80`

## Files to Create / Modify

- Modify: `apps/e2e/specs/class-tuition-fee.spec.ts`
- Modify: `apps/e2e/specs/create-invoice.spec.ts`
- Modify: `apps/e2e/specs/student-package-validation.spec.ts`

## Key Insights

Playwright `fill()` bắn input event → mask chạy như gõ thật: `fill("5000000")` → input giữ `"5,000,000"`, `fill("-5000")` → input rỗng. Assertion **text hiển thị bên ngoài** (`"400.000đ"` — `fmtVND`) không đổi. Các case validation `0` và `1234567890123` **không cần sửa** vì mask không cap độ dài + message giữ nguyên (phase 01/02).

## Implementation Steps

### 1. `class-tuition-fee.spec.ts`

- Dòng 48-50: `toHaveValue("5000000")` → `toHaveValue("5,000,000")` (prefill trong modal Sửa giờ đã format).
- Case `fill("0")` (dòng 124, 163), `fill("1234567890123")` (dòng 136), `fill("9999999999999")` (dòng 174), `fill("")` (dòng 64): giữ nguyên — vẫn lỗi/hoạt động đúng như cũ.
- `fill("5000000")` / `fill("6000000")` / `fill("2000000")` (dòng 26, 52, 146): giữ nguyên — fill số thô vẫn parse đúng.

### 2. `create-invoice.spec.ts`

- Test `"amount âm"` (dòng 189-207): mask không cho nhập âm nữa → đổi tên thành case **ký tự không hợp lệ bị strip**, đổi body:

```ts
await dialog.getByLabel("Số tiền (VND) *").fill("-5000");
// mask strip dấu "-" → input rỗng → lỗi "bắt buộc" thay vì lỗi số âm
await expect(dialog.getByLabel("Số tiền (VND) *")).toHaveValue("");
const posts = await countInvoicePosts(page, async () => {
	await dialog.getByRole("button", { name: "Tạo hóa đơn", exact: true }).click();
	await expect(dialog.getByText("Vui lòng nhập số tiền.")).toBeVisible();
});
```

- Test amount trống (dòng 172-187) và happy path (dòng 120-170): giữ nguyên.

### 3. `student-package-validation.spec.ts`

- Case B (dòng 77-89): `fill("-500")` giờ cho `inputValue() === ""` và lỗi là `"không được để trống"`. Đổi assertion + comment: gõ dấu âm bị mask loại bỏ ở tầng UI, server-side min vẫn là rào cuối:

```ts
await dialog.getByLabel("Đơn giá (VND)").fill("-500");
await expect(await dialog.getByLabel("Đơn giá (VND)").inputValue()).toBe("");
// ... countPosts vẫn 0; fieldError assert "không được để trống"
```

- Case E (dòng 93-94): `fill("400000")` trên Đơn giá giữ nguyên (→ `"400,000"`, parse OK); `"10.5"` fill vào **Số buổi gói** (number input, không mask) giữ nguyên.

### 4. Gates toàn diện (thứ tự chạy)

```bash
pnpm check                                              # biome check --write
pnpm check-types                                        # turbo, cả workspace
pnpm --filter web test                                  # unit web (kèm format-currency mới)
pnpm --filter e2e e2e specs/create-invoice.spec.ts
pnpm --filter e2e e2e specs/student-package-validation.spec.ts
pnpm --filter e2e e2e specs/student-package-without-class.spec.ts
pnpm --filter e2e e2e specs/class-tuition-fee.spec.ts
pnpm --filter e2e e2e specs/class-roster-tuition-debt.spec.ts
```

## Todo

- [x] 3 spec files cập nhật đúng như trên, kèm comment giải thích thay đổi hành vi mask
- [x] `pnpm check` exit 0 (không diff sót)
- [x] `pnpm check-types` exit 0
- [x] `pnpm --filter web test` exit 0
- [x] 5 e2e specs trên exit 0
- [x] Whole-plan sweep: grep `type="number"` trong 4 modal → chỉ còn field không phải tiền; grep `AMOUNT_RE` → 0 kết quả

## Success Criteria

Mọi command trên exit 0; toàn bộ flow tiền (tạo lớp có phí, sửa/xóa phí, tạo hóa đơn, thêm học viên có gói, settings) chạy qua e2e xanh.

## Risk Assessment

- **E2E flake do timing re-render**: mask thêm 1 bước state update giữa fill và submit — nếu thấy flaky, thêm `await expect(...).toHaveValue(...)` sau fill (đã có sẵn trong các case bị sửa).
- **Ổ khóa còn sót**: sau gates, grep lại `AMOUNT_RE|type="number"` trong `components/modals/` + `routes/_auth/settings.tsx` để chắc không bỏ xót field tiền nào (grade-modal, lesson-edit-form… không thuộc phạm vi tiền).
