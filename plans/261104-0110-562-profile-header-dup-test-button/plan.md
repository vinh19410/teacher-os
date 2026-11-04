---
title: "#562: Bỏ nút \"Làm Test Miễn Phí\" thừa ở header trang profile"
description: "Header apps/profile có hai điểm vào \"Làm Test Miễn Phí\" cùng trỏ kiem-tra-dau-vao/; giữ nút CTA vàng, bỏ link text trong nav-links."
status: pending
priority: P3
effort: 0.5h
issue: 562
branch: fix/562-profile-header-dup-test-button
tags: [frontend, profile]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Plan: #562 — Bỏ nút "Làm Test Miễn Phí" thừa ở header

## Outcome

Header trang chủ `apps/profile` chỉ còn **một** điểm vào "Làm Test Miễn Phí".

## Non-goals

- Không đổi CTA ở hero, floating CTA (dòng ~2942), các thẻ khóa học, trang `kiem-tra-dau-vao/`.
- Không đổi style `.nav-links` / `.nav-actions`.

## Phát hiện từ scout

Trong `apps/profile/public/index.html`, header có hai phần tử cùng href `kiem-tra-dau-vao/`:

1. `<li><a href="kiem-tra-dau-vao/">Làm Test Miễn Phí</a></li>` trong `.nav-links` (dòng ~1877), ẩn ở ≤768px.
2. `<a class="btn btn-gold btn-sm">📝 Làm Test Miễn Phí</a>` trong `.nav-actions` (dòng ~1884), luôn hiện.

## Quyết định

Giữ nút (2), bỏ mục (1): nút là CTA chính, hiện cả mobile; nếu bỏ nút thì mobile mất lối vào test ở header. Hai mục còn lại của `.nav-links` giữ nguyên các anchor trang. Nếu chủ dự án muốn giữ link text thay vì nút, đảo lại là đổi một dòng.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Xoá mục thừa trong nav-links](phase-01-remove-duplicate-nav-link.md) | pending |

## Acceptance criteria

- Header chỉ có một phần tử trỏ `kiem-tra-dau-vao/` với nhãn "Làm Test Miễn Phí" (nút vàng).
- `pnpm --filter profile test` và `pnpm exec biome check .` xanh.
- 3 viewport (1440×900, 768×1024, 375×812): header không vỡ, nút hiển thị, focus bàn phím thấy rõ.

## Phụ thuộc / lưu ý

- #560 cũng sửa `.nav-actions` ở cùng file; không chặn nhau, có thể cần rebase.
