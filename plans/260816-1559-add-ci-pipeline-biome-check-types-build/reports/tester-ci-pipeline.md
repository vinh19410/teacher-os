---
type: tester
date: 2026-08-16
issue: 3
branch: feat/ci-pipeline
worktree: /Users/vinhtran/Documents/project/personal/worktrees/teacher-os-ci-pipeline
---

# Test Report — 2026-08-16 — issue #3 CI pipeline

## Summary

Issue #3 AC **PASS** trên worktree local. 4 lệnh bắt buộc đều exit 0. Workflow contract khớp issue + inspect list. Không phát hiện lint/type/build **error** mới. Biome còn 7 warning + 2 info pre-existing (exit 0, đúng non-goal). Chưa có GitHub Actions run thật.

## Diff-aware mode: analyzed 5 changed files

```
Diff-aware mode: analyzed 5 changed files
  Changed: biome.json, package.json, .github/workflows/ci.yml,
           scripts/ci-workflow.test.mjs, plans/260816-1559-.../
  Mapped:  scripts/ci-workflow.test.mjs (Strategy A/C — contract test for ci.yml)
           + 3 quality gates (biome / check-types / build) vì biome.json + package.json là config
  Unmapped: plans/260816-1559-.../ (docs/plan only)
Ran 1/1 node:test + 3 quality gates (diff-based): 4 passed, 0 failed
```

| File | Why selected |
|---|---|
| `.github/workflows/ci.yml` | Product under test. Mapped → `scripts/ci-workflow.test.mjs` |
| `scripts/ci-workflow.test.mjs` | Contract test mới (Strategy A) |
| `package.json` | Thêm `test:ci-workflow`. Config → chạy script đó |
| `biome.json` | Thêm ignore drizzle meta. Config → `biome check .` |
| `plans/...` | Plan/docs. No product tests |

[!] No unit tests for `biome.json` / `package.json` — acceptable: validated by cmd 2 + cmd 1.

Auto-escalate `--full` **không** apply theo nghĩa product suite: repo không có Vitest/Jest. 4 lệnh user giao = toàn bộ gate liên quan.

## Test Results Overview

- **Total gates**: 4 (1 node:test + 3 quality)
- **Passed**: 4 | **Failed**: 0 | **Skipped**: 0
- **node:test**: 1 test, 0 fail, duration 50.6ms (suite wall 0.30s)
- **Toolchain**: Node v24.15.0, pnpm 10.33.1, turbo 2.10.10, cwd = worktree

| # | Command | Exit | Duration | Notes |
|---|---------|------|----------|-------|
| 1 | `pnpm test:ci-workflow` | **0** | 0.30s | `✔ ci workflow exists and matches the quality-gate contract` |
| 2 | `pnpm exec biome check .` | **0** | 1.79s | 114 files. 7 warn + 2 info. No errors. No `--write` |
| 3 | `VITE_SERVER_URL=http://localhost:3000 pnpm exec turbo run check-types --force` | **0** | 10.04s | 4/4 tasks (infra, ui, server, web). cache bypass |
| 4 | `VITE_SERVER_URL=http://localhost:3000 pnpm exec turbo run build --force` | **0** | 5.26s | 2/2 tasks (web vite, server tsdown). cache bypass |

## Coverage Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Lines (istanbul/c8) | n/a — no coverage runner in repo | 80% | N/A |
| Contract assertions | 11 (1 equal + 8 match + 2 doesNotMatch) | issue #3 fields | PASS |
| Workflow AC fields | 8/8 inspected | 100% | PASS |
| Branch of quality job | 1 job `quality`, sequential | — | PASS |

Contract test cover:

- file exists
- `pull_request:` + `push:` + `main` + `develop`
- `pnpm exec biome check .` / `pnpm check-types` / `pnpm build`
- không `biome check --write`
- không `${{ secrets.`
- có `VITE_SERVER_URL`

**Gap (không fail AC):** test không assert **thứ tự** 3 lệnh. Verified thủ công: run steps = install → biome → check-types → build (indices 1,2,3, strict increasing).

## Workflow contract vs issue #3

Issue #3: workflow chạy `pnpm exec biome check .`, `pnpm check-types`, `pnpm build` trên PR và push `develop`/`main`.

| Check | Result | Evidence |
|---|---|---|
| `.github/workflows/ci.yml` exists | PASS | 671 bytes, `feat/ci-pipeline` untracked |
| trigger `pull_request` | PASS | `ci.yml:4` — bare (mọi PR) |
| trigger `push` `main` + `develop` | PASS | `ci.yml:5-6` `branches: [main, develop]` |
| job runs 3 cmds **in order** | PASS | `ci.yml:31-33` |
| no `biome check --write` | PASS | grep + contract `doesNotMatch` |
| no `${{ secrets.` | PASS | file-wide scan false |
| dummy `VITE_SERVER_URL` | PASS | `ci.yml:20` `http://localhost:3000` |
| biome ignores drizzle meta | PASS | `biome.json:31` `!**/packages/db/src/migrations/meta` |
| `scripts/ci-workflow.test.mjs` exists | PASS | 1281 bytes |

Extra (plan, không phải issue #3) — present, không bắt buộc:

- `permissions.contents: read` (`ci.yml:12-13`)
- concurrency cancel-in-progress (`ci.yml:8-10`)
- `timeout-minutes: 20`
- `pnpm install --frozen-lockfile`
- Node 24 + pnpm 10.33.1 + checkout@v7 / setup-node@v7 / pnpm/action-setup@v6
- root `check` vẫn `biome check --write .` (`package.json:18`) — CI **không** gọi script này

Ignore drizzle **active**: `biome check packages/db/src/migrations/meta` → exit 1, "These paths were provided but ignored". Meta JSON dùng 2-space (`_journal.json`) vs biome tab — ignore đúng, tránh flake khi `db:generate`.

## Failed Tests

None.

## Pre-existing Biome (exit 0, allowed)

Không do diff này. Plan non-goal: không fix warning.

| Level | Location | Rule |
|-------|----------|------|
| info | `apps/web/src/components/layout/app-shell.tsx:50` | `useExhaustiveDependencies` (`pathname`) |
| info | `biome.json:39` | `recommended` deprecated → use `preset` |
| warn | `app-shell.tsx:70` | unused suppression `useKeyWithClickEvents` |
| warn | `add-syllabus-modal.tsx:16` | unused `data` |
| warn | `schedule.tsx:5` | unused `Button` import |
| warn | `schedule.tsx:6` | unused `Card` import |
| warn | `schedule.tsx:36` | unused suppression `noArrayIndexKey` |
| warn | `$syllabusId.tsx:84` | unused `pct` |
| warn | `tuition.tsx:25` | unused `INV_VARIANT` |

## Performance Metrics

| Gate | Wall | Note |
|------|------|------|
| contract test | 0.30s | node:test 50.6ms — deterministic, file read |
| biome | 1.79s | 114 files / 62ms biome internals |
| check-types --force | 10.04s | web `vite build && tsc --noEmit` 689ms vite |
| build --force | 5.26s | web vite 641ms; server tsdown 4546ms |

No slow/flaky tests. Contract test không I/O mạng, không flake.

`check-types` web đã `vite build` rồi `build` lặp lại — trùng, đúng HOLD SCOPE issue #3 (cả hai lệnh).

## Build Status

- **Build**: PASS
- **check-types**: PASS (infra/ui/server/web)
- **Dependencies**: resolved (`node_modules` present; `--force` không reinstall)
- **Warnings (pre-existing, non-blocking)**:
  - tsdown hint: `drizzle-orm` bundled; suggest `deps.onlyBundle`
  - rolldown `PLUGIN_TIMINGS` (98% in `rolldown-plugin-dts:generate`)
- **Env**: `VITE_SERVER_URL=http://localhost:3000` (dummy public URL, không secret)
- **Turbo**: remote cache disabled; local "shared worktree cache" — GH runner sẽ cold cache

## Critical Issues

None blocking merge của #3 trên bằng chứng local.

## Residual (không fail AC)

1. **Chưa có GitHub Actions run.** Proof = local only. Action major 404 / pnpm cache / ubuntu toolchain vẫn là rủi ro first-run (plan Risks).
2. **Workflow chưa required check.** Branch protection ngoài scope #3. Merge vẫn human-gated.
3. **CI không chạy `pnpm test:ci-workflow`.** Plan ghi optional. Contract test chỉ bảo vệ khi dev chạy local / trước ship.
4. **Contract test substring, không lock order / YAML shape.** `pnpm build` trong comment cũng match. Hiện YAML tối giản nên OK.

## Recommendations

1. **P0 ship:** push `feat/ci-pipeline` + xem `gh run view` first Actions run. Fail → sửa workflow only.
2. **P2 (sau #3):** thêm assert thứ tự 3 `run:` steps trong `ci-workflow.test.mjs` nếu muốn cứng contract.
3. **P2 (sau #3):** optional step `pnpm test:ci-workflow` sau install — không thay 3 lệnh issue.
4. **P3 (ngoài #3):** dọn 7 biome warning; migrate `recommended` → `preset`.
5. **P3 (ngoài #3):** bật required status check `CI / quality` trên `develop`/`main`.

## Next Steps

1. Lead: merge/ship sau khi first GH run xanh.
2. Không cần test file mới cho AC #3.
3. Docs evergreen: không đổi user-facing behavior ngoài CI gate — docs impact = none trừ khi repo document CI commands.

## Unresolved Questions

- First GitHub Actions run trên `ubuntu-latest` + `actions/checkout@v7` / `setup-node@v7` / `pnpm/action-setup@v6` đã live-pass chưa? Tester không push, không xem `gh run`.
- Branch protection sẽ bật required check ở issue nào?

---

Status: DONE_WITH_CONCERNS
Summary: 4/4 lệnh AC exit 0; workflow khớp issue #3; không error mới. Concern: proof local-only, chưa có GitHub Actions run.
Concerns/Blockers: First live Actions run chưa verify. Branch protection / required check ngoài scope.
