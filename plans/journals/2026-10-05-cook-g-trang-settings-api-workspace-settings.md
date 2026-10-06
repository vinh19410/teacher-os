---
title: Cook gỡ trang /settings + API workspace settings
date: 2026-10-05
summary: "Thực thi plan 261005-1523-remove-settings-route (issue #321): gỡ route /_auth/settings + sidebar + repos/settings (tách getApiBaseUrl sang api-base-url.ts); gỡ GET/PUT/POST /api/kernel/settings + contract workspaceSettings* trong kernel.ts/contracts.ts; viết lại 2 origin-guard test qua /api/classes (hard 403/404) + test khoá GET/PUT/POST 404 teacher session; pin /settings 404 ở worker.test; tombstone note workspace_settings; sync plan SePay #320 (banner+blockedBy, rewrite sang /payments đối chiếu /tuition) + plan chấm bài (api-base-url, precedent mới, symbol anchors); CHANGELOG Removed + roadmap M4/M5. Gates: pnpm check, check-types 7/7, web 1209, server 493, e2e 127 pass. Code review 2 reviewer: 0 Critical/0 Important/4 Minor (3 đã fix)."
---

# Cook gỡ trang /settings + API workspace settings

Thực thi plan 261005-1523-remove-settings-route (issue #321): gỡ route /_auth/settings + sidebar + repos/settings (tách getApiBaseUrl sang api-base-url.ts); gỡ GET/PUT/POST /api/kernel/settings + contract workspaceSettings* trong kernel.ts/contracts.ts; viết lại 2 origin-guard test qua /api/classes (hard 403/404) + test khoá GET/PUT/POST 404 teacher session; pin /settings 404 ở worker.test; tombstone note workspace_settings; sync plan SePay #320 (banner+blockedBy, rewrite sang /payments đối chiếu /tuition) + plan chấm bài (api-base-url, precedent mới, symbol anchors); CHANGELOG Removed + roadmap M4/M5. Gates: pnpm check, check-types 7/7, web 1209, server 493, e2e 127 pass. Code review 2 reviewer: 0 Critical/0 Important/4 Minor (3 đã fix).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
