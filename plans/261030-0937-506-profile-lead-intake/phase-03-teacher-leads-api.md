---
phase: 3
title: "API giáo viên /api/leads"
status: completed
priority: P2
effort: "0.4d"
dependencies: [1]
---

# Phase 3: `/api/leads`

## Goal
Giáo viên trong org đọc danh sách lead (lọc, tìm, phân trang, đếm theo trạng thái) và đổi trạng thái.

## Files to Create / Modify
- Create: `apps/server/src/routes/leads.ts`
- Create: `apps/server/src/routes/leads.test.ts`
- Modify: `apps/server/src/routes/kernel.ts` — `kernel.route("/leads", leadRoutes(deps))` cạnh `/notification-logs`.

## Tasks & Steps
1. `leadRoutes({ getDb })` theo mẫu `notification-logs.ts`:
   - `GET /`: `kernelCtx` vắng ⇒ 401; parse `leadQuerySchema`; `q` tìm `lower(name) LIKE` hoặc `phone LIKE` (escape `% _ \`); `status` lọc; order `createdAt desc`; page size 20; `counts` tính trên filter `q` (không áp `status`) bằng một query `GROUP BY status` + tổng `all`.
   - `PATCH /:id`: parse `leadPatchSchema`; update `where id = :id and orgId = ctx.orgId`; đổi status thì set `statusChangedAt = now`; 0 dòng ⇒ 404 `LEAD_NOT_FOUND`; trả `LeadRow`.
   - Map row → `LeadRow` (timestamp ISO), không trả `ipHash`.
2. Test: chỉ thấy lead org mình; filter status + q; counts đúng khi có q; phân trang; PATCH đổi status + `statusChangedAt`; PATCH lead org khác ⇒ 404; body lạ ⇒ 400; không session ⇒ 401; response không có `ipHash`.

## Verification
- `pnpm --filter server test -- leads`
- `pnpm --filter server test -- role-gates`
- `pnpm check-types`
