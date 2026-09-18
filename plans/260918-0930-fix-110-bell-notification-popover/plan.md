---
title: "Fix #110: Chuông thông báo: popover trống và cắt mép phải"
description: "Sửa badge đỏ chuông thông báo luôn hiện khi 0 notif, bổ sung empty state 'Chưa có thông báo nào' cho NotifPanel, và cố định vị trí popover trên mobile/responsive để không bị cắt mép phải."
status: completed
priority: P1
effort: "1-2h"
issue: 110
branch: fix/110-bell-notification-popover
tags: [web, ui, bugfix, topbar, notifications]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #110: Chuông thông báo: popover trống và cắt mép phải

## Overview

Issue #110 báo 3 vấn đề liên quan đến chuông thông báo trên topbar (tất cả các trang authenticated):
1. **Badge đỏ luôn hiện khi không có thông báo**: chấm đỏ unread hardcode trong `topbar.tsx:211`, render vô điều kiện ngay cả khi `data.notifs.length === 0` (tài khoản mới, workspace trống).
2. **Panel trống không có empty state**: khi `notifs.length === 0`, `NotifPanel` chỉ render thẻ tiêu đề "Thông báo" và khoảng trắng rỗng, không có empty copy giải thích trạng thái.
3. **Popover bị cắt mép phải trên màn hình nhỏ/mobile**: `NotifPanel` dùng `absolute top-full right-0 w-[360px] max-app:w-[calc(100vw-32px)]`. Khi search bar bị ẩn trên mobile (`max-app:hidden`), container chuông thiếu `max-app:ml-auto` và panel định vị tương đối có thể tràn/cắt mép.

## Root Cause Analysis

- **Chấm đỏ unread**: `topbar.tsx:211` render `<span className="absolute top-[7px] right-2 h-2 w-2 rounded-full border-[1.5px] border-bg border-solid bg-danger" />` không bọc điều kiện `data.notifs.length > 0`.
- **Empty state**: `notif-panel.tsx:15` chỉ map qua `notifs.map(...)`. Khi mảng rỗng, không có nhánh `notifs.length === 0` hiển thị empty state.
- **Layout mobile**:
  - `bellWrapRef` trong `topbar.tsx:193` thiếu `max-app:ml-auto` để luôn neo về phía phải khi `topbar-search` bị ẩn (`max-app:hidden`).
  - `NotifPanel` trên màn hình nhỏ (`max-app:`) cần được neo chắc chắn với `max-app:fixed max-app:top-14 max-app:right-4 max-app:left-4 max-app:w-auto` để luôn cách đều 2 cạnh màn hình 16px, loại bỏ hoàn toàn khả năng cắt mép hay tràn ngang.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chỉ hiện badge đỏ unread khi `data.notifs.length > 0`; ẩn badge khi không có thông báo | P1 |
| 2 | Hiển thị empty state rõ ràng ("Chưa có thông báo nào") khi danh sách thông báo rỗng | P1 |
| 3 | Neo popover an toàn trên mobile/desktop không bị cắt mép, đảm bảo bell icon ở cạnh phải header | P1 |
| 4 | Giữ nguyên contract test hiện có trong `kernel-runtime.contract.test.ts` | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Sửa topbar unread badge, NotifPanel empty state & responsive layout](./phase-01-fix-notification-popover.md) | Completed |
