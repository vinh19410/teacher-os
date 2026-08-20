---
title: "Add TanStack Query for API data state management"
description: "Đưa TanStack Query v5 vào apps/web làm lớp server-state cho dữ liệu API: snapshot kernel đọc qua một query ['kernel'] duy nhất, bus ghi refetch qua QueryClient — context API của DataProvider và toàn bộ 27 call site useData() giữ nguyên."
status: pending
priority: P1
effort: "~2-3d"
branch: develop
tags: [frontend, refactor, tech-debt]
blockedBy: []
blocks: [260819-2034-production-readiness]
created: 2026-08-20
---

# Add TanStack Query for API data state management

## Overview

Adopt TanStack Query v5 làm lớp server-state cho `apps/web`: snapshot kernel (`GET /api/kernel`) chuyển từ fetch thủ công + `useState` trong `data-provider.tsx` sang MỘT `kernelQueryOptions` duy nhất (queryKey `['kernel']`); command bus sau POST refetch qua `queryClient.refetchQueries`. Context API hiện tại (`data`/`dispatch`/`refresh`/lookups) KHÔNG đổi — 27 call site `useData()`, read hooks, modals giữ nguyên. Load gate (children unmounted đến khi snapshot hợp lệ) + blocking error/retry + 401 reauth giữ đúng hành vi fail-safe đã ship. Thiết kế đã duyệt GO (kongming): chi tiết quyết định D1–D10 nằm trong các phase file.

## Scope Challenge

- Existing: `apps/web` chưa có data-fetching lib. `data-provider.tsx:96-126` fetch thủ công 1 lần lúc mount, gate theo `LoadState`; bus `repos/kernel.ts:302-383` (serial queue + dedupe + classify 4-state) POST rồi tự fetch+apply snapshot; 401 → `reauth()` inline tại `data-provider.tsx:89-94`.
- Requested: "thêm thư viện tanstack query để state management data từ API" — đúng vậy, không thêm gì.
- Complexity: chỉ `apps/web`; cao nhất là (a) race 401 đọc+ghi đồng thời → reauth double-fire (khắc phục bằng single-flight guard), (b) giữ nguyên ngữ nghĩa 4-state `KernelCommandResult` khi refetch bước qua QueryClient.
- Selected mode: HOLD SCOPE. Non-goals (D9): không migrate call site sang `useQuery` trực tiếp, không per-resource query keys, không `useMutation`/optimistic updates, không router loader/preload, không đụng `apps/server` hay `packages/*`, better-auth `useSession` giữ nguyên.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Snapshot kernel đọc qua đúng MỘT query `['kernel']` (queryFn có abort 15s, shape-guard giữ trong queryFn) | P1 |
| 2 | Context API DataProvider bất biến: 27 call site `useData()` không sửa dòng nào | P1 |
| 3 | Load gate + blocking error/retry + 401 reauth hành vi 1:1 với hiện tại | P1 |
| 4 | `KernelCommandResult` 4-state ngữ nghĩa 1:1 (refreshed/committed/definite-failure/outcome-unknown) — test chứng minh | P1 |
| 5 | Bus giữ serial queue + dedupe + classify + `onAuthLost`; refetch qua `refetchQueries` `throwOnError:true` | P1 |
| 6 | `pnpm check` / `pnpm test` / `pnpm check-types` / `pnpm build` xanh | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Cài đặt, QueryClient + reauth single-flight, provider bọc app](./phase-01-start.md) | Pending |
| 2 | [kernelQueryOptions + DataProvider chuyển sang useQuery](./phase-02-kernel-snapshot-query-in-dataprovider.md) | Pending |
| 3 | [Command bus refetch qua QueryClient](./phase-03-command-bus-refresh-through-queryclient.md) | Pending |
| 4 | [Tests, docs và verification CI](./phase-04-tests-docs-and-ci-verification.md) | Pending |

## Success Criteria

- [ ] 27 call site `useData()` (12 route files + topbar + 9 modals + 3 hooks lib) không đổi; app chạy đầy đủ trên dev server: sign-in, dashboard, các modals, mutations (add student/class/syllabus, check-in, grade, mark-paid...).
- [ ] Load gate + blocking error/retry UI + 401 → reauth hành vi giống hệt hiện tại (gate giữ children unmounted khi pending; 401 reauth đúng MỘT lần kể cả read+write 401 đồng thời).
- [ ] Ngữ nghĩa 4-state `KernelCommandResult` giống hệt — unit test bus chứng minh cả 4 nhánh.
- [ ] Một query key duy nhất `['kernel']` trong codebase (grep không thấy query key kernel thứ hai).
- [ ] `pnpm check`, `pnpm test`, `pnpm check-types`, `pnpm build` xanh.
- [ ] Docs đồng bộ: `docs/code-standards.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`.

## Related plans

- `plans/260819-2034-production-readiness` (pending) — plan này **BLOCK** plan đó: Phase 6 live UAT của nó phải thu evidence trên data layer cuối cùng (sau khi migration Query hoàn tất). Phase 2 D1 drill của nó chạy độc lập, không bị chặn.
- `plans/260820-1912-redesign-login-sign-up-page` (pending) — không chồng lấn file, không chặn nhau.

## Dependencies

- Thêm `@tanstack/react-query@^5` (dependencies) + `@tanstack/react-query-devtools@^5` (devDependencies) vào `apps/web/package.json`, pin caret trực tiếp — theo convention hiện có của `@tanstack/react-form`/`react-router` (D8).
- React 19 + Node 24 CI: peer-dep OK; `AbortSignal.any` (Node 20.3+/Safari 17.4+) an toàn (D3, [research-02](./research/researcher-02-migration-semantics-testing.md)).
- Không đụng contract/API/server — `packages/api` giữ nguyên.

<!-- slug: add-tanstack-query-for-api-data-state-management -->
