---
phase: 3
title: "Landing và smoke check deploy"
status: completed
dependencies: []
---

# Phase 3: Landing và smoke check deploy

## Context

`apps/landing/public/index.html` chứa tên ở title, meta description, og, twitter, hero kicker, mockup `aria-label`, thẻ "beta" và FAQ. Hai workflow deploy dùng chính chuỗi này để xác nhận landing đã lên.

## Files được sửa (phải cùng một commit)

- `apps/landing/public/index.html`
- `.github/workflows/deploy.yml:137`
- `.github/workflows/deploy-staging.yml:231`

## Bước

1. Thay tên trong landing. Các câu dạng "Teacher OS is a teacher-first workspace…" chuyển thành câu có chủ ngữ là tên mới, giữ định vị và ngôn ngữ (landing đang viết tiếng Anh) hiện có.
2. Trong hai workflow, đổi `grep -q 'Teacher OS'` thành chuỗi mới. Chú ý quoting của bash: chuỗi có dấu và khoảng trắng, dùng ngoặc đơn như hiện tại.
3. Build landing, rồi `grep -c "Cô Mỹ Dạy Tiếng Anh" apps/landing/dist/index.html` phải lớn hơn 0 và `grep -c "Teacher OS" apps/landing/dist/index.html` bằng 0.
4. Chạy mô phỏng smoke check cục bộ: lệnh `grep -q` trong workflow chạy trên bản build phải trả exit code 0.

## Kiểm chứng

- `pnpm --filter landing test` xanh (nếu có test), `pnpm exec biome check .` xanh.
- Xem landing ở 1440×900, 768×1024, 375×812; tên mới trong hero/nav không tràn.
- Sau khi merge vào `develop`, workflow `deploy-staging` qua bước smoke check landing.

## Rủi ro và lui

Quên đồng bộ workflow thì deploy đỏ nhưng không ảnh hưởng người dùng đang chạy. Lui bằng revert commit.
