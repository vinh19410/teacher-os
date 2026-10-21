---
title: 402 e2e/design-compare dev-server watchdog
date: 2026-10-21
summary: "Root cause #402: vite 8.2.1 (rolldown engine) chết giữa run bằng native abort() SIGABRT trong rolldown-binding (crash report .ips, swap 17/18GB) — playwright không detect webServer chết giữa run nên cascade ERR_CONNECTION_REFUSED im lặng. Fix: watchdog webServer entry giám sát api/web/student (vite restart tối đa 1 lần + warming grace 90s; api chết fail-loud không restart; watchdog tự chết bắt bằng heartbeat stale + crash marker; globalTeardown probe cuối 3 URL); capture.mjs hủy run kèm dump log tail redact. Kill-injection 5 case + full e2e 178/0 + design:compare 12/12 đều pass; red-team 21 findings (18 accept)."
---

# 402 e2e/design-compare dev-server watchdog

Root cause #402: vite 8.2.1 (rolldown engine) chết giữa run bằng native abort() SIGABRT trong rolldown-binding (crash report .ips, swap 17/18GB) — playwright không detect webServer chết giữa run nên cascade ERR_CONNECTION_REFUSED im lặng. Fix: watchdog webServer entry giám sát api/web/student (vite restart tối đa 1 lần + warming grace 90s; api chết fail-loud không restart; watchdog tự chết bắt bằng heartbeat stale + crash marker; globalTeardown probe cuối 3 URL); capture.mjs hủy run kèm dump log tail redact. Kill-injection 5 case + full e2e 178/0 + design:compare 12/12 đều pass; red-team 21 findings (18 accept).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
