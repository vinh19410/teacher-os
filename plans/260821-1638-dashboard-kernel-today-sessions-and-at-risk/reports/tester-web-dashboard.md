---
type: tester
date: 2026-08-21
issue: 57
scope: dashboard-kernel-today-sessions-and-at-risk
branch: feat/57-dashboard-kernel-today-at-risk
cwd: /Users/vinhtran/Documents/project/personal/worktrees/teacher-os-57-dashboard-kernel-today-at-risk
---

# Test Report — 2026-08-21 — issue #57 dashboard kernel today + at-risk

## Summary

**197/197 web Vitest PASS. Focused 33/33 PASS. check-types PASS.** Helper today/at-risk + contract cấm KPI hardcode khóa đủ AC. 0 fail. Không sửa product code.

## Diff-aware mode

```
Diff-aware mode: analyzed 4 changed files
  Changed: dashboard-from-kernel.ts (new), dashboard-from-kernel.test.ts (new),
           dashboard.tsx, kernel-runtime.contract.test.ts
  Mapped:  dashboard-from-kernel.test.ts (A — colocated)
           kernel-runtime.contract.test.ts (A + C — source-parse dashboard.tsx)
  Unmapped: dashboard.tsx render path (no RTL/component test; covered by contract)
Ran 33 focused then 197/197 full web: 197 passed, 0 failed
```

| File | Why selected |
|---|---|
| `apps/web/src/lib/dashboard-from-kernel.ts` | Selector thuần. Strategy A → colocated test (10 cases) |
| `apps/web/src/lib/dashboard-from-kernel.test.ts` | Suite mới — weekday / today / at-risk / lead |
| `apps/web/src/routes/_auth/dashboard.tsx` | UI rewire. Strategy C → `kernel-runtime.contract.test.ts` KPI ban + check-in lock |
| `apps/web/src/lib/kernel-runtime.contract.test.ts` | +1 test cấm KPI; giữ check-in `useDirectKernelAction` |

Không auto-escalate `--full` theo mapping (không config/high fan-out). Task vẫn yêu cầu full web suite → chạy.

[!] No React render tests for `dashboard.tsx` — empty copy, skip `studentById` miss, greeting `user.name \|\| "Giáo viên"`. Contract chỉ source-parse.

## Commands

| # | Command | Exit | Duration | Result |
|---|---------|------|----------|--------|
| 1a | `pnpm --filter web test -- src/lib/dashboard-from-kernel.test.ts src/lib/kernel-runtime.contract.test.ts` | **0** | 665ms | **197/197** — extra `--` sau `vitest run` làm Vitest bỏ file filter |
| 1b | `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/lib/kernel-runtime.contract.test.ts` | **0** | 183ms | **33/33** true focused (10 helper + 23 contract) |
| 2 | `pnpm --filter web test` | **0** | 857ms | **197/197**, 20 files |
| 3 | `pnpm --filter web check-types` | **0** | vite build 646ms + `tsc --noEmit` | PASS. dashboard chunk emit |

Không flake (2 full-suite pass: 1a + 2). Không weaken test.

## Test Results Overview

- **Focused (1b)**: 33 — helper 10 + contract 23
- **Full web**: **197** tests / 20 files
- **Passed**: 197 | **Failed**: 0 | **Skipped**: 0
- **Duration**: ~0.86s full; helper 22ms; contract 35ms
- **Slowest file**: `repos/kernel.test.ts` 162ms (pre-existing, 55 tests)
- **Toolchain**: vitest 4.1.10, vite 8.2.1

Breakdown mới vs baseline worktree (pre-#71):

| File | Tests |
|---|---|
| `dashboard-from-kernel.test.ts` | **+10** |
| `kernel-runtime.contract.test.ts` | 22 → **23** (+1 KPI ban) |

## Coverage Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Lines / branches / functions | n/a | 80/70/80 | SKIP |

Không `test:coverage` / c8 / istanbul trong web package. Coverage = characterization + source contract.

Helper paths **có test**:

- `lessonDayFromDate`: Mon=1 / Wed=3 / Sun=7, Date local `2026-08-17/19/23`
- `lessonsToday`: filter day, drop cancelled, keep upcoming+completed+absent, sort time, empty, 12× Monday weekday-model
- `atRiskRows`: ignore `student.atRisk` + tag nợ; absent; missed `day < today`; today upcoming not missed; completed/cancelled not risk; Monday no Sunday wrap; merge reasons, no duplicate student
- `formatDashboardLead`: local `17/08` + `Hôm nay có 0 buổi học`

Helper paths **chưa test** (non-block):

- default `now = new Date()` (không inject)
- orphan `sid` không có trong `students` → drop
- thứ tự row = thứ tự `students`
- `formatDashboardLead` không lock chuỗi weekday (`Thứ hai` vs `Thứ Hai`)

## Failed Tests

None.

## Acceptance Criteria

| AC | Evidence | Status |
|---|---|---|
| Today = `lesson.day` weekday Mon=1, không `day === 2` | helper + contract `not.toMatch(/l\.day === 2/)` | PASS |
| Cancelled ẩn; sort `time` | `keeps same weekday except cancelled, sorted by time` | PASS |
| At-risk absent / missed-check-in; không `s.atRisk` / tag | helper ignore-mock + contract bans | PASS |
| 0 KPI/tên hardcode trong dashboard source | contract 15 `not.toMatch` + grep dashboard chỉ còn `atRiskRows` | PASS |
| Check-in `useDirectKernelAction` + `disabled={busy \|\| isPending(l.id)}` | contract cũ + test KPI mới cùng lock | PASS |
| 197 web tests pass | full suite 197/197 | PASS |
| Types | `check-types` exit 0 | PASS |

Ban-list verified in `kernel-runtime.contract.test.ts:160-183`: `cô Lan`, `Thứ Ba, 19/08`, `19–25/08`, `Tuần này`, `7.5`, `6.2tr`, `2.0tr`, `Quốc Bảo`, `Minh Anh`, `INV-084`, `l.day === 2`, `s.atRisk`, `nợ học phí`, `fmtK`, `data.invoices`. Positive: import helper, `lessonsToday(`, `atRiskRows(`, check-in lock.

Dashboard source grep: 0 leftover StatCard / cô Lan / KPI literals.

## Build Status

- **Vitest**: PASS
- **vite build + tsc**: PASS (check-types)
- **Warnings**: none in test/type output
- **Dependencies**: resolved (web filter dùng worktree `apps/web`)

## Critical Issues

None.

## Gaps (non-blocking)

1. **Medium** — contract không cấm `Cần xử lý` / `StatCard` / title cứng. Ban-list plan đủ KPI mock; regress nếu nhét lại block “Cần xử lý” mà không đụng string cấm.
2. **Medium** — `dashboard.tsx` không có render test: empty “Không có học viên rủi ro.”, skip missing student, greeting fallback.
3. **Low** — `formatDashboardLead` không assert weekday vi-VN (locale-dependent). Test chỉ `17/08` + count 0.
4. **Low** — `/7\.5/` source-ban có thể false-positive nếu sau này ghi `7.5` hợp lệ (dur/band). Hiện không match.
5. Check-in button vẫn hiện cho `absent` (không `completed`) — parity cũ, server 409; không test mới.

## Performance

Full suite 857ms. Không test >5s. `repos/kernel.test.ts` chậm nhất (pre-existing).

## Recommendations

1. **Low** — thêm `not.toMatch(/Cần xử lý|StatCard|fmtK/)` đã có `fmtK`; cân nhắc cấm `StatCard` + `Cần xử lý` nếu muốn khóa layout cut.
2. **Low** — 1 case orphan sid + 1 case order `students` trong helper test.
3. Không thêm Playwright dashboard (plan: repo chưa có e2e dashboard). Reload = snapshot hydrate, không mock layer.

## Unresolved Questions

- Worktree HEAD `771efac` **trước** develop hiện tại (`2b5de5a` merge #71). 197 = suite **branch này**, không phải develop-tip + delta. `repos/classes.test.ts` ở worktree = 9 tests (develop-tip 10).
- Cmd 1 user-specified không filter được 2 file vì `vitest run -- <files>`. True focused = `pnpm --filter web exec vitest run <files>`.
