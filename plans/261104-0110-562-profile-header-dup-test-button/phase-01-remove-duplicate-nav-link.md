# Phase 01 — Xoá mục thừa trong nav-links

## Context

Xem [plan.md](plan.md).

## Files

- Sửa: `apps/profile/public/index.html`
- Không sửa: `apps/profile/dist` (output build), plan/journal cũ.

## Steps

1. Xoá dòng `<li><a href="kiem-tra-dau-vao/">Làm Test Miễn Phí</a></li>` trong `<ul class="nav-links">`.
2. Giữ nguyên nút `📝 Làm Test Miễn Phí` trong `.nav-actions`.
3. Kiểm tra `apps/profile/tests/index.test.mjs` không assert mục nav vừa xoá (hiện grep không thấy); nếu có thì chỉnh theo hành vi mới.

## Validation

- `pnpm --filter profile test`
- `pnpm exec biome check .`
- Mở trang ở 3 viewport (1440×900, 768×1024, 375×812): header còn đúng 1 điểm vào test, không vỡ layout, focus bàn phím rõ.

## Risk / Rollback

- Rủi ro rất thấp: chỉ xoá một `<li>` tĩnh.
- Rollback: revert một commit.
