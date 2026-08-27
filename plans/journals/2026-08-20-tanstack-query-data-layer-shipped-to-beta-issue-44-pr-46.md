---
title: "TanStack Query data layer shipped to beta (issue #44, PR #46)"
date: 2026-08-20
summary: "Migrated apps/web kernel data state to TanStack Query v5: one ['kernel'] query for reads, bus refetchQueries (exact, type all, throwOnError) for post-write refresh, single-flight reauth across read/write 401 paths. 26 useData() call sites untouched; 17 bus tests remapped 1:1; 174 web tests green. Review caught the v5 offline-pause pitfall (networkMode offlineFirst + regression test). Manual dev-server matrix deferred to beta review. Merged to develop, CI green; unblocks production-readiness Phase 6."
---

# TanStack Query data layer shipped to beta (issue #44, PR #46)

Migrated apps/web kernel data state to TanStack Query v5: one ['kernel'] query for reads, bus refetchQueries (exact, type all, throwOnError) for post-write refresh, single-flight reauth across read/write 401 paths. 26 useData() call sites untouched; 17 bus tests remapped 1:1; 174 web tests green. Review caught the v5 offline-pause pitfall (networkMode offlineFirst + regression test). Manual dev-server matrix deferred to beta review. Merged to develop, CI green; unblocks production-readiness Phase 6.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
