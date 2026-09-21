---
title: "Stack schedule cards below day header"
description: "Xếp card buổi dạy bên dưới nhãn thứ/ngày trên màn Lịch dạy thay vì ngang hàng (cả desktop lẫn mobile)"
status: pending
priority: P2
effort: 1h
issue: 200
branch: develop
tags: [bugfix, frontend]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Stack schedule cards below day header

## Overview

Trên màn hình **Lịch dạy** (`/schedule`), mỗi cột ngày hiện dùng `flex` ngang: nhãn thứ/ngày nằm bên trái và các card buổi dạy nằm bên phải trên **cùng hàng** — ở cả layout desktop (grid 7 cột) lẫn mobile (≤920px, 1 ngày/dòng). Người dùng yêu cầu card nằm **bên dưới** nhãn thứ/ngày/tháng.

Đây là thay đổi thuần presentation trong đúng 1 file (`schedule.tsx`): đổi hướng flex của cột ngày thành dọc và dọn các override `max-app:*` vốn mã hoá arrangement ngang trên mobile. Không thay đổi logic dữ liệu (`schedule-week.ts`, `week-grid.ts`), không đổi class hook `week-cal` / `day-col` / `lesson-block` mà e2e đang chọn.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Card buổi dạy nằm dưới nhãn thứ/ngày ở mọi độ rộng viewport | P1 |
| 2 | Giữ nguyên hành vi/tín hiệu today (ngày hiện tại nổi bật màu xanh) | P2 |
| 3 | Không phá e2e đang chọn `.lesson-block` theo class + text | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Stack day column layout](./phase-01-stack-day-column.md) | Pending |

## Success Criteria

- [ ] Tại viewport > 920px: mỗi cột ngày trong grid 7 cột có nhãn thứ/ngày ở dòng đầu, các card xếp dọc bên dưới.
- [ ] Tại viewport ≤ 920px: mỗi ngày là 1 khối dọc — nhãn thứ/ngày ở trên, card bên dưới, chiếm đủ bề ngang.
- [ ] Ngày hiện tại vẫn được nổi bật (chữ ngày/tháng màu `accent-blue`); các trạng thái card (completed mờ 60%, cancelled mờ 35%, block "Dự kiến" mờ 75%) giữ nguyên.
- [ ] Cột không có buổi học hiển thị `—` bên dưới nhãn, không vỡ layout.
- [ ] `pnpm --filter web check-types` và `pnpm --filter web test` pass; e2e liên quan schedule pass.

## Validation Log

### Verification Results (2026-09-18, tier: Light — 1 phase)
- Claims checked: 5 — day-col markup tại `schedule.tsx:176`, header `max-app:*` tại `:178-195`, container card tại `:196`, breakpoint `--breakpoint-app: 921px` (`packages/ui/src/styles/globals.css:219`), e2e selector `.lesson-block` (3 spec)
- Verified: 5 | Failed: 0 | Unverified: 0
- Format gate: `ak plan validate` → OK (exit 0)
- Ghi chú: mode fast, task layout 1-file không còn điểm quyết định mở → không cần phỏng vấn thêm.

<!-- slug: stack-schedule-cards-below-day-header -->
