# Phase 01 — Thêm grid gap-4 vào các form auth

## Context

Xem [plan.md](plan.md).

## Files to Modify

1. `apps/student/src/components/auth/sign-in-form.tsx`
2. `apps/student/src/components/auth/sign-up-form.tsx`
3. `apps/student/src/components/auth/forgot-password-form.tsx`
4. `apps/student/src/components/auth/reset-password-form.tsx`
5. `apps/web/src/components/sign-in-form.tsx`
6. `apps/web/src/components/sign-up-form.tsx`
7. `apps/web/src/components/auth/forgot-password-form.tsx`
8. `apps/web/src/components/auth/reset-password-form.tsx`
9. `apps/admin/src/components/auth/sign-in-form.tsx`
10. `apps/admin/src/components/auth/forgot-password-form.tsx`
11. `apps/admin/src/components/auth/reset-password-form.tsx`

Không sửa: `auth-field.tsx` (cả 3 app), `apps/admin/src/routes/register.tsx` (đã chuẩn).

## Tasks & Steps

### Task 1.1 — Thêm grid gap-4 cho 4 form auth trong apps/student
- Goal: Form sign-in, sign-up, forgot-password, reset-password ở student có row gap 16px giữa các field và nút submit.
- Target files:
  - `apps/student/src/components/auth/sign-in-form.tsx`
  - `apps/student/src/components/auth/sign-up-form.tsx`
  - `apps/student/src/components/auth/forgot-password-form.tsx`
  - `apps/student/src/components/auth/reset-password-form.tsx`
- Steps:
  1. Trong `sign-in-form.tsx` và `sign-up-form.tsx`, thêm `grid gap-4` vào trước chuỗi animation của thuộc tính `className` trên thẻ `<form>`.
  2. Trong `forgot-password-form.tsx` và `reset-password-form.tsx`, thêm `className="grid gap-4"` vào thẻ `<form>`.
  3. Trong `forgot-password-form.tsx`, bỏ `mt-[22px]` trên thẻ `<p>` quay lại đăng nhập để tránh cộng đôi khoảng cách với gap của grid.
- Success criteria: Thẻ `<form>` của cả 4 component đều chứa `grid gap-4`.
- Verify: `git grep "className=.*grid gap-4" apps/student/src/components/auth/` khớp 4 file trên (cùng với `otp-sign-in-form.tsx` đã có từ trước).

### Task 1.2 — Thêm grid gap-4 cho 4 form auth trong apps/web
- Goal: Form sign-in, sign-up, forgot-password, reset-password ở web có row gap 16px giữa các field và nút submit.
- Target files:
  - `apps/web/src/components/sign-in-form.tsx`
  - `apps/web/src/components/sign-up-form.tsx`
  - `apps/web/src/components/auth/forgot-password-form.tsx`
  - `apps/web/src/components/auth/reset-password-form.tsx`
- Steps:
  1. Trong `sign-in-form.tsx` và `sign-up-form.tsx`, thêm `grid gap-4` vào trước chuỗi animation của thuộc tính `className` trên thẻ `<form>`.
  2. Trong `auth/forgot-password-form.tsx` và `auth/reset-password-form.tsx`, thêm `className="grid gap-4"` vào thẻ `<form>`.
- Success criteria: Thẻ `<form>` của cả 4 component đều chứa `grid gap-4`.
- Verify: `git grep -E "className=.*grid gap-4" apps/web/src/components/sign-in-form.tsx apps/web/src/components/sign-up-form.tsx apps/web/src/components/auth/` trả về kết quả cho cả 4 file.

### Task 1.3 — Thêm grid gap-4 cho 3 form auth trong apps/admin
- Goal: Form sign-in, forgot-password, reset-password ở admin có row gap 16px giữa các field và nút submit.
- Target files:
  - `apps/admin/src/components/auth/sign-in-form.tsx`
  - `apps/admin/src/components/auth/forgot-password-form.tsx`
  - `apps/admin/src/components/auth/reset-password-form.tsx`
- Steps:
  1. Trong `sign-in-form.tsx`, thêm `grid gap-4` vào trước chuỗi animation của thuộc tính `className` trên thẻ `<form>`.
  2. Trong `forgot-password-form.tsx` và `reset-password-form.tsx`, thêm `className="grid gap-4"` vào thẻ `<form>`.
  3. Trong `forgot-password-form.tsx`, bỏ `mt-[22px]` trên thẻ `<p>` quay lại đăng nhập.
- Success criteria: Thẻ `<form>` của cả 3 component đều chứa `grid gap-4`.
- Verify: `git grep -E "className=.*grid gap-4" apps/admin/src/components/auth/` trả về kết quả cho cả 3 file.

### Task 1.4 — Format, Typecheck và Test
- Goal: Code sạch, tuân thủ Biome linter, typecheck và unit test vượt qua 100%.
- Steps:
  1. Chạy `pnpm check` để Biome chuẩn hóa thứ tự class.
  2. Chạy `pnpm check-types` để đảm bảo không có lỗi type.
  3. Chạy `pnpm test` cho toàn bộ workspace.
- Success criteria: Không có lỗi lint, type, hay test nào.
- Verify: `pnpm check && pnpm check-types && pnpm test` kết thúc với exit code 0.

### Task 1.5 — Verification hiển thị và Design Compare
- Goal: Xác minh trực quan không lỗi layout, tab switching ẩn đúng form khi có thuộc tính hidden, và design compare không có regression.
- Steps:
  1. Khởi động môi trường dev theo Cursor Cloud instructions.
  2. Mở `/login` trên student (`http://localhost:8003`), web (`http://localhost:8001`), admin (`http://localhost:8004`).
  3. Kiểm tra cơ học:
     - `getComputedStyle(document.querySelector("form:not([hidden])")).rowGap === "16px"`
     - Chuyển tab Đăng ký: `getComputedStyle(document.querySelector("#panel-signin")).display === "none"`
     - `getComputedStyle(document.querySelector("#panel-signup")).display === "grid"`
  4. Chạy `pnpm design:compare`.
- Success criteria: Mọi form hiển thị đều có rowGap 16px, form có `[hidden]` có computed display `none`, không có xung đột giao diện.
- Verify: Các assertion computed style trả về đúng giá trị; `pnpm design:compare` exit 0 (hoặc visual diff khớp mong đợi thêm gap).

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
