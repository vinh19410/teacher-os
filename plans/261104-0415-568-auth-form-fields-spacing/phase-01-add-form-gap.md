# Phase 01 — Thêm grid gap-4 vào các form auth

## Context

Xem [plan.md](plan.md).

## Files

- Sửa: 11 file form ở bảng trong `plan.md`.
- Không sửa: `auth-field.tsx` (3 bản), `register.tsx`.

## Steps

1. Mỗi file, tìm thẻ `<form …>` và thêm `grid gap-4` vào `className`.
   - Form đã có `className` (sign-in/sign-up của cả 3 app, trừ admin sign-up không tồn tại): đặt `grid gap-4` đứng đầu chuỗi hiện có.
   - Form chưa có `className` (forgot/reset): thêm `className="grid gap-4"`.
2. Nếu form có khối `<p className="mt-[22px] …">` hoặc wrapper khác nằm trong `<form>` (vd `forgot-password-form.tsx` dòng ~112), kiểm tra không bị cộng đôi khoảng cách; bỏ margin thừa nếu thấy.
3. Chạy `pnpm check` hoặc `pnpm exec biome check .` để thứ tự class đúng chuẩn biome.

## Validation

- `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter student test`, `pnpm --filter web test`, `pnpm --filter admin test`.
- Chạy dev stack (xem AGENTS.md "Cursor Cloud"), mở `http://localhost:8003/login` (student), `http://localhost:8001/login` (web), admin ở 8004:
  - đo `getComputedStyle(document.querySelector("form")).rowGap` = `16px`;
  - bấm chuyển tab Đăng nhập ↔ Đăng ký: form không active phải `display: none`;
  - kiểm tra thêm `/forgot-password`, `/reset-password?token=x`.
- E2E liên quan chạy cổng 8100/8101/8103 (`pnpm --filter e2e e2e` cho spec auth) để chắc selector `#signin-email`, `#signin-password` không đổi.
- Screenshot 3 viewport + `pnpm design:compare`; dừng mọi process dev đã mở khi xong.

## Risk / Rollback

- Rủi ro thấp: chỉ đổi class layout. Điểm cần canh duy nhất là `hidden` + `grid` (bước kiểm tra tab). Nếu preflight không ẩn được, bọc nội dung form bằng `<div className="grid gap-4">` thay vì đặt trên `<form hidden>`.
- Rollback: revert một commit.
