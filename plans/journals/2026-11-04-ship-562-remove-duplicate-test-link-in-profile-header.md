---
title: Ship 562 remove duplicate test link in profile header
date: 2026-11-04
summary: "Bỏ liên kết Làm Test Miễn Phí trùng lặp trong .nav-links của header trang profile (#562)"
---

# Ship 562 remove duplicate test link in profile header

# Ship 562 remove duplicate test link in profile header

## What happened
Hoàn tất điều tra nguyên nhân gốc, kiểm định kế hoạch Red-Team (RT-1..RT-5), triển khai TDD red→green, kiểm chứng trình duyệt thực tế 4 mốc viewport và review độc lập (`LocalCodeReviewer`: `0 Critical / 1 Important / 2 Minor — resolved 3/3`) cho issue #562:
- Xoá dòng `<li><a href="kiem-tra-dau-vao/">Làm Test Miễn Phí</a></li>` trùng lặp bên trong `<ul class="nav-links">` của `<header class="site-header">` tại `apps/profile/public/index.html`, giữ nguyên 3 mục điều hướng nội trang (`#bo-ho-so-pdf`, `#ho-so-giang-vien`, `#lo-trinh-khoa-hoc`) và nút CTA vàng `📝 Làm Test Miễn Phí` trong `.nav-actions`.
- Thêm regression test `site-header has a single kiem-tra-dau-vao entry point in .nav-actions (#562)` trong `apps/profile/tests/index.test.mjs` kiểm tra cân bằng các thẻ (`header`, `nav`, `ul`, `li`, `div`, `a`, `span`), ranh giới mở/đóng `.nav-actions`, chuẩn hoá đường dẫn `/kiem-tra-dau-vao` và bảo toàn đủ 8 CTA ngoài header.
- Kiểm chứng trên Chromium thật qua `createProfileServer` (`127.0.0.1:0`) ở cả 4 viewport (`1440×900`, `768×1024`, `375×812`, `320×812`): không tràn ngang, không xén/chồng lấn nút, điều hướng phím `Tab` kích hoạt `:focus-visible` (`outlineWidth: "3px"`).

## Decision
Giữ nút CTA vàng trong `.nav-actions` (hiển thị cả trên mobile `≤768px` khi `.nav-links` ẩn) và từ chối mở rộng sửa CSS trong `<style>` (RT-5) để tôn trọng Non-goals của issue #562 cũng như tránh xung đột merge với phiên song song #560.

## Next steps
Mở PR vào `develop` (`/ak-ship beta --advice`), thực thi `/ak-review-pr --fix --reply --advice`, chờ CI `develop` xanh, chạy cổng đánh giá hậu PR bắt buộc của Kongming và merge PR (`--ship`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
