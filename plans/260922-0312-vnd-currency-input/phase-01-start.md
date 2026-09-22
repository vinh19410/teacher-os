---
title: "Phase 1: Nền tảng — util format tiền + component CurrencyInput"
status: todo
---

# Phase 1: Nền tảng — util format tiền + component CurrencyInput

## Goal

Tạo 1 util thuần và 1 input component dùng chung: gõ/dán số tiền nào cũng chuẩn hóa thành chữ số nhóm hàng nghìn bằng dấu phẩy (`1,000,000`), và parse ngược chuỗi hiển thị thành số nguyên VND cho payload.

## Context Links

- Bằng chứng khảo sát: 3 modal copy cùng regex `/^\d{1,12}$/` — `add-invoice-modal.tsx:12`, `add-class-modal.tsx:33`, `edit-class-fee-modal.tsx:9`
- Component `Input` hiện tại (forward thuần props): `apps/web/src/components/ui/field.tsx:93-99`
- Tiền lệ lọc ký tự khi gõ (`inputMode="numeric"` + `replace(/\D/g,"")`): `apps/web/src/components/class-detail/session-actions-modal.tsx:283`
- Display formatter (không đụng, chỉ tham chiếu naming): `apps/web/src/lib/mock-data.ts:241-243`

## Files to Create / Modify

- Create: `apps/web/src/lib/format-currency.ts`
- Create: `apps/web/src/lib/format-currency.test.ts`
- Create: `apps/web/src/components/ui/currency-input.tsx`

## Key Insights

- Contract tiền server-side là **số nguyên VND**: `invoiceCreateSchema.amount` `.int().min(1)` (`packages/api/src/contracts.ts:625`), `tuitionFee` `.int().min(1).nullish()` (`:74`) và update schema `.nullable()` (`:124-127`), `price` `.int().min(0)` (`:16,:30`). Mask phải giữ được rule này ở lớp parse.
- `parsePackageField` (`add-student-modal.tsx:18-22`) dùng `Number(raw)` → sẽ break với `"1,000,000"`; phase 02 thay bằng `parseVndAmount`.
- Vitest web chạy environment `node` (`apps/web/vitest.config.ts`) → test component theo pattern `renderToStaticMarkup` (như `settings.test.tsx`), không mô phỏng typing được; logic nặng đặt hết vào pure function để test phủ.

## Requirements

### `apps/web/src/lib/format-currency.ts`

```ts
const MAX_DIGITS = 12; // khớp contract .int() và regex /^\d{1,12}$/ hiện có

/** Chuỗi đang gõ/dán → chỉ chữ số, bỏ số 0 đầu thừa ("007" → "7"),
 * nhóm hàng nghìn bằng dấu phẩy. KHÔNG giới hạn độ dài — case >12 chữ số
 * để parse chặn ở submit nhằm giữ nguyên thông báo lỗi hiện có. */
export function formatVndInput(raw: string): string {
	const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Chuỗi hiển thị ("1,000,000" | "400.000đ" | "5000") → số nguyên VND.
 * null khi rỗng, không có chữ số, hoặc quá 12 chữ số. */
export function parseVndAmount(raw: string): number | null {
	const digits = raw.replace(/\D/g, "");
	if (digits === "" || digits.length > MAX_DIGITS) return null;
	return Number(digits);
}
```

### `apps/web/src/components/ui/currency-input.tsx`

```tsx
import type { InputHTMLAttributes } from "react";
import { formatVndInput } from "@/lib/format-currency";
import { Input } from "./field";

type CurrencyInputProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"type" | "inputMode" | "value" | "onChange"
> & {
	value: string;
	onChange: (next: string) => void;
};

/** Controlled input tiền: hiển thị & phát ra chuỗi đã format ("1,000,000").
 * Field (cloneElement) inject id/aria vào component này → phải forward hết
 * xuống <Input> qua props spread. */
export function CurrencyInput({ value, onChange, ...props }: CurrencyInputProps) {
	return (
		<Input
			{...props}
			type="text"
			inputMode="numeric"
			autoComplete="off"
			value={formatVndInput(value)}
			onChange={(e) => onChange(formatVndInput(e.target.value))}
		/>
	);
}
```

- `value` nhận chuỗi thô nào cũng được (`"5000000"`, `"400.000đ"`) — hiển thị luôn dạng chuẩn; parent state giữ chuỗi format do `onChange` phát ra.
- `type="text"` + `inputMode="numeric"`: `type="number"` không cho gõ/không hiển thị dấu phân cách; `inputMode` vẫn mở bàn phím số trên mobile.

## Implementation Steps

1. Tạo `format-currency.ts` đúng spec trên (comment tiếng Việt theo style repo).
2. Tạo `format-currency.test.ts` — ma trận case (xem Todo).
3. Tạo `currency-input.tsx`; test render tĩnh xác nhận `value="400,000"` + `inputmode="numeric"` khi truyền `value="400000"`.
4. Chạy unit test + check-types của web.

## Todo

- [x] formatVndInput: `"4"`→`"4"`, `"40"`→`"40"`, `"400"`→`"400"`, `"4000"`→`"4,000"`, `"400000"`→`"400,000"`, `"1000000"`→`"1,000,000"`
- [x] formatVndInput: dán `"1.000.000đ"`→`"1,000,000"`; `"-500"`→`""`; `"10.5"`→`"105"`; `""`→`""`; `"0"`→`"0"`; `"007"`→`"7"`; idempotent với `"1,000,000"`
- [x] parseVndAmount: `""`→null; `"abc"`→null; `"0"`→0; `"400,000"`→400000; `"400.000đ"`→400000; 13 chữ số→null; `"999999999999"`→999999999999
- [x] CurrencyInput render tĩnh: `value="400000"` → `<input value="400,000" type="text" inputmode="numeric">`; forward `id`/`placeholder`/`aria-*` từ props
- [x] `pnpm --filter web test format-currency` + `pnpm --filter web check-types` exit 0

## Success Criteria

Toàn bộ checkbox trên checked; util không phụ thuộc DOM/React (pure, dùng lại được).

## Risk Assessment

- **Caret nhảy về cuối khi sửa giữa chuỗi** (vd đặt con trỏ trước `,` rồi gõ): re-format toàn bộ value mỗi change. Chấp nhận KISS — pattern gõ chính là append từ cuối; caret preservation là follow-up nếu có yêu cầu.
- **`"10.5"` → `"105"`**: mask nuốt dấu chấm. Hợp lý với contract VND số nguyên; người dùng thấy ngay giá trị thay đổi trên input.
