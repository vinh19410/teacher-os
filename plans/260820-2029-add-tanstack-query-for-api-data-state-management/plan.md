---
title: "Add TanStack Query for API data state management"
description: "Đưa TanStack Query v5 vào apps/web làm lớp server-state cho dữ liệu API: snapshot kernel đọc qua một query ['kernel'] duy nhất, bus ghi refetch qua QueryClient — context API của DataProvider và toàn bộ 26 call site useData() giữ nguyên."
status: in-progress
priority: P1
effort: "~2-3d"
issue: 44
branch: develop
tags: [frontend, refactor, tech-debt]
blockedBy: []
blocks: [260819-2034-production-readiness]
created: 2026-08-20
---

# Add TanStack Query for API data state management

## Overview

Adopt TanStack Query v5 làm lớp server-state cho `apps/web`: snapshot kernel (`GET /api/kernel`) chuyển từ fetch thủ công + `useState` trong `data-provider.tsx` sang MỘT `kernelQueryOptions` duy nhất (queryKey `['kernel']`); command bus sau POST refetch qua `queryClient.refetchQueries`. Context API hiện tại (`data`/`dispatch`/`refresh`/lookups) KHÔNG đổi — 26 call site `useData()`, read hooks, modals giữ nguyên. Load gate (children unmounted đến khi snapshot hợp lệ) + blocking error/retry + 401 reauth giữ đúng hành vi fail-safe đã ship. Thiết kế đã duyệt GO (kongming): chi tiết quyết định D1–D10 nằm trong các phase file.

## Scope Challenge

- Existing: `apps/web` chưa có data-fetching lib. `data-provider.tsx:96-126` fetch thủ công 1 lần lúc mount, gate theo `LoadState`; bus `repos/kernel.ts:302-383` (serial queue + dedupe + classify 4-state) POST rồi tự fetch+apply snapshot; 401 → `reauth()` inline tại `data-provider.tsx:89-94`.
- Requested: "thêm thư viện tanstack query để state management data từ API" — đúng vậy, không thêm gì.
- Complexity: chỉ `apps/web`; cao nhất là (a) race 401 đọc+ghi đồng thời → reauth double-fire (khắc phục bằng single-flight guard), (b) giữ nguyên ngữ nghĩa 4-state `KernelCommandResult` khi refetch bước qua QueryClient.
- Selected mode: HOLD SCOPE. Non-goals (D9): không migrate call site sang `useQuery` trực tiếp, không per-resource query keys, không `useMutation`/optimistic updates, không router loader/preload, không đụng `apps/server` hay `packages/*`, better-auth `useSession` giữ nguyên.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Snapshot kernel đọc qua đúng MỘT query `['kernel']` (queryFn có abort 15s, shape-guard giữ trong queryFn) | P1 |
| 2 | Context API DataProvider bất biến: 26 call site `useData()` không sửa dòng nào | P1 |
| 3 | Load gate + blocking error/retry (chỉ initial load) + 401 reauth hành vi 1:1; mid-session refresh fail GIỮ workspace mounted với stale data | P1 |
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

- [ ] 26 call site `useData()` (11 route files + topbar + 9 modals + 5 hooks lib) không đổi — verify `grep -rn "useData()" apps/web/src | grep -v data-provider | wc -l` cho cùng số trước/sau; app chạy đầy đủ trên dev server: sign-in, dashboard, các modals, mutations (add student/class/syllabus, check-in, grade, mark-paid...).
- [ ] Load gate + blocking error/retry UI (initial load) + 401 → reauth hành vi giống hệt hiện tại (gate giữ children unmounted khi pending; 401 reauth đúng MỘT lần kể cả read+write 401 đồng thời); mid-session refresh fail KHÔNG unmount workspace — stale data giữ, outcome surface như hôm nay.
- [ ] Ngữ nghĩa 4-state `KernelCommandResult` giống hệt — unit test bus chứng minh cả 4 nhánh.
- [ ] Một query key duy nhất `['kernel']` trong codebase (grep không thấy query key kernel thứ hai).
- [ ] `pnpm check`, `pnpm test`, `pnpm check-types`, `pnpm build` xanh.
- [ ] Docs đồng bộ: `docs/code-standards.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`.

## Related plans

- `plans/260819-2034-production-readiness` (pending) — plan này **BLOCK** plan đó: Phase 6 live UAT của nó phải thu evidence trên data layer cuối cùng (sau khi migration Query hoàn tất). Phase 2 D1 drill của nó chạy độc lập, không bị chặn.
- `plans/260820-1912-redesign-login-sign-up-page` (pending) — không chồng lấn file, không chặn nhau.

## Dependencies

- Thêm `@tanstack/react-query@^5` (dependencies) + `@tanstack/react-query-devtools@^5` (devDependencies) vào `apps/web/package.json`, pin caret trực tiếp — theo convention hiện có của `@tanstack/react-form`/`react-router` (D8).
- QueryClient defaults (D4, cập nhật theo F7): `retry: false` — KHÔNG auto-retry, hành vi 1:1 hôm nay (load fail → error screen ngay; bus tự quản 2 attempts refresh ≈ 2 GET như hôm nay, không stacking).
- `AbortSignal.any` có feature-detect + fallback timeout-only trong `fetchKernelSnapshot` (D3 + F8): repo không có browserslist/build.target và PWA autoUpdate → không được nâng âm thầm browser floor (Safari <17.4 mất unmount-cancel nhưng không tệ hơn hiện tại), [researcher-02](./research/researcher-02-migration-semantics-testing.md).
- Không đụng contract/API/server — `packages/api` giữ nguyên.

## Red Team Review

Session 2026-08-20 — Findings: 10 (10 accepted, 0 rejected) — 2 Critical, 3 High, 5 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | `kernel-runtime.contract.test.ts` source-locks vỡ ở phase 1+2; phase 4 claim "vẫn pass" sai | Critical | Accept | Phase 1 (chuyển 2 reauth lock sang `lib/reauth.ts`), Phase 2 (4 gate lock → wiring mới), Phase 4 (xóa claim) |
| F2 | `isError` blocking mọi lúc → unmount children giữa session (kịch bản `committed`) | Critical | Accept | plan.md Goal 3/Success, Phase 2 (chỉ block khi `snapshot === undefined` + risk), Phase 4 (manual verify) |
| F3 | Single-flight test mock đúng module chứa guard → assertion "1 lần" bất khả thi | High | Accept | Phase 4 (real `reauth` + `vi.mock auth-client` + `stubGlobal window`; bus test GET-fail dùng 5xx) |
| F4 | Phase 2 `refresh()` ngoài bus queue phá invariant stale-apply; risk mitigation sai | High | Accept | Phase 2 (giữ `bus.refresh()` + sửa risk), Phase 3 (giữ nguyên wiring) |
| F5 | "7 test hiện có" sai — describe bus có 17 test, map bỏ sót 11 | High | Accept | Phase 3 (bảng map đủ 17 + cơ chế quan sát quyết định trước + effort 1d) |
| F6 | Đếm call site sai: 27 → thực tế 26 (11 route + topbar + 9 modals + 5 hooks) | Medium | Accept | plan.md, Phase 2, Phase 4 (+ lệnh verify grep) |
| F7 | Retry-stacking worst case ~96s block serial queue (6 GET + exponential delay) | Medium | Accept | Phase 1 (`retry: false`, xóa `kernelQueryRetry`), Phase 2/3 (xóa delta), Phase 4 (defaults test), Dependencies |
| F8 | `AbortSignal.any` nâng browser floor âm thầm → PWA lockout iOS 16.4–17.3 | Medium | Accept | Phase 2 (feature-detect + risk row), Dependencies (bỏ claim "an toàn") |
| F9 | Citation devtools-devDependencies bịa (`@tanstack/react-router-devtools` không có trong repo) | Medium | Accept | Phase 1 (justification đúng theo `@tanstack/react-form`) |
| F10 | Abort test tự mâu thuẫn: mock reject AbortError nhưng assert TimeoutError | Medium | Accept | Phase 4 (reject `signal.reason`, assert theo từng case) |

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01-start.md, phase-02-kernel-snapshot-query-in-dataprovider.md, phase-03-command-bus-refresh-through-queryclient.md, phase-04-tests-docs-and-ci-verification.md
- Decision deltas checked: 10 (F1–F10)
- Reconciled stale references: 7 — Phase 1 Todo "retry fn" (đã xóa theo F7), Phase 1 line-range reauth 83-94→89-94, Phase 4 Architecture "retry fn"→defaults, Phase 4 step "override retry test instance" mâu thuẫn risk row "không cần override", Phase 4 abort assert lỏng `.rejects.toThrow()`→assert `reason.name` từng case (F10), Phase 4 thiếu test fallback `AbortSignal.any` mà Phase 2 risk row đã hứa (thêm case 3), Phase 4 Todo matrix (a)–(d)→(a)–(e)
- Unresolved contradictions: 0
- `[UNVERIFIED]` tags: 0

<!-- slug: add-tanstack-query-for-api-data-state-management -->
