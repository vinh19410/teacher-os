---
title: Plan TanStack Query data layer cho apps/web
date: 2026-08-20
summary: "Lập kế hoạch thêm TanStack Query v5 làm server-state layer: snapshot query ['kernel'] + bus refetch qua QueryClient, red-team 10 findings đã apply, issue #44"
---

# Plan TanStack Query data layer cho apps/web

## What happened
- Chạy `/ak:plan --github --advice` cho yêu cầu "thêm thư viện tanstack query để state management data từ API" (auto-detect Hard mode).
- Research (2 agents song song): pattern QueryClientProvider + queryOptions; `refetchQueries(['kernel'], exact, throwOnError:true)` cho 4-state result; giữ bus ngoài react-query; test node-env không jsdom.
- Kongming checkpoint 1: GO với 2 điều kiện — không dùng router-context (design đã tránh), test QueryCache/QueryClient behavior không jsdom + guard 401 single-flight.
- Planner viết plan.md + 4 phase (queries/providers/bus/tests-docs); red-team 3 reviewers bắt 10 findings (2 Critical, 3 High, 5 Medium), tất cả accepted & applied.
- Critical đáng chú ý: (F1) `kernel-runtime.contract.test.ts` source-locks sẽ vỡ phase 1+2 mà plan claim "vẫn pass" — nay mỗi phase cập nhật lock; (F2) `isError` vô điều kiện sẽ unmount workspace khi mid-session refresh fail (phá UX `committed`/reconcile) — nay chỉ block khi `snapshot === undefined`.
- Thiết kế đổi theo findings: `retry: false` (tránh serial queue block ~96s, 1:1 hôm nay); `AbortSignal.any` feature-detect fallback (PWA lockout iOS <17.4); `refresh()` giữ `bus.refresh()` từ phase 2 (invariant stale-apply); bus test map đủ 17 (không phải 7); call sites 27→26.
- Whole-plan consistency sweep: 7 stale refs reconciled, 0 unresolved; `ak plan validate` OK.

## Decision
- DataProvider giữ nguyên context API (26 call site `useData()` không đổi); TanStack Query làm cache/refetch engine phía sau.
- Plan này **blocks** production-readiness (#28): Phase 6 UAT phải thu evidence trên data layer cuối.
- GitHub issue #44 tạo với label `ready to review`.

## Next steps
- Review plan tại plans/260820-2029-add-tanstack-query-for-api-data-state-management/plan.md và issue #44.
- Implement qua `/ak:cook plans/260820-2029-add-tanstack-query-for-api-data-state-management/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
