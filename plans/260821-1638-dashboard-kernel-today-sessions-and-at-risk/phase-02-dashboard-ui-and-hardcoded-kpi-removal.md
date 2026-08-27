---
phase: 2
title: "Dashboard UI and hardcoded KPI removal"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Dashboard UI and hardcoded KPI removal

## Overview

Rewire `/_auth/dashboard` sang selectors phase 1. Bỏ KPI/list hardcode. Greeting từ session. Lead từ ngày local + count buổi hôm nay. Giữ check-in kernel.

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 1 helpers: `apps/web/src/lib/dashboard-from-kernel.ts`
- Current UI: `apps/web/src/routes/_auth/dashboard.tsx`
- Check-in lock: `apps/web/src/lib/kernel-runtime.contract.test.ts:160-164`
- Session: `apps/web/src/components/layout/sidebar.tsx:188-204`

## Requirements

- Functional: Lịch hôm nay = `lessonsToday(data.lessons, now)`; card vẫn resolve student qua `studentById(l.sid)`; skip row nếu student missing.
- Functional: Học viên rủi ro = `atRiskRows`; badge "Vắng" / "Miss check-in"; cột Còn = `pkg.remaining`; **không** cột Nợ / `fmtK` / invoices (M2). Empty = paragraph, không DataTable headers trơ.
- Functional: PageHead title `Chào buổi sáng, {displayName}` (`user.name || "Giáo viên"` giống sidebar). Lead: weekday+date local vi-VN + `Hôm nay có N buổi học` (N có thể 0).
- Functional: empty copy giữ "Không có buổi học nào hôm nay."; empty rủi ro tương tự — không mock names.
- Non-functional: xóa **cả** khối “Cần xử lý” và wrapper `Tuần này · 19–25/08` + 4 StatCard. Layout 1 cột sau khi mất sidebar. Không thay tuition KPI.
- Non-functional: giữ `useDirectKernelAction` check-in disable `busy || isPending(l.id)`.

## Architecture

```
_auth session.user ─┐
useData() snapshot ─┼→ dashboard.tsx
selectors (phase 1)─┘     ├ Lịch hôm nay
                          └ Học viên rủi ro
check-in ─ POST /api/lessons/:id/check-in ─ snapshot refetch
```

Reload = provider refetch snapshot. Không localStorage.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/dashboard.tsx`
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts`
- Delete: none (không xóa StatCard component — vẫn dùng chỗ khác)

## Tests Before

1. Extend `kernel-runtime.contract.test.ts` **trước** edit dashboard:
   - Dashboard source **không** match: `cô Lan`, `Thứ Ba, 19/08`, `19–25/08`, `Tuần này`, `7.5`, `6.2tr`, `2.0tr`, `Quốc Bảo`, `Minh Anh`, `INV-084`, `l.day === 2`, `s.atRisk`, `nợ học phí`, `fmtK`, `data.invoices`.
   - Dashboard source **có** import/`lessonsToday` / `atRiskRows` (không chỉ comment) + `useDirectKernelAction` / `void run(` / `disabled={busy || isPending(l.id)}`.
2. Giữ test check-in lock hiện có — không nới.

Chạy test này sẽ đỏ trên code hiện tại. Đó là TDD.

## Implementation Steps

1. Contract tests đỏ.
2. `dashboard.tsx`:
   - `useRouteContext({ from: "/_auth" })` lấy `session.data.user` (cùng invariant sidebar: missing user → không fake; `_auth` beforeLoad đã đảm bảo session).
   - `const now = new Date()` một lần/render.
   - `lessonsToday` / `atRiskRows` từ helper.
   - PageHead từ name + `formatDashboardLead(now, today.length)` — formatter có thể sống trong helper nếu thuần; nếu thuần thì unit test thêm ở phase 1 file (allowed — không đổi behavior selector).
   - Xóa block “Cần xử lý” + toàn bộ wrapper `Tuần này · 19–25/08` + StatCards. Kéo “Học viên rủi ro” ra top-level. Bỏ `lg:grid-cols-[2fr_1fr]` nếu chỉ còn 1 cột.
   - Table rủi ro chỉ khi `rows.length > 0`: reasons → badge; remaining. Không `onClick`. Empty: paragraph, không DataTable rỗng.
3. Check-in button chỉ trên `l.status !== "completed"` như hiện tại (absent/upcoming show button; server 409/404 đã có). Upcoming today = điểm danh được.
4. Contract tests xanh.
5. Biome/format file.

### Lead format

Local calendar, không UTC:

- Weekday vi-VN (`vi-VN` `weekday: "long"`) + `dd/MM`.
- Không hardcode "Thứ Ba".
- Count từ `today.length` — "Hôm nay có 0 buổi học" chấp nhận (trung thực).

## Tests After

- Contract: 0 hardcoded KPI strings.
- Optional: unit `formatDashboardLead` nếu extract — clock injectable.
- Không E2E mới (repo chưa có playwright dashboard). Reload covered vì không mock layer.

## Todo

- [x] Contract tests cấm hardcoded KPI / `day === 2`
- [x] Rewire dashboard selectors + session greeting
- [x] Xóa Cần xử lý + StatCard hardcode
- [x] At-risk table từ reasons
- [x] Contract + web test + check-types xanh

## Success Criteria

- [x] Pilot view không còn số/tên mock trong source dashboard
- [x] Today/at-risk đi qua helper
- [x] Check-in lock còn
- [x] Empty states không insert fixture names

## Regression Gate

```bash
pnpm --filter web test -- src/lib/dashboard-from-kernel.test.ts src/lib/kernel-runtime.contract.test.ts
pnpm --filter web test
pnpm --filter web check-types
```

## Risk Assessment

- **Absent + check-in button:** UI hiện show button nếu không completed. Absent vẫn hiện button — server từ chối. Keep parity; không thêm status UX mới.
- **Nợ cột:** đã cắt. UAT hỏi nợ → M2, không nhồi invoice.
- **Session name empty:** fallback "Giáo viên" giống sidebar.

## Security Considerations

Today filter = UX, không authz. Check-in body vẫn `{}`; server nhận upcoming cùng org (pre-existing). Session `user.name` cùng sidebar — PII không mới, React escape.
