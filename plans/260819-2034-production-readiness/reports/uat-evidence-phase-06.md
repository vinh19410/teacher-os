# Phase 6 UAT evidence — 2026-08-20

Execution record for `plans/260819-2034-production-readiness/phase-06-execute-live-uat-and-record-release-evidence.md`.

- **Base commit (local gates):** `a113369c2b08785cb949e3fb7fb45a80e74c4cd6` (`develop` HEAD) + docs-only overlay on branch `feat/30-live-uat-release-evidence`
- **Timestamp:** 2026-08-20T13:09:38Z (all checks below ran within this session)
- **Runner:** ak:vibe agent on the operator machine (darwin); `pnpm`, `curl`, `wrangler`, `alchemy` CLI
- **Outcome:** **NO-GO** — pre-deploy topology gate failed before any production deploy occurred. No release was attempted, so no runbook sign-off row exists for this date.

Sanitization: allowlist per Phase 6 (status, redacted hostname, SHA, timestamp, runner, per-step result). No tokens, cookies, OAuth values, database IDs, or student data appear below.

## Step 1 — Local gates on the release commit: PASS

| Check | Result |
|---|---|
| `pnpm test` | PASS (2/2 topology-drift tests; suite green) |
| `pnpm check-types` | PASS (5/5 tasks) |
| `pnpm exec biome check .` | PASS (0 errors; 5 pre-existing warnings) |
| `pnpm build` | PASS (web + server; `VITE_SERVER_URL=http://localhost:8000` for CI parity) |

## Step 2 — Topology gate (pre-deploy): **FAIL → NO-GO**

| Check | Result |
|---|---|
| `APP_DOMAIN` set in any env file Alchemy loads (`packages/infra/.env`, `apps/server/.env`, `apps/web/.env`) | **FAIL — absent everywhere** (keys observed, values not recorded) |
| `CORS_ORIGIN` clean (absent or exactly `https://app.<APP_DOMAIN>`) in all three env files | **FAIL — a dev-localhost value remains in `apps/server/.env`**; it would silently override the derived production default (`packages/infra/alchemy.run.ts` dotenv precedence, warn-only) |
| Cloudflare zone for the domain exists in the account | Not evaluable until the domain is chosen — the account does hold active zones (names withheld per hostname policy) |
| Google console redirect URI `https://api.<APP_DOMAIN>/api/auth/callback/google` registered | Not evaluable — domain not chosen; registration is operator-side |

Per the hardened Phase 6 procedure, deploying `--stage prod` with `APP_DOMAIN` unset is auto-NO-GO (it would produce a `workers.dev`-shaped "prod"). No deploy command was run.

## Runbook preflight items (supporting evidence)

| Preflight | Result |
|---|---|
| 1. Operator authority | **Missing** — no sign-off row (operator, approver, domain) exists yet; release approval is a user decision |
| 2. Cloudflare auth | **PASS** — `pnpm alchemy profile show` authenticated from operator env; `wrangler whoami` confirms workers/kv/routes/scripts/tail write + d1 write |
| 3. Zone readiness | Deferred — depends on domain choice; active zones exist in the account |
| 4. Google OAuth console | **Blocked** — no production redirect URI can be registered before the domain is chosen |
| 5. Secrets present | **PARTIAL** — `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET` present in `apps/server/.env` (loaded by Alchemy via dotenv); `CLOUDFLARE_ACCOUNT_ID/API_TOKEN` in `packages/infra/.env`; `APP_DOMAIN` missing everywhere |
| 6. Staging rehearsal | **PASS via recorded throwaway-D1 proof** — runbook ledger 2026-08-20 records the repaired `0006` proven on a throwaway D1 (apply `0000`–`0005`, seed `fixture-*` rows, apply `0006`, verify, destroy). Live staging D1 still holds the original pre-repair apply of the `0006` filename; the restage itself remains pending and is required before staging is next deployed, but is not the GO-blocking rehearsal gap |
| 7. Green local gates | **PASS** — see Step 1 |

## Steps 4–8 — Deploy, probes, browser UAT, matrix, fault path: NOT EXECUTED

Blocked by the topology gate. Per plan policy these steps must run against the production `app.<APP_DOMAIN>` origin — no staging or `workers.dev` substitution is permitted — and they require the dedicated Google UAT account plus incognito Chrome **and** Safari runners (both mandatory; missing evidence is NO-GO). None of these inputs are available yet.

## Unified GO table — decision

| # | Condition | Verdict |
|---|---|---|
| 1 | Topology resolves to `app.<domain>`/`api.<domain>`; cookie contract | **NO-GO** — `APP_DOMAIN` unset |
| 2 | Chrome AND Safari incognito smokes pass | **NO-GO** — no production origin; UAT account and Safari runner not supplied |
| 3 | Released D1 migration rehearsed, forward-only | Pass (recorded throwaway-D1 proof; runbook ledger 2026-08-20) |
| 4 | `/readyz` + liveness + CORS probe on production | **NO-GO** — no production deployment exists |
| 5 | First-snapshot blocking error + retry recovers | **NO-GO** — not exercisable without the production origin |
| 6 | Negative-origin matrix matches expected statuses | **NO-GO** — not executed (production-only) |
| 7 | Truthful mutation outcomes during UAT | **NO-GO** — UAT not run (Phase 5 regression suite green in Step 1) |
| 8 | No secrets/PII in evidence | Pass — allowlist applied to this report |
| 9 | Recovery drill rehearsed | Pass (Phase 2 evidence; runbook RPO/RTO record 2026-08-20) |

**Decision: NO-GO.** Blocker issue: #41 (all operator/user inputs below are tracked there). Re-run this phase from Step 2 once every blocker input is supplied.

## Blockers (operator/user inputs required)

1. Choose the production domain and set `APP_DOMAIN` in the deploy env; remove the dev `CORS_ORIGIN` from `apps/server/.env` (or replace it with the production origin) so the derived default cannot be silently defeated.
2. Register `https://api.<APP_DOMAIN>/api/auth/callback/google` in the Google Cloud console once the domain is chosen.
3. Supply the dedicated Google UAT account (out of band — never in repo/GitHub).
4. Provide an incognito Safari runner (mandatory browser leg) and confirm the incognito Chrome leg.
5. Record the release sign-off row (operator, approver, domain) in the runbook before the deploy command runs.
