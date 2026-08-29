---
title: "student-row-detail-regression"
description: "Issue #111 — QC P1: hàng học viên trên /students không mở được trang chi tiết (production). RCA + e2e regression test."
status: completed
priority: P1
effort: "2h"
tags: [bugfix, e2e, students, issue-111]
created: 2026-08-29
issue: 111
route: bugfix
ship: beta
---

# student-row-detail-regression (issue #111)

## Overview

QC P1 trên production `https://app.teacheros.io.vn/students` (2026-08-27):
click vào hàng học viên không mở được trang chi tiết `/students/:id`, và
`/students/qc-fake-id` trả 404 thô.

## Root-cause analysis (điều tra, không đoán — đã verify bằng bằng chứng)

1. **Code điều hướng ĐÚNG trên develop.** `apps/web/src/routes/_auth/students/index.tsx`
   gắn `onClick → navigate({ to: "/students/$studentId" })` trên từng row từ
   commit đầu (029eec9); `DataTable` gắn handler + keyboard support đúng
   (`apps/web/src/components/ui/data-table.tsx:26-45`). Probe e2e chạy local
   trên develop: click hàng học viên mới tạo → điều hướng tới
   `/students/<uuid>` và render detail. PASS.
2. **Production đang chạy workbox service worker bị hỏng.** Verified live:
   `curl https://app.teacheros.io.vn/sw.js` trả về bundle workbox của
   `vite-plugin-pwa` (không phải stub tự-hủy). `origin/main` vẫn còn
   `VitePWA` trong `apps/web/vite.config.ts`. Fix #125 (commit ffe1857 —
   remove VitePWA + stub `sw.js` tự-hủy) đã merge vào develop 2026-08-28
   nhưng **main chưa được promote** (lần cuối 2026-08-27 19:29, #103).
   SW lỗi này đã được chứng minh gây stale shell + failed dynamic module
   fetches (issue #125): click hàng lazy-load chunk route `$studentId` →
   fetch chunk fail âm thầm → không điều hướng ⇒ đúng symptom "Không có link"
   mà QC thấy.
3. **Lỗ hổng thật trong repo:** không có e2e regression test nào bảo vệ hành
   vi row → detail (chính là lỗ hổng để bug lọt qua QC).

## Kết luận & phạm vi sửa

- Hành vi điều hướng trên develop đã đúng ⇒ **không đổi code điều hướng**.
- Sửa thật trong repo: thêm e2e regression test chặn hành vi row → detail
  và 404 thân thiện cho id lạ.
- Production chỉ hết bệnh khi promote develop → main (mang theo stub sw.js
  #125). Việc promote nằm ngoài phạm vi ship beta của pipeline này — ghi rõ
  trong issue #111 để owner thực hiện.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | e2e regression: click hàng học viên → điều hướng tới `/students/:id`, detail render đúng | P1 |
| 2 | e2e: `/students/<fake-id>` render card not-found thân thiện (không crash) | P1 |
| 3 | Issue #111 cập nhật RCA + hướng dẫn resolve production (promote main) | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: e2e regression student row → detail + fake-id 404](./phase-01-start.md) | Pending |

## Non-goals (scope boundary)

- Không sửa logic điều hướng / DataTable / useStudents (đã đúng).
- Không promote develop → main (ra quyết định riêng, sweep 26 commits khác).
- Không đụng issue #104 (0 buổi / 0đ — parked, plan riêng).

## Acceptance Criteria

- [ ] e2e spec mới pass trên develop: click row → URL `/students/<uuid>` và tên học viên hiện trong header detail.
- [ ] e2e: navigate thẳng `/students/e2e-fake-id` → card "Không tìm thấy học viên" + link về `/students`.
- [ ] `pnpm test` (unit + e2e) xanh toàn bộ.
- [ ] Issue #111 có comment RCA + acceptance criteria + ghi chú promote production.

## Success Criteria

- [ ] Plan validated + red-team pass.
- [ ] PR merge vào develop (beta), CI xanh.
- [ ] Production fix theo dõi riêng qua promote main.
