---
type: tester
date: 2026-08-16
scope: remap-local-dev-ports-to-800x
branch: develop
cwd: /Users/vinhtran/Documents/project/personal/teacher-os
---

# Test Report — 2026-08-16 — remap local ports 3000/3001 → 8000/8001

## Summary

**21/21 tests PASS. 3 quality cmds exit 0.** 10/10 assigned AC pass. Contract file hash = HEAD. Tracked historical `plans/**` unchanged. Biome 0 error (7 warn + 2 info pre-existing).

## Diff-aware mode

```
Diff-aware mode: analyzed 5 changed files
  Changed: .github/workflows/ci.yml, README.md,
           apps/web/src/lib/auth-client.ts, apps/web/vite.config.ts,
           packages/infra/alchemy.run.ts
  Mapped:  scripts/ci-workflow.test.mjs (C — imports/reads ci.yml)
           apps/web/src/lib/data-store-reducer.test.ts (full suite; ci.yml = config)
  Unmapped: alchemy.run.ts, vite.config.ts, auth-client.ts, README.md
Ran 21/21 tests (diff-based = full product suite): 21 passed, 0 failed
```

| File | Why selected |
|---|---|
| `.github/workflows/ci.yml` | Config → escalate `--full`. Strategy C → `scripts/ci-workflow.test.mjs` |
| `apps/web/vite.config.ts` | Vite bind. No colocated test. Validated by `vitest run` + web `check-types` (`vite build`) |
| `packages/infra/alchemy.run.ts` | Infra bind. No test. Validated by `@teacher-os/infra` `tsc --noEmit` (accepts `dev.strictPort`) |
| `apps/web/src/lib/auth-client.ts` | Fallback string only. [!] no unit test |
| `README.md` | Docs. Static AC check |
| `scripts/ci-workflow.test.mjs` | **unchanged** vs HEAD (`0a82f926…` = `HEAD:scripts/ci-workflow.test.mjs`) |

Auto-escalate `--full`: yes (`ci.yml` config). Assigned `pnpm test` = toàn bộ suite hiện có (web vitest + node contract). Packages khác không có `test` script.

[!] No tests for `auth-client.ts` `getServerUrl` fallback `localhost:8000`. Path chỉ chạy khi `VITE_SERVER_URL` relative + no `window` + no `VERCEL_*`. CI/dotenv hiện absolute → fallback unused.

[!] No tests for Alchemy/Vite bind ports. Contract test chỉ assert key `VITE_SERVER_URL`, **không** lock `:8000` (đúng plan phase-03).

## Commands (exact exit codes)

| # | Command | Exit | Duration | Result |
|---|---------|------|----------|--------|
| 1 | `pnpm test` | **0** | turbo 1.296s + contract 103ms | web **20/20** Vitest 29ms; contract **1/1** |
| 2 | `pnpm exec biome check .` | **0** | 110ms, 117 files | 0 error. 7 warn + 2 info. No fixes applied |
| 3 | `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` | **0** | 18.463s, 0 cache, 4/4 | infra/ui/server/web. web `vite build` 1.15s + `tsc --noEmit` |

Không flake re-run (single clean pass, deterministic reducer clones). Không weaken test.

Biome diagnostics (pre-existing, cùng set report tester-web-app-test-suite):

- info: `app-shell.tsx:50` `useExhaustiveDependencies` (`pathname`)
- info: `biome.json:39` `recommended` deprecated
- warn: unused suppressions `app-shell.tsx:70`, `schedule.tsx:36`
- warn: unused `data` / `Button` / `Card` / `pct` / `INV_VARIANT`

## Test Results Overview

- **Total**: 21 (20 Vitest + 1 node:test)
- **Passed**: 21 | **Failed**: 0 | **Skipped**: 0
- **Duration**: ~1.4s tests; ~18.5s check-types
- **Toolchain**: turbo 2.10.10, vitest 4.1.10, biome check 117 files

## Coverage Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Lines / branches / functions | n/a | 80/70/80 | SKIP |

Không có `test:coverage` / c8 / istanbul trong repo. Suite hiện tại = reducer characterization + CI YAML contract. Port remap không thêm coverage surface.

## Failed Tests

None.

## Acceptance Criteria

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pnpm test` exit 0 | **PASS** | 20 vitest + 1 contract |
| 2 | `pnpm exec biome check .` exit 0 | **PASS** | 0 error; 7w+2i allowed |
| 3 | `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exit 0 | **PASS** | 4/4 tasks |
| 4 | `scripts/ci-workflow.test.mjs` diff empty vs HEAD | **PASS** | hash match `0a82f926` |
| 5 | CI dummy `VITE_SERVER_URL: http://localhost:8000` | **PASS** | `ci.yml:20` |
| 6 | Alchemy Worker 8000 + `strictPort`; Website.Vite 8001 + `strictPort` | **PASS** | `alchemy.run.ts:28-31,53-56` |
| 7 | `vite.config.ts` port 8001 + `strictPort` | **PASS** | `vite.config.ts:8-10` |
| 8 | auth-client fallback `localhost:8000` | **PASS** | `auth-client.ts:37` |
| 9 | README local 8000/8001; OAuth path `/api/auth/oauth2/callback/google` | **PASS** | README:48-49,58-60 |
| 10 | No tracked historical plan files changed | **PASS** | `git diff HEAD -- plans/` empty |

Live source leftover `localhost:300[01]` in `apps/`, `packages/`, `README.md`, `.github/`, `scripts/`: **none**. Hits còn lại chỉ trong historical `plans/**` (đúng contract).

`mock-data.ts` `price: 300000` = VND, không phải port.

## Build Status

- **check-types (includes web vite production build)**: PASS
- **standalone `pnpm build`**: not in assigned AC; not run
- **Warnings**: biome pre-existing only
- **Dependencies**: resolved (no install this run)

## Critical Issues

None blocking merge of the port remap.

## Recommendations

1. **High (ops, not code):** Google Cloud Console — add `http://localhost:8000/api/auth/oauth2/callback/google` (+ JS origin `http://localhost:8001`). Giữ URI 3000 đến khi client local đã chuyển.
2. **Medium:** Optional local smoke `pnpm run dev` — confirm bind 8000/8001, no hop warning, `strictPort` crash nếu occupied. Ngoài CI gate.
3. **Low:** `getServerUrl` fallback không có test. Chỉ thêm nếu muốn lock string; hiện unused khi URL absolute.
4. **Do not:** assert `:8000` trong `ci-workflow.test.mjs` — phase-03 cấm. Key-only giữ nguyên.

## Next Steps

1. Operator cập nhật Google Console URIs.
2. Restart `pnpm run dev`; hard-refresh / unregister PWA SW nếu còn cache origin 3001.
3. Reviewer xác nhận `.env` host/port (tester không đọc/sửa `.env`).

## Unresolved Questions

- Live `.env` (`apps/web/.env` `VITE_SERVER_URL`, `apps/server/.env` `BETTER_AUTH_URL`/`CORS_ORIGIN`) không inspect — ngoài assigned AC + forbid edit `.env`. Plan AC vẫn yêu cầu 8000/8001 ở đó.
- Bind smoke 8000/8001 trên máy này chưa chạy.
- `pnpm build` root không nằm trong assigned AC.
