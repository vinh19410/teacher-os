---
title: "Fix #168: Sidebar truncate tên/email + badge PRO hardcode"
description: "Hiển thị badge gói theo data thật (ẩn khi không có); tên/email có title đầy đủ khi hover; tối ưu không gian hiển thị trong sidebar footer."
status: completed
priority: P2
effort: 30m
issue: 168
branch: vinh19410/issue-168-sidebar-pro-badge
tags: [bugfix, frontend, sidebar, ux]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #168: Sidebar truncate tên/email + badge PRO hardcode

## Overview

Theo Dogfood QA (issue #8, issue #168):
- Tên người dùng "QA Dogfood" bị cắt thành "QA Do…" và email cũng bị truncate do không gian ngang bị chiếm bởi badge `PRO` hardcode và thiếu tooltip title khi hover.
- Badge `PRO` đang hardcode tại `apps/web/src/components/layout/sidebar.tsx:328` cho mọi user mới, dù hệ thống chưa có gói dịch vụ trả phí / subscription trên user model.

Mục tiêu:
1. Badge gói hiển thị động theo data thật (`extractUserPlan(user)` kiểm tra an toàn `plan` và `tier`), ẩn hoàn toàn khi user không có gói (data rỗng/undefined).
2. Thêm thuộc tính `title` đầy đủ cho tên (`title={displayName}`) và email (`title={user.email}`) cũng như cập nhật tooltip trên link (`title={displayName ? `${displayName} (${user.email})` : "Hồ sơ cá nhân"}`) để hover luôn xem được thông tin đầy đủ.
3. Tối ưu hóa flex container (`flex-1 min-w-0`) trên `<Link>` và block thông tin người dùng để tận dụng trọn vẹn bề rộng khả dụng trong sidebar.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Ẩn badge PRO khi user không có data gói; chỉ hiển thị khi có plan/tier thật | P2 |
| 2 | Cung cấp đầy đủ tooltip `title` cho tên và email khi hover | P2 |
| 3 | Tối ưu flex layout để tên dài không bị co cụm quá mức | P2 |
| 4 | Có test kiểm chứng (unit/contract test) và toàn bộ CI pass | P2 |

## Key Decisions

- **Ẩn badge PRO theo data thật:** Do hệ thống hiện tại chưa có subscription/billing thật, `user` mặc định không có `plan`/`tier`. Khi không có data, badge không được render vào DOM. Khi có data (ví dụ `plan = "PRO"`), badge hiển thị với `shrink-0` để không bị bóp méo.
- **Tooltip hover:** Gắn `title={displayName}` lên thẻ tên và `title={user.email}` lên thẻ email, đồng thời gắn `title` tổng thể trên thẻ `Link` để bất kỳ vị trí hover nào trên user card cũng giúp người dùng đọc trọn vẹn tên và email.
- **Layout flex:** Thêm `flex-1` vào `Link to="/profile"` và container chứa text `min-w-0 flex-1 leading-[1.3]`.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Sidebar PRO Badge & Truncation](./phase-01-sidebar-pro-badge-and-truncation.md) | Completed |

## Success Criteria

- [x] Khi user không có plan/tier, không có badge PRO xuất hiện trong DOM sidebar.
- [x] Khi user có plan/tier, badge hiển thị đúng tên plan và có `data-testid="sidebar-user-plan"`.
- [x] Thẻ tên hiển thị có `title={displayName}`, thẻ email có `title={user.email}`.
- [x] `Link to="/profile"` có `flex-1 min-w-0` và `aria-label="Hồ sơ cá nhân"`.
- [x] Unit/contract test cho `Sidebar` và sidebar user profile pass.
- [x] `pnpm -F web test`, `pnpm check`, `pnpm check-types` pass 100%.

## Red Team Review

### Reviewers: Security Adversary, UX Specialist
- **Security Adversary**: Thay đổi thuần túy ở UI hiển thị thông tin người dùng đã có trong session. Không thêm API call, không lộ secrets.
- **UX Specialist**: Đảm bảo không phá vỡ invariant collapsed rail 64px (`sidebar-collapse.spec.ts`) và mobile drawer 280px. Badge version và navigation items không bị ảnh hưởng.
