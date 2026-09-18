---
phase: 1
title: "Extract signUpSchema + helper reset-field-errors + wire 2 form + tests"
status: completed
depends: []
files:
  - apps/web/src/lib/sign-up-schema.ts (new)
  - apps/web/src/lib/sign-up-schema.test.ts (new)
  - apps/web/src/components/auth/reset-field-errors.ts (new)
  - apps/web/src/components/auth/reset-field-errors.test.ts (new)
  - apps/web/src/components/sign-in-form.tsx
  - apps/web/src/components/sign-up-form.tsx
  - apps/web/src/components/sign-in-form.test.tsx (new)
  - apps/web/src/components/sign-up-form.test.tsx (new)
---

# Phase 1: Deadlock fix + tests

## TDD — viết test TRƯỚC

### 1. `apps/web/src/components/auth/reset-field-errors.test.ts` (node env, FormApi headless — regression chính của #165)

Dựng FormApi với schema thật + đếm onSubmit callback:

1. Submit invalid → `state.canSubmit === false`, field meta có lỗi, callback chưa chạy.
2. `setFieldValue` + `resetFieldErrors(form, name)` cho TỪNG field → `state.canSubmit === true`, field meta errors rỗng.
3. `form.handleSubmit()` → callback chạy đúng 1 lần.

Ngoài ra test hành vi per-field: edit/clear email, chưa đụng password → lỗi password còn nguyên (clear theo field, không xóa trắng form).

### 2. `apps/web/src/lib/sign-up-schema.test.ts`

Mirror của `sign-in-schema.test.ts`: name <2 ký tự / email sai / password <8 → đúng message; giá trị hợp lệ pass. Message giữ NGUYÊN VĂN hiện tại ("Name must be at least 2 characters", "Invalid email address", "Password must be at least 8 characters").

### 3. `sign-in-form.test.tsx` / `sign-up-form.test.tsx` (SSR static, convention renderToStaticMarkup)

Mocks: `@tanstack/react-router` (useSearch) + `@/lib/auth-client` (signIn/signUp/getSession — tránh env validation của `@teacher-os/env/web` khi import). Assert:

- Nút submit fresh mount **không chứa `disabled`** (regression "nút chết từ đầu").
- Form giữ `id` panel (`panel-signin` / `panel-signup`) + label nút đúng.

## Implementation

### `apps/web/src/lib/sign-up-schema.ts` (new)

```ts
import z from "zod";

export const NAME_MIN = "Name must be at least 2 characters";
export const EMAIL_INVALID = "Invalid email address";
export const PASSWORD_MIN = "Password must be at least 8 characters";

/** Sign-up validation — extracted verbatim from sign-up-form.tsx (#165)
 * so the schema is unit-testable and reusable; messages are frozen (they
 * are user-visible copy referenced by #142's required-first follow-up). */
export const signUpSchema = z.object({
	name: z.string().min(2, NAME_MIN),
	email: z.email(EMAIL_INVALID),
	password: z.string().min(8, PASSWORD_MIN),
});
```

### `apps/web/src/components/auth/reset-field-errors.ts` (new)

```ts
import type { FormApi } from "@tanstack/react-form";

/**
 * TanStack Form v1 keeps a per-cause errorMap entry until that exact cause
 * re-validates. These forms only validate onSubmit, so after one failed
 * submit the submit-cause errors linger after the user corrects the value,
 * `canSubmit` stays false forever, and handleSubmit() early-returns on it —
 * the #165 submit deadlock. Clearing the edited field's errorMap on every
 * change lets the next submit re-validate from a clean slate (clear-error-
 * on-edit); errors for untouched fields stay put.
 */
export function resetFieldErrors<TFormData>(
	form: FormApi<TFormData, never, never, never, never>,
	name: keyof TFormData & string,
) {
	form.setFieldMeta(name, {
		...form.getFieldMeta(name),
		errors: [],
		errorMap: {},
	});
}
```

(Generic `FormApi<..., never, ...>` cần khớp đúng signature v1.33 — nếu type không chấp nhận, dùng `FormApi<TFormData, any, any, any, any>` scoped trong helper với comment; tsc sẽ phán.)

### `sign-in-form.tsx` — mỗi `form.Field`

```tsx
onChange={(value) => {
	field.handleChange(value);
	resetFieldErrors(form, "email"); // theo tên field tương ứng
}}
```

### `sign-up-form.tsx`

- Bỏ inline zod validators → `validators: { onSubmit: signUpSchema }` (message giữ nguyên).
- Wire `resetFieldErrors` cho 3 field name/email/password như trên.

### KHÔNG đổi

- `SubmitButton disabled={!canSubmit || isSubmitting}` (giữ — giờ chính xác: disable khi có lỗi đang hiển thị, bật lại khi user sửa).
- `signInSchema`, authClient, AuthField, copy.

## Verification

```bash
cd apps/web
npx vitest run src/components/auth/reset-field-errors.test.ts src/lib/sign-up-schema.test.ts src/components/sign-in-form.test.tsx src/components/sign-up-form.test.tsx
npx vitest run        # toàn bộ apps/web
npx tsc --noEmit && npx biome check src
```

Manual smoke (dev server): `/login` → submit trống → thấy required errors → gõ dần → lỗi biến mất theo field → nút bật lại → submit OK.
