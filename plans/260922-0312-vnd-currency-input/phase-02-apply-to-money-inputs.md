---
title: "Phase 2: Áp dụng CurrencyInput vào 5 vị trí input tiền"
status: todo
---

# Phase 2: Áp dụng CurrencyInput vào 5 vị trí input tiền

## Goal

Thay input tiền thô bằng `CurrencyInput` ở cả 5 vị trí, đổi parse submit sang `parseVndAmount`, giữ nguyên thông báo lỗi trừ những case mask làm thay đổi hành vi nhập (đã liệt kê rõ từng file).

## Context Links

- Phase 01: `./phase-01-start.md` (API `formatVndInput` / `parseVndAmount` / `CurrencyInput`)
- Code-standards: `docs/code-standards.md` (contract không đổi → chỉ frontend)

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/edit-class-fee-modal.tsx`
- Modify: `apps/web/src/components/modals/add-class-modal.tsx`
- Modify: `apps/web/src/components/modals/add-invoice-modal.tsx`
- Modify: `apps/web/src/components/modals/add-student-modal.tsx`
- Modify: `apps/web/src/routes/_auth/settings.tsx`
- Modify: `apps/web/src/routes/_auth/settings.test.tsx`

## Key Insights

- State các modal đã là **string** — giữ nguyên; chỉ đổi cách hiển thị (CurrencyInput tự format) và cách parse lúc submit.
- Init state không cần format sẵn (`String(current)`, `"400000"`) vì CurrencyInput hiển thị `formatVndInput(value)` trên mọi render.
- `parsePackageField` (add-student) chỉ còn dùng cho `total` (số buổi — không phải tiền, giữ nguyên `type="number"`); `price` phải qua `parseVndAmount` vì `Number("400,000") = NaN`.
- settings `defaultUnitPrice` là chuỗi hiển thị lưu thẳng DB (`packages/db/src/schema/settings.ts:9` default `"400.000đ"`, contract `z.string().min(1)` tại `contracts.ts:871,:901`) — **không đổi contract**; input mask hóa, save persist chuỗi đã format (`"400,000"`). Field này chỉ được tiêu thụ tại chính nó (grep `defaultUnitPrice` toàn repo: chỉ settings UI + kernel passthrough), nên đổi hiển thị không gây tác dụng phụ.

## Implementation Steps

### 1. `edit-class-fee-modal.tsx`

- Import `CurrencyInput`; xóa `AMOUNT_RE` (dòng 9).
- Submit (dòng 38-46):

```ts
const parsed = parseVndAmount(fee);
if (fee.trim() !== "" && (parsed === null || parsed < 1)) {
	setError("Học phí phải là số nguyên dương.");
	return;
}
const tuitionFee = fee.trim() === "" ? null : parsed;
```

- JSX (dòng 66-72): `<Input type="number" min={1} …>` → `<CurrencyInput value={fee} onChange={setFee} placeholder="Để trống để xóa học phí" />`.

### 2. `add-class-modal.tsx`

- Field **Học phí / học viên (VND)** (dòng 257-265) → `<CurrencyInput value={fee} onChange={setFee} placeholder="Không bắt buộc" />`; giữ "Tổng số buổi" nguyên trạng.
- Validate fee (dòng 127-133) → cùng pattern parse như edit-class-fee (bảo toàn message `"Học phí phải là số nguyên dương."` — e2e case `0` và 13-chữ-số vẫn dùng message này); xóa `AMOUNT_RE`; payload dòng 146: `tuitionFee: trimmedFee === "" ? null : parsed`.

### 3. `add-invoice-modal.tsx`

- Field **Số tiền (VND) \*** (dòng 153-160) → `<CurrencyInput value={amount} onChange={setAmount} placeholder="400,000" />` (đổi placeholder `400000` → `400,000`).
- Validate (dòng 75-81) — **giữ nguyên cả 2 message**:

```ts
const parsedAmount = parseVndAmount(amount);
const amountMessage =
	amount.trim() === ""
		? "Vui lòng nhập số tiền."
		: parsedAmount === null
			? "Số tiền phải là số nguyên dương, tối đa 12 chữ số."
			: undefined;
```

- Payload dòng 103: `amount: parsedAmount ?? 0` (0 không bao giờ gửi vì đã guard ở trên); xóa `AMOUNT_RE`.

### 4. `add-student-modal.tsx`

- Field **Đơn giá (VND)** (dòng 201-210) → `<CurrencyInput value={price} onChange={(next) => { setPrice(next); if (priceError) setPriceError(undefined); }} />`; giữ "Số buổi gói" nguyên trạng.
- Validate price (dòng 120, 126-134): `const parsedPrice = parseVndAmount(price);`

```ts
setPriceError(
	price.trim() === ""
		? "Đơn giá không được để trống."
		: parsedPrice === null
			? "Đơn giá phải là số nguyên, tối đa 12 chữ số."
			: undefined,
);
if (parsedPrice === null) return;
```

  (Nhánh `parsedPrice < 0` / message `"không được âm"` bỏ — mask không cho gõ dấu âm; guard số dương server-side vẫn là rào cuối.)
- Payload dòng 145, 170: `price: parsedPrice`. `parsePackageField` giữ lại cho `total` và cập nhật doc-comment (bớt nhắc price).

### 5. `settings.tsx` + `settings.test.tsx`

- Field **Đơn giá mặc định / buổi** (dòng 177-187):

```tsx
<CurrencyInput
	value={form.defaultUnitPrice}
	onChange={(next) => setForm((prev) => ({ ...prev, defaultUnitPrice: next }))}
/>
```

  (mặc định `"400.000đ"` trong DB hiển thị thành `400,000`; Lưu persist `"400,000"` — contract `min(1)` vẫn pass).
- `settings.test.tsx:40`: regex `/<input[^>]*400\.000đ[^>]*>/` → `/<input[^>]*400,000[^>]*>/` (ý nghĩa test giữ nguyên: input đơn giá enabled, không disabled).

## Todo

- [ ] 4 modal: thay JSX + parse như spec; không còn `<Input type="number">` nào ở field tiền; `AMOUNT_RE` xóa sạch (grep không còn)
- [ ] add-student: `parsePackageField` chỉ còn serve `total`
- [ ] settings: input mask; save vẫn POST `defaultUnitPrice` string
- [ ] `settings.test.tsx` update regex
- [ ] `pnpm --filter web test` exit 0; `pnpm --filter web check-types` exit 0

## Success Criteria

Gõ/dán ở cả 5 vị trí đều thấy phân cách ngay khi typing; submit gửi đúng integer; các thông báo lỗi còn tồn tại giữ nguyên text cũ (trừ message "không được âm" đã bỏ).

## Risk Assessment

- **Thay đổi hành vi nhập số âm**: trước đây `-500` → lỗi "không được âm"; giờ mask strip thành rỗng → lỗi "không được để trống"/"Vui lòng nhập số tiền". Đã đồng bộ trong plan + e2e (phase 03); server vẫn chặn giá trị âm là rào cuối.
- **User cũ lưu settings `"400.000đ"`**: mở settings sẽ thấy `400,000` và lưu đè nếu bấm Lưu — chấp nhận (field chỉ tiêu thụ tại chính nó).
