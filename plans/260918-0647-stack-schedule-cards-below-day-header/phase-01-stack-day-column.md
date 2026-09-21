---
phase: 1
title: "Stack day column layout"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Stack day column layout

## Context Links

- File duy nhất thay đổi: `apps/web/src/routes/_auth/schedule.tsx` (vùng render day column, dòng ~145–276)
- Breakpoint `app`: `--breakpoint-app: 921px` trong `packages/ui/src/styles/globals.css` (`max-app:` = viewport ≤ 920px)
- E2E phụ thuộc class hook: `div.lesson-block` / `button.lesson-block` trong `apps/e2e/specs/projected-sessions.spec.ts`, `schedule-session-modal.spec.ts`, `session-occurrence.spec.ts`
- Issue GitHub: sẽ được liên kết ở `plan.md` (frontmatter `issue`)

## Overview

Đổi arrangement của mỗi cột ngày trên `/schedule` từ ngang (header bên trái – card bên phải) sang dọc (header phía trên – card bên dưới), áp dụng thống nhất cho desktop lẫn mobile.

## Key Insights

- Nguyên nhân hiện trạng: `day-col` là `flex` (hướng ngang mặc định) với 2 con — block header và container card. Trên mobile, các override `max-app:*` (`min-w-16`, `border-l-3`, `text-left`, `gap-3`…) mã hoá variant "header trái + card phải" của cùng arrangement ngang đó.
- Fix đúng 1 điểm: `flex` → `flex flex-col`, sau đó toàn bộ override `max-app:*` trên `day-col` và header trở nên dư và phải dọn bỏ (nếu giữ lại sẽ tạo marker trái mồ côi không còn ý nghĩa).
- Tín hiệu "today" trên mobile vốn dựa vào `max-app:border-l-accent-blue` (marker trái) sẽ mất theo — giữ lại tín hiệu màu xanh trên chữ ngày/tháng (`text-accent-blue`) vốn đã tồn tại ở desktop; đây là tín hiệu đủ và nhất quán.
- Class `week-cal` / `day-col` / `lesson-block` là hook cho e2e — **không đổi tên**.
- Container grid giữ nguyên `max-app:grid-cols-1 max-app:gap-3` (mobile vẫn 1 ngày/dòng; chỉ nội bộ mỗi ngày là xếp dọc).
- Placeholder rỗng `—` và block "Dự kiến" nằm trong container card nên tự động nằm dưới header sau khi đổi hướng.

## Requirements

### Functional
- Nhãn thứ + ngày/tháng nằm trên cùng của mỗi cột ngày, các card buổi dạy xếp dọc bên dưới, ở mọi viewport.
- Card chiếm đủ bề ngang của cột ngày (mobile: full width của khối ngày).
- Thứ tự sort card theo giờ (`sort((a, b) => a.time.localeCompare(b.time))`) giữ nguyên.

### Non-functional
- Không đổi logic dữ liệu trong `lib/schedule-week.ts` / `lib/week-grid.ts`.
- Không thêm dependency, không thêm component mới.
- Giữ nguyên markup ngữ nghĩa (button cho session thật, div cho block dự kiến) và toàn bộ class hook.

## Related Code Files

| File | Action | Change |
|------|--------|--------|
| `apps/web/src/routes/_auth/schedule.tsx` | Modify | Đổi `day-col` sang `flex-col`; dọn `max-app:*` ngang; tinh chỉnh spacing header |

## Implementation Steps

1. Tại dòng ~176, đổi container cột ngày:
   ```jsx
   // Before
   <div key={dn} className="day-col flex max-app:items-stretch max-app:gap-3">
   // After
   <div key={dn} className="day-col flex flex-col">
   ```
2. Tại dòng ~178–184, dọn header — bỏ toàn bộ variant `max-app:*` (marker trái) và padding-top không còn cần, chỉ giữ `pb-1` tạo khoảng nghỉ trước card đầu:
   ```jsx
   // Before
   <div className={`pt-2 pb-3 text-center max-app:min-w-16 max-app:border-l-3 max-app:border-l-solid max-app:pt-0 max-app:pb-0 max-app:pl-3 max-app:text-left ${
     isToday ? "max-app:border-l-accent-blue" : "max-app:border-l-line-soft"
   }`}>
   // After
   <div className="pb-1 text-center">
   ```
   Giữ nguyên 2 dòng con bên trong (nhãn thứ `dn` + `formatDayMonth(dates[i])` với màu today là `text-accent-blue`).
3. Container card (dòng ~196) giữ `min-w-0 flex-1`; các card giữ `mt-2` như hiện tại (khoảng cách header → card đầu ≈ 12px: `pb-1` + `mt-2`).
4. Không đụng tới: legend cuối trang, week navigation, empty state, `ClassSessionModal`, logic `columns` / `projected` / `slotCount`.

## Todo

- [ ] Đổi `day-col` sang `flex flex-col` và dọn override `max-app:*` của arrangement ngang
- [ ] Tinh chỉnh padding header (`pb-1`) và xác nhận khoảng cách card đầu tiên
- [ ] Kiểm tra visually ở 2 viewport: > 920px (grid 7 cột) và ≤ 920px (list 1 cột)
- [ ] Chạy gate kiểm chứng (bên dưới) và e2e schedule

## Success Criteria

- [ ] Desktop > 920px: mỗi cột trong grid 7 cột có header ở dòng đầu, card xếp dọc bên dưới.
- [ ] Mobile ≤ 920px: mỗi ngày là khối dọc — header trên, card dưới full width; không còn marker trái mồ côi.
- [ ] Ngày hiện tại: ngày/tháng màu `accent-blue`; trạng thái completed/cancelled/projected render đúng như trước.
- [ ] Gate pass:
  ```bash
  pnpm --filter web check-types
  pnpm --filter web test
  ```
  E2E (chạy theo khả năng môi trường, tối thiểu khuyến nghị): 3 spec `projected-sessions`, `schedule-session-modal`, `session-occurrence` trong `apps/e2e` (`pnpm e2e`).

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Cột desktop hẹp (~1/7 width) làm header + card chật | Trung bình | Header vốn `text-center` 2 dòng nhỏ (11px) — đã hẹp sẵn; xác nhận visually ở width ~1280px |
| Mất marker today trên mobile làm user khó nhận biết ngày hiện tại | Thấp | Giữ màu `accent-blue` trên ngày/tháng (tín hiệu desktop hiện hành); nếu review muốn mạnh hơn, thêm gạch chân/điểm nhấn ở phase follow-up |
| E2e vỡ do thay đổi DOM | Thấp | Selector chỉ dựa trên class `lesson-block` + text, không phụ thuộc vị trí; chạy lại 3 spec liên quan |

## Security Considerations

Không có — thay đổi layout thuần UI, không đụng auth, dữ liệu, hay API.

## Next Steps

- Sau khi merge: xác nhận lại trên production build (`pnpm --filter web build`) ở 2 breakpoint.
