# Phase 1: Form Accessibility (aria-required, required, aria-invalid, aria-describedby, role alert)

## Objective

Nâng cấp `Field` và `AuthField` để tự động hóa hoàn toàn các thuộc tính trợ năng (accessibility):
- Nhận diện trường bắt buộc từ nhãn (`label.includes("*")`) hoặc prop `required`, truyền `required` và `aria-required="true"` cho thẻ điều khiển (input, select, textarea).
- Khi có lỗi (`error`), truyền `aria-invalid="true"` và `aria-describedby` trỏ tới ID của message lỗi; message lỗi có `role="alert"` và `aria-live="polite"`.
- Khi có chú thích trợ giúp (`help`), liên kết qua `aria-describedby`.
- Cập nhật `AuthField`, `SignInForm`, `SignUpForm` để hỗ trợ `required` và `role="alert"`.

## Changes

1. **`apps/web/src/components/ui/field.tsx`**:
   - Thêm `required?: boolean` vào props của `Field`.
   - Tính toán `isRequired = required ?? (typeof label === "string" && label.includes("*")) ?? Boolean(childProps.required || childProps["aria-required"])`.
   - Sinh ID duy nhất cho error: `${target}-error` và help: `${target}-help`.
   - Ghép `aria-describedby` từ `errorId`, `helpId` và `aria-describedby` ban đầu của child.
   - Khi `single === true`, clone child và merge:
     - `id: target`
     - `...(isRequired ? { required: true, "aria-required": true } : {})`
     - `...(error ? { "aria-invalid": true } : {})`
     - `...(describedBy ? { "aria-describedby": describedBy } : {})`
   - Render:
     - `{help && <span id={helpId} className="text-[11px] text-meta">{help}</span>}`
     - `{error && <span id={errorId} role="alert" aria-live="polite" className="text-[11px] text-danger">{error}</span>}`

2. **`apps/web/src/components/auth/auth-field.tsx`**:
   - Thêm `required?: boolean` vào `AuthFieldProps`.
   - Truyền `required={required}` và `aria-required={required ? true : undefined}` vào `<input>`.
   - Đặt `role="alert"` trên thẻ error message `<p>`.

3. **`apps/web/src/components/sign-in-form.tsx` & `apps/web/src/components/sign-up-form.tsx`**:
   - Truyền `required` vào `AuthField` cho các trường email, password, name.

4. **Unit test**:
   - Viết `apps/web/src/components/ui/field.test.tsx` kiểm tra:
     - Label có `*` thì input con có `required` và `aria-required="true"`.
     - Prop `required` rõ ràng thì input con có `required` và `aria-required="true"`.
     - Label không có `*` thì không có `required`.
     - Có `error` thì input có `aria-invalid="true"` và `aria-describedby`, error span có `role="alert"`.
     - Có `help` thì input có `aria-describedby` trỏ tới help span.
