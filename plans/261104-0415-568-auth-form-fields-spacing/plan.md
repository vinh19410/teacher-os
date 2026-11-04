---
title: "#568: Form auth bị dính sát các field (thiếu gap giữa field)"
description: "Các thẻ <form> auth dùng AuthField không có grid gap nên Email/Mật khẩu/nút Đăng nhập dính nhau; thêm grid gap-4 vào 11 form ở student, web, admin."
status: pending
priority: P2
effort: 1h
issue: 568
branch: fix/568-auth-form-fields-spacing
tags: [frontend, auth, student, web, admin]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Plan: #568 — Form auth bị dính sát các field

## Outcome

Trong mọi form auth dùng `AuthField`, các field và nút submit cách nhau 16px, giống `apps/admin/src/routes/register.tsx`. Ảnh gốc: `/login` của `apps/student` (Email, Mật khẩu, nút Đăng nhập liền nhau).

## Non-goals

- Không đổi `AuthField`, `SubmitButton`, `AuthSplitLayout`.
- Không đổi token spacing hay thêm component form mới.
- Không sửa `apps/admin/src/routes/register.tsx` (đã có `grid gap-4`).

## Nguyên nhân (đã xác minh)

Commit `c308b434` (#378) đổi `AuthField` từ wrapper `mb-[14px]` sang `grid gap-2` (gap nội bộ label–input–error). Khoảng cách giữa các field mất theo, và không thẻ `<form>` nào được bù `grid gap-*`. Dấu hiệu: `register.tsx` có `className="grid gap-4"` nên đúng, 11 form còn lại thì sai.

## Danh sách form cần sửa

| App | File |
|---|---|
| student | `src/components/auth/{sign-in,sign-up,forgot-password,reset-password}-form.tsx` |
| web | `src/components/{sign-in,sign-up}-form.tsx`, `src/components/auth/{forgot-password,reset-password}-form.tsx` |
| admin | `src/components/auth/{sign-in,forgot-password,reset-password}-form.tsx` |

## Quyết định

Thêm `grid gap-4` trực tiếp vào `className` thẻ `<form>` (KISS, khớp precedent `register.tsx`). Không tách helper chung: mỗi form đã tự giữ chuỗi className animation riêng, thêm 2 token không đáng một abstraction.

Rủi ro đã biết: form có thuộc tính `hidden` (sign-in/sign-up có tab). `grid` đặt `display` nên phải xác nhận preflight Tailwind vẫn ẩn được form khi `hidden` (xem phase, bước kiểm tra tab).

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Thêm grid gap-4 vào các form auth](phase-01-add-form-gap.md) | pending |

## Acceptance criteria

- Ở cả ba app, mọi form liệt kê ở trên có khoảng cách 16px giữa các field và nút (đo bằng `getComputedStyle(form).rowGap === "16px"`).
- Tab Đăng nhập/Đăng ký ở student và web vẫn ẩn đúng form không active.
- `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` xanh.
- Ba viewport (1440×900, 768×1024, 375×812) + focus bàn phím theo `REVIEW.md`; PR kèm screenshot và chạy `pnpm design:compare`.

## Phụ thuộc / lưu ý

- Không phụ thuộc issue khác.

## Validation Log

### Verification Results
- Claims checked: 11 files và các vị trí thẻ `<form>`
- Verified: 11 | Failed: 0 | Unverified: 0
- Tier: Light (1 phase)
- Codebase facts:
  - `apps/admin/src/routes/register.tsx:83`: `<form className="grid gap-4">` là precedent chuẩn.
  - `apps/student/src/components/auth/otp-sign-in-form.tsx:195`: cũng đã dùng `grid gap-4`.
  - Cả 11 form auth còn lại đều thiếu layout gap trên thẻ `<form>`.

## Red Team Review

### Persona Analysis
1. **Security Adversary:**
   - *Finding:* Việc thêm class `grid gap-4` chỉ thay đổi styling CSS, không ảnh hưởng đến submit event handler, token CSRF, payload password hay validation schema.
   - *Verdict:* Safe.
2. **Assumption Destroyer / Failure Mode:**
   - *Finding:* Tab Đăng nhập / Đăng ký ở student và web dùng thuộc tính HTML `hidden={hidden}` trên `<form>`. Nếu Tailwind class `grid` ghi đè `display: none` của UA stylesheet, tab bị ẩn có thể bị hiện đè lên tab đang active.
   - *Evidence & Mitigation:* Tailwind CSS v4 preflight định nghĩa `[hidden]:where(:not([hidden="until-found"])) { display: none !important; }`. Đã kiểm chứng `otp-sign-in-form.tsx` đã dùng `grid` kết hợp animate-in mà không bị xung đột. Task 1.5 bao gồm test thực tế trên trình duyệt để đảm bảo form ẩn vẫn có `display: none`.
   - *Verdict:* Accept with mitigation verified.
3. **Scope Critic:**
   - *Finding:* Khối `<p>` quay lại đăng nhập trong forgot-password-form ở student và admin có `mt-[22px]`. Khi thẻ form có `grid gap-4` (16px), margin này sẽ cộng dồn thành 38px.
   - *Resolution:* Loại bỏ `mt-[22px]` để thống nhất gap 16px như các form khác.
   - *Verdict:* Accept.

### Whole-Plan Consistency Sweep
- Danh sách 11 file khớp 100% giữa issue #568, plan.md và phase-01-add-form-gap.md.
- Các câu lệnh kiểm tra và pass condition đều cơ học và nhất quán.
- Không còn mâu thuẫn hay quyết định chưa được giải quyết.
