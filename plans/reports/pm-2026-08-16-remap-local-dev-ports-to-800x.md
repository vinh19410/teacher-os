---
type: pm
date: 2026-08-16
slug: remap-local-dev-ports-to-800x
plan: plans/260816-2017-remap-local-dev-ports-to-800x
store_id: teacher-os/260816-1317
---

# Plan Complete: Remap local dev ports to 800x

## Summary

- **Duration:** 2026-08-16 (same day)
- **Phases:** 3/3 completed (file truth)
- **AC:** 9/9 checked
- **Phase checkboxes:** 34/34 `[x]` (p1 8, p2 14, p3 12)
- **Grand:** 43/43 (phase + AC)
- **Tests:** 21/21 pass (tester). biome 0 err. check-types 4/4
- **Review:** 9/10, spec 9/9 PASS
- **Files (tracked product):** 5 — alchemy, vite, auth-client, README, ci.yml
- **Docs impact:** minor (README local URLs). No `./docs`. No corpus refresh.

`plan.md` frontmatter `status: completed`. Phase table Status = Completed. Phase YAML `status: completed`.

`ak plan update` / `status` / `validate` **not run** this session (no shell). Store `teacher-os/260816-1317` may still be `in-progress`. Main agent **must** close store.

## Progress vs plan

| Item | Plan | Evidence | Verdict |
|---|---|---|---|
| Worker 8000 + `strictPort` | p2 + AC | `alchemy.run.ts:28-31` | done |
| Website.Vite 8001 + `strictPort` | p2 + AC | `alchemy.run.ts:53-56` | done |
| Vite `server` 8001 + `strictPort` | p2 + AC | `vite.config.ts:8-10` | done |
| web `.env` `VITE_SERVER_URL=:8000` | p2 + AC | URL key only | done |
| server `.env` auth `:8000` + CORS `:8001` | p2 + AC | URL keys only | done |
| README local host/port; OAuth path keep | p2 + AC | README:48-49,58-59 | done |
| auth-client fallback `:8000` | p2 + AC | `auth-client.ts:37` | done |
| CI dummy `:8000` | p3 + AC | `ci.yml:20` | done |
| Historical plans/journals | AC | leftover `:3000` only in old plans/journals/scout | done |
| test + biome + check-types | p3 + AC | tester 21/21, exit 0 | done |

Live `apps/` `packages/` `README.md` `.github/` `scripts/`: **0** `localhost:300[01]`.

## Checkbox counts (file sweep)

| File | `[x]` | `[ ]` | Frontmatter |
|---|---:|---:|---|
| `phase-01-start.md` | 8 | 0 | completed |
| `phase-02-remap-bind-ports-env-and-docs.md` | 14 | 0 | completed |
| `phase-03-align-ci-dummy-url-and-verify.md` | 12 | 0 | completed |
| `plan.md` AC | 9 | 0 | completed |
| **Total** | **43** | **0** | — |

Backfill: none. `ak plan check` already `[x]` all phase items. No stale `[ ]`.

## Scope / risks

| Change | Reason | Impact |
|---|---|---|
| none vs accepted contract | — | — |

| Risk | State | Note |
|---|---|---|
| Port hop desync Google/CORS | closed | `strictPort: true` Worker + Website + Vite |
| CORS left on 3001 | closed | server `.env` `CORS_ORIGIN=:8001` |
| Secrets staged | closed (review) | `.env` gitignored; not in product diff |
| Store/index drift | **open** | files completed; `ak plan update` not executed |
| Google Console URI | **open (ops)** | human; not code |
| Bind smoke 8000/8001 | residual | optional; not merge gate |
| PWA SW cache 3001 | residual | hard-refresh / unregister SW |

## Docs impact

**minor** — README local web/API + callback **host/port** only. Path `/api/auth/oauth2/callback/google` unchanged. No `./docs`. Do **not** spawn corpus refresh.

## Unresolved mappings

None. Every completed implement item maps to a phase checkbox.

## Next actions

| # | Owner | DoD |
|---|---|---|
| 1 | **Main agent — MUST NOW** | Run store close. Without this, plan files say completed but `plans.db` may still be in-progress. |
| 2 | Human operator | Google Console: add `http://localhost:8000` + **existing** callback path. Keep `:3000` until local clients move. If JS origins had `:3001`, add `:8001`. Do not drop prod URIs. |
| 3 | Human / optional | Restart `pnpm run dev`. Confirm bind 8000/8001, no hop warning. Unregister SW if 3001 cached. |

### Main agent — finish the plan (blocking store sync)

Implementation **already done**. Quality gates **already green**. Do **not** reopen code. Do **not** edit historical plans. Close the store **now**:

```bash
ak plan phase close teacher-os/260816-1317 1 --json --no-interactive
ak plan phase close teacher-os/260816-1317 2 --json --no-interactive
ak plan phase close teacher-os/260816-1317 3 --json --no-interactive
ak plan update teacher-os/260816-1317 --status completed --json --no-interactive
ak plan status
ak plan validate
```

If phase-close rejects already-completed files, still run `ak plan update` + `status` + `validate`. If store drifts from files, `ak plan reindex` then re-run update.

**Finish the plan.** Files are 43/43. Store close is the last official step. Do it this session.

## Unresolved questions

- Store `teacher-os/260816-1317` live status unknown (CLI not run here).
- Google Console currently registers which callback path (`/oauth2/callback/google` vs `/callback/google`)?
- Bind smoke on this machine still not run.
