---
title: "Fix #120: Dashboard chào buổi sáng lúc tối"
status: completed
priority: P2
issue: 120
branch: fix/120-dashboard-greeting
tags: [web, dashboard, greeting, timezone, qc]
---

# Fix #120: Dashboard chào buổi sáng lúc tối

## Overview
Header trên `/dashboard` đang hardcode `title={'Chào buổi sáng, ${displayName}'}` mà không kiểm tra giờ trong ngày (`apps/web/src/routes/_auth/dashboard.tsx:48`).
Tại thời điểm QC (~20:39 ICT) hoặc buổi chiều/tối, người dùng vẫn thấy "Chào buổi sáng".

## Solution
1. Thêm pure helper `formatDashboardGreeting(name: string, now = new Date(), timeZone = "Asia/Ho_Chi_Minh"): string` trong `apps/web/src/lib/dashboard-from-kernel.ts`:
   - 05:00 – 11:59: "Chào buổi sáng, {name}"
   - 12:00 – 17:59: "Chào buổi chiều, {name}"
   - 18:00 – 04:59: "Chào buổi tối, {name}"
   Dùng `Intl.DateTimeFormat` với `timeZone: "Asia/Ho_Chi_Minh"` để xác định giờ Việt Nam nhất quán bất kể múi giờ máy client.
2. Cập nhật `apps/web/src/routes/_auth/dashboard.tsx` sử dụng helper `formatDashboardGreeting(displayName, now)`.
3. Viết unit tests trong `apps/web/src/lib/dashboard-from-kernel.test.ts` kiểm tra đầy đủ các mốc giờ biên (sáng, chiều, tối, nửa đêm) và timezone drift.
4. Chạy `pnpm check`, `pnpm check-types`, `pnpm --filter web test` và verify.
