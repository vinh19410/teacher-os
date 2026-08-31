---
title: "Phase 2: Client per-field validation and e2e"
status: completed
priority: P1
effort: "2h"
dependencies: ["phase-01"]
---

# Phase 2: Client per-field validation and e2e

## Overview

Sửa `add-student-modal.tsx`: parse Số buổi/Đơn giá bằng `Number()` + `Number.isInteger` (KHÔNG dùng `Number.parseInt` — nó truncate thập phân, tái tạo đúng lỗi "ép kiểu im lặng" của #115), chặn min theo field (`total ≥ 1`, `price ≥ 0`), bỏ hẳn `|| 10` / `|| 400000`, hiển thị lỗi dưới từng field. E2E spec viết TRƯỚC (đỏ), rồi fix modal (xanh).

<!-- Updated: Red Team Session 1 - Number() replaces parseInt (decimal truncation flaw); label-scoped e2e locators instead of getByRole(alert); countInvoicePosts-style scoped request counter; mandatory enroll-mode case; payload-literal adjacency constraint; error clear on change/switchMode; removed evaluate fallback -->

## Requirements

- Functional:
  - Submit với `total` rỗng / không phải số nguyên (`"10.5"` phải BÁO LỖI, không truncate thành 10) / `< 1` → lỗi dưới field "Số buổi gói", KHÔNG gửi request
  - Submit với `price` rỗng / không nguyên / `< 0` → lỗi dưới field "Đơn giá (VND)", KHÔNG gửi request. **Rỗng là lỗi** cho cả 2 field (`Number("") === 0` phải bị chặn tường minh ở price, không được lọt thành 0đ)
  - `price = 0` hợp lệ; `total = 1` hợp lệ
  - Áp cho CẢ HAI mode: "Tạo học viên mới" (add-student) và "Học viên có sẵn" (enroll-student) — hàm validate gọi ở ĐẦU `submit()` trước khi rẽ nhánh; e2e enroll-mode case là BẮT BUỘC (xem step 1 Case D)
  - Payload gửi đi dùng giá trị đã parse; không còn fallback im lặng nào
- Non-functional: message tiếng Việt theo field, phân biệt được theo text ("phải từ 1 trở lên" cho total, "không được âm"/"không để trống" cho price) để e2e assert per-field không nhầm banner; KHÔNG claim aria — `Field` error span (`field.tsx:48`) hiện chưa có role/aria, out of scope PR này (ghi follow-up).

## Architecture

Giữ nguyên luồng `useKernelFormSubmit` — validation là tiền điều kiện trước khi gọi `run()`. State mới: `totalError`, `priceError`; reset trong `resetFields()` VÀ clear trong `onChange` của 2 input VÀ trong `switchMode()` (packageFields shared 2 mode — lỗi stale không được trôi qua tab kia). Thêm `noValidate` vào `<form>`.

**Constraint source-format:** `add-student-enroll.contract.test.ts` (`payloadObject()` brace-match từ `indexOf('type: "add-student"')`) và `kernel-runtime.contract.test.ts` (regex `async function submit`, `const result = await run(`, `onClose={saving ? …}`) parse SOURCE TEXT của modal. Giữ `type: "add-student"` / `"enroll-student"` kề object literal `payload: { … }` trong `submit()` — không hoist payload construction ra helper tách rời; nếu buộc phải refactor format thì cập nhật 2 contract test đó trong cùng PR.

**Parse prescription (khác #105 có chủ đích):** `const n = Number(raw.trim())` rồi `Number.isInteger(n) && n >= threshold`. `Number("10.5") = 10.5` → `isInteger` false → lỗi (đúng nghĩa chặn); `Number.parseInt("10.5") = 10` là lỗ hổng. Comment trong code ghi rõ vì sao khác add-class-modal (#105) — follow-up riêng cho add-class.

## Related Code Files

- Modify: `apps/web/src/components/modals/add-student-modal.tsx`
- Create: `apps/e2e/specs/student-package-validation.spec.ts` (self-contained: inline setup signup + tạo class như `enroll-existing-student.spec.ts`, KHÔNG extract helper vào `helpers.ts` — giữ diff gate sạch)
- Reference (không dùng cơ chế của create-class-validation để đếm request — nó chỉ assert DOM): `apps/e2e/specs/create-invoice.spec.ts:99-119` (`countInvoicePosts` — tiền lệ duy nhất về request counter, scope chặt method + URL)

## Implementation Steps

1. Viết e2e `student-package-validation.spec.ts`:
   - Case A (create, total=0): signup → /students → mở modal → fill tên hợp lệ → clear "Số buổi gói" fill "0" → click Lưu → assert text lỗi total xuất hiện scoped theo field (label-scoped: field container của "Số buổi gói" chứa text lỗi — KHÔNG dùng `getByRole("alert")`, nó chỉ match banner server `<p role="alert">` ở dòng 282) → assert KHÔNG có POST (`counter` mirror `countInvoicePosts`: chỉ đếm `method === "POST" && url.includes("/api/students")` — URL THẬT client gọi là `/api/students` (`repos/kernel.ts:39`), KHÔNG phải `/api/kernel/students`; register NGAY TRƯỚC click Lưu, unregister ngay sau — không đếm global vì signup POST auth)
   - Case B (create, price=-500): fill price "-500" bằng `fill()` (Playwright điền được số âm vào `type="number"`); assert `inputValue()` là "-500" TRƯỚC khi submit (chống state-stale false-green); assert lỗi field price + không POST. Nếu `fill("-500")` fail → đó là signal điều tra, KHÔNG dùng evaluate set value (controlled React input không nhận DOM-assignment → state stale → xanh giả)
   - Case C (create, hợp lệ): sửa total=1, price=400000 → lỗi biến mất → Lưu → modal đóng, row mới xuất hiện; VÀ counter cùng kỹ thuật phải đếm được ĐÚNG 1 POST `/api/students` (bằng chứng khẳng định counter hoạt động — không tin assertion phủ định ở Case A/B/D nếu counter chưa từng bắt được request nào)
   - Case D (enroll mode, BẮT BUỘC): tạo class (setup như enroll-existing-student.spec.ts) → class detail → mở modal "Thêm học viên" → mode "Học viên có sẵn" (tạo 1 student trước đó hoặc dùng student từ setup) → clear "Số buổi gói" fill "0" → Lưu → assert lỗi field total hiển thị + counter `/api/classes/…/enroll` không tăng
   - Case E (decimal): total "10.5" → assert lỗi (chặn truncate)
2. Chạy `pnpm --filter e2e e2e` (yêu cầu port 8000/8001 free — tắt dev server trước; playwright config `reuseExistingServer: false`) → spec ĐỎ (hiện tại 0 buổi bị ép thành 10 / price âm rơi xuống banner).
3. Sửa `add-student-modal.tsx`:
   - Thêm `totalError`/`priceError` state + hàm `parsePackageField(raw, min, messages)` dùng chung trả `{ value | error }` (Number + isInteger + empty check)
   - Gọi validate ở ĐẦU `submit()` trước nhánh existing/create; nếu lỗi → set error state, return (không gọi `run`)
   - Payload 2 nhánh dùng giá trị đã parse; xóa `|| 10` / `|| 400000`
   - Gắn `error={totalError}` / `error={priceError}` vào 2 `<Field>` trong `packageFields`; clear error trong `onChange` tương ứng; clear cả 2 trong `switchMode()`
   - Thêm `noValidate` vào `<form>`
4. Chạy e2e lại → XANH. Chạy lại `enroll-existing-student.spec.ts` + `student-package-without-class.spec.ts` (regression packageFields shared).

## Success Criteria

- [ ] E2E 5 case (A-E) ĐỎ trước / XANH sau, trong đó Case D enroll-mode là bắt buộc — không được thay bằng "reasoning"
- [ ] grep `add-student-modal.tsx` không còn `|| 10` hay `|| 400000`; không có `Number.parseInt` trong submit path của package fields
- [ ] "10.5" bị chặn với lỗi field (không truncate thành 10)
- [ ] Lỗi clear khi sửa input và khi switchMode; không stale error qua 2 mode (Case C assert)
- [ ] 2 contract test source-parse (`add-student-enroll.contract.test.ts`, `kernel-runtime.contract.test.ts`) xanh — nếu format source đổi, cập nhật trong cùng PR

## Risk Assessment

- Rủi ro: sửa `packageFields` (shared JSX) làm vỡ layout mode enroll → chạy lại 2 spec enroll/package ở bước 4.
- Rủi ro: e2e local không chạy được vì port bận → KHÔNG tick "đỏ trước/xanh sau" — ghi external blocker riêng và giữ criterion mở; không được "để CI bắt" rồi vẫn claim TDD evidence.
- `type="number"` + `fill("-500")`: nếu Chromium từ chối → điều tra root cause; cấm workaround evaluate (state stale → xanh giả).
