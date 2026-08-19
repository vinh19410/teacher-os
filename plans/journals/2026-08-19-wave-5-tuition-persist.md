---
title: Wave 5 Tuition Persist
date: 2026-08-19
summary: Hoàn tất invoice persistence server-authoritative và tích hợp an toàn với Wave 6 assignments.
---

# Wave 5 Tuition Persist

## Mục tiêu

Persist invoice vào Cloudflare D1 qua shared kernel để Tuition, Dashboard và student-detail cùng nhận dữ liệu; thao tác mark-paid sống qua hard reload.

## Quyết định

- D1 là nguồn sự thật; client ghi qua command bus rồi refetch snapshot từ server.
- Mark-paid định vị bằng `id + orgId`; unknown và cross-org cùng trả 404.
- Replay trên invoice đã paid tiếp tục overwrite `method` theo last-write-wins.
- Không thêm create route/command; AddInvoiceModal vẫn close-only.

## Tích hợp

Trong lúc triển khai, nhánh `develop` nhận Wave 6 assignments. Merge giữ cả hai miền: migration invoice chuyển thành `0004_gray_cloak.sql` sau assignment `0003_last_shatterstar.sql`; server snapshot, API contract và client reducer đều hydrate cả `assignments` lẫn `invoices`.

## Kiểm chứng

- 149/149 runtime tests pass.
- 5/5 typecheck/build gates pass; Biome và diff checks sạch.
- Code review tích hợp: **APPROVE**, không có Critical, Important hay Suggestion mở.

## Việc còn lại

Smoke trên stage Cloudflare D1 đã deploy: thực hiện write thật rồi hard reload Tuition, Dashboard debt, student-detail tuition và assignment grade. Đây là kiểm chứng vận hành không chặn landing.

Không phát hành social. AgentWiki publish skipped.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
