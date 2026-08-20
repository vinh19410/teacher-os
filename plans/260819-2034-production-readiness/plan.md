---
title: "Production readiness"
description: "Chứng minh Teacher OS chạy an toàn trên Cloudflare + D1 thật trước pilot: cấu hình release, recovery drill, readiness, UI fail-safe và UAT có evidence."
status: pending
priority: P1
effort: "6-9d"
issue: 28
branch: develop
tags: [infra, auth, database, frontend, critical]
blockedBy: []
blocks: []
created: 2026-08-19
---

# Production readiness

## Overview

Đây là milestone 0 đã chốt trong [roadmap](../../docs/project-roadmap.md): có thể deploy và UAT Teacher OS trên Cloudflare Workers + D1 thật, không khiến lỗi tải dữ liệu trông như workspace rỗng, và có cách khôi phục/sự cố tối thiểu trước pilot một giáo viên.

## Scope Challenge

- Existing: D1 migration được Alchemy gắn vào stack; kernel org-scoped, CSRF, unit tests và CI đã có. Bằng chứng: `packages/infra/alchemy.run.ts:41-43` (`migrationsDir`), CSRF origin guard `apps/server/src/routes/kernel.ts:42-53` + `buildApp` `apps/server/src/app.ts:84-106`, `.github/workflows/ci.yml:16-35`.
- Requested: roadmap đầu tiên “Production readiness”, gồm deploy/UAT/rollback-support gate trong `docs/project-roadmap.md`.
- Complexity: 6 phase, khoảng 15 file/docs có thể tác động, không thêm product feature hay service mới.
- Selected mode: HOLD SCOPE. Auto-detected Hard.

## Outcome and GO/NO-GO

GO chỉ khi toàn bộ checklist sau có evidence được lưu trong issue/runbook:

1. Google sign-in, cookie session, CORS và bootstrap org hoạt động trên origin production đã chốt.
2. D1 đã migrate đúng và recovery drill trên môi trường non-production pass; policy là migration forward-only, không sửa migration đã apply.
3. `/readyz` chỉ trả `200` khi Worker và D1 query thành công; lỗi snapshot đầu tiên không render workspace rỗng.
4. Mọi mutation đang có chỉ đóng/reset UI khi server xác nhận commit; lỗi outcome chưa xác định bắt buộc reconcile snapshot trước khi người dùng thử lại.
5. UAT incognito pass: sign-in → org rỗng → tạo syllabus/class → thêm học viên ngay trong class để tạo enrollment → hard reload → sign-out/sign-in giữ data; matrix origin sai bị `403` đúng kỳ vọng (Phase 6 định nghĩa từng hàng; server không trả redirect cho các case này).

NO-GO nếu topology/cookie không ổn định, migration/recovery chưa được rehearsal, readiness không chứng minh D1, hoặc initial snapshot failure vẫn vào workspace rỗng.

## Non-goals

- Browser E2E đầy đủ, release automation CI/CD, synthetic monitoring, load test, alerting/Sentry hoàn chỉnh.
- Schedule/invoice creation, reports/assignments, RBAC owner/admin, email verification, payment gateway.
- Blue-green, multi-region, custom backup scheduler, hoặc thay kernel/API contract.

## Design decisions

| Decision | Chọn | Rationale |
|---|---|---|
| Release | Manual, controlled, evidence-backed | Một pilot đầu cần live proof; CI/CD deploy không phải điều kiện milestone này. |
| Migration rollback | Forward-only; restore D1 chỉ theo runbook/rehearsal | Đảo migration sau dữ liệu thật dễ phá schema/data. |
| Readiness | `/readyz` query D1 nhẹ, không trả detail | `GET /` hiện chỉ liveness (`apps/server/src/app.ts:99`). |
| Snapshot failure | Blocking error + retry; `401` re-auth, không mount children | Trước Phase 4 `DataProvider` mở empty store sau lỗi; sau Phase 4 lỗi load render blocking `KernelLoadError` (`apps/web/src/lib/data-provider.tsx:176-181`). |
| Mutation result | Kết quả discriminated: committed/refreshed/failed/unknown | `id` không phải tín hiệu success cho endpoint trả `{ ok: true }`. |
| Auth smoke | Manual incognito Chrome + Safari; Google OAuth thật, không ở CI | Chỉ browser/live origin chứng minh callback, cookie, CORS. |
| Production topology | `app.<domain>` + `api.<domain>` | UAT phải bao gồm cross-subdomain cookie và Safari smoke; Phase 1 encodes runtime host/cookie settings. |

## Issue breakdown

`P0` below is the GitHub delivery priority. Plan frontmatter uses `P1`, the highest priority supported by the plan CLI schema.

| Child issue | Phase | Priority | Depends on |
|---|---:|---|---|
| Define production configuration and support runbook | 1 | P0 | — |
| Rehearse D1 migration safety and recovery | 2 | P0 | 1 |
| Add database readiness endpoint | 3 | P0 | 1 |
| Fail safe on first snapshot load | 4 | P0 | — |
| Make mutation failure truthful in UI | 5 | P0 | — |
| Execute live UAT and record release evidence | 6 | P0 | 1–5 |

## Dependency graph

```text
P1 configuration/runbook ─┬─> P2 D1 drill ────────┐
                           ├─> P3 /readyz ──────────┼─> P6 live UAT → GO/NO-GO
P4 first-snapshot safety ──┤                         │
P5 truthful mutations ─────┘                         │
```

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Production configuration and support runbook](./phase-01-production-configuration-and-support-runbook.md) | Completed |
| 2 | [D1 migration safety and recovery drill](./phase-02-d1-migration-safety-and-recovery-drill.md) | Pending |
| 3 | [Database readiness endpoint](./phase-03-add-database-readiness-endpoint.md) | Completed |
| 4 | [Fail-safe first snapshot load](./phase-04-fail-safe-on-first-snapshot-load.md) | Completed |
| 5 | [Truthful mutation failure UI](./phase-05-make-mutation-failure-truthful-in-the-ui.md) | Completed |
| 6 | [Live UAT and release evidence](./phase-06-execute-live-uat-and-record-release-evidence.md) | Pending |

## Cross-plan dependencies

No unfinished plan blocks this roadmap. The completed persistence plan is a prerequisite already merged: [class-centric kernel](../260818-1101-persist-class-centric-domain-kernel/plan.md).

## External references

- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://better-auth.com/docs/concepts/cookies

## Success Criteria

- [ ] Every P0 issue has an owner, acceptance evidence and no secret values in GitHub/docs.
- [ ] All five GO conditions pass on the actual production stage.
- [ ] `pnpm test`, `pnpm check-types`, `pnpm exec biome check .`, and `pnpm build` remain green for code changes.
- [ ] `docs/project-roadmap.md` can be updated from “Chưa bắt đầu” only with UAT evidence, never only a merge.

## Open questions

None. Isolated staging D1 exists (Phase 1 completed). Operator/UAT identities stay out of band; credentials never enter the repository or GitHub issue.

## Validation Log

### Session 1 — 2026-08-19

**Trigger:** Hard-mode validation after research and red-team. **Questions asked:** 3.

#### Questions & Answers

1. **[Architecture]** Topology production nào sẽ là mục tiêu của Phase 1?
   - Options: Same-origin proxy | App + API subdomain
   - **Answer:** App + API subdomain
   - **Rationale:** Phase 1 must configure `app.<domain>` + `api.<domain>`, cross-subdomain cookie policy, CORS and Google callback as one runtime contract.
2. **[Assumptions]** Trạng thái staging D1 để rehearsal migration/recovery hiện là gì?
   - Options: Chưa có staging | Đã có staging
   - **Answer:** Chưa có staging
   - **Rationale:** A non-production D1 must be created before Phase 2; production/pilot data is never a rehearsal target.
3. **[Risk]** Ai sẽ sở hữu quyền deploy/restore và tài khoản Google chuyên dụng cho UAT?
   - Options: Tôi tự cung cấp | Chưa phân công
   - **Answer:** Tôi tự cung cấp
   - **Rationale:** UAT cannot start without authorized operator/account, but their identities and credentials remain outside repo/GitHub.

#### Confirmed Decisions

- Topology: `app.<domain>` + `api.<domain>` — test Chrome and Safari cross-subdomain session behavior.
- Staging: create isolated D1 before migration drill.
- Operator/UAT account: user supplies out of band; never persist sensitive information.

#### Impact on Phases

- Phase 1: encode app/API subdomain topology and provision staging.
- Phase 2: use the new staging D1 as the only drill target.
- Phase 6: use the supplied dedicated Google account.

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, all six `phase-*.md` files.
- Decision deltas checked: topology, staging availability, UAT authority.
- Reconciled stale references: 4.
- Unresolved contradictions: 0.

### Session 2 — 2026-08-20

**Trigger:** Vibe re-validation of Phase 2 against live staging ledger after Phase 1 merge. **Questions asked:** 0 (ledger-answered; original Session 1 decisions still hold).

#### Verification Results

- **Tier:** Full (6 phases; execution scoped to Phase 2)
- **Claims checked:** 14
- **Verified:** 12 | **Failed:** 2 | **Unverified:** 0

Failures reconciled in this session:

1. [Fact Checker] `packages/infra/alchemy.run.ts:11-13` cited as `migrationsDir` — actual `migrationsDir` is `:41-43`; `:11-13` is dotenv.
2. [Fact Checker] `plan.md` Phase 1 still Pending / “will create staging” — Phase 1 is completed; staging D1 exists.

Live ledger (counts only, no UUIDs/row text): staging applied `0000`–`0006`; `comment_bank` = 0; no prod teacher-os D1. `wrangler d1 list` `num_tables=0` is a display bug.

#### Confirmed Decisions

- Topology, operator/UAT out-of-band, and isolated staging: unchanged from Session 1.
- `0006` repair: rewrite pending file as table rebuild (`operation_id = id`), then destroy/recreate staging. Not NO-GO (no populated-before-`0006` non-rehearsal DB). Not `0007` (cannot unblock earlier ledger; first prod apply must be the safe `0006`).
- Representative data is synthetic `fixture-*` only; never copy prod/pilot.
- Restore drill is separate from the populated-upgrade fixture; no `alchemy deploy` until read-only verify; sessions wiped; new login; RPO = writes since bookmark are lost.

#### Impact on Phases

- Phase 2: decision tree third branch, file list, split drills, runbook append-only, no verify script.
- Phases 3–6: unchanged. Phase 2 must not rewrite topology or add `/readyz`.

## Red Team Review

### Session — 2026-08-19

**Findings:** 22 deduplicated (4 critical, 12 high, 6 medium). **Applied:** 10. **Rejected:** 2 as scope expansion without a pilot-specific threat model; the rest were duplicates or planning observations already covered.

| # | Finding | Severity | Disposition | Applied to |
|---|---|---|---|---|
| 1 | `id` is not a universal success signal | Critical | Accept | Phase 5 |
| 2 | Existing-data migration `0006` needs a decision tree | Critical | Accept | Phase 2 |
| 3 | Topology must change runtime, not only docs | Critical | Accept | Phase 1 |
| 4 | Write/refresh uncertainty must not be blindly retried | Critical | Accept | Phase 5 |
| 5 | Mutation scope/file ownership incomplete | High | Accept | Phase 5 |
| 6 | `401` needs re-auth after route guard | High | Accept | Phase 4 |
| 7 | Readiness needs schema-dependent probe | High | Accept | Phase 3 |
| 8 | UAT enrollment flow was not executable | High | Accept | Plan, Phase 6 |
| 9 | UAT fault path was unsafe/ambiguous | High | Accept | Phase 6 |
| 10 | Google GO criterion was ambiguous | High | Accept | Plan, Phase 6 |
| 11 | Add auth rate limiter before pilot | High | Reject | Outside this approved milestone; no observed abuse incident or pilot-scale threat evidence. Track only if UAT/pilot evidence changes risk. |
| 12 | Add immutable mutation audit trail | High | Reject | New public/data contract not requested; existing one-teacher pilot scope and no incident evidence do not justify it before UAT. |

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, all six `phase-*.md` files.
- Decision deltas checked: 10.
- Reconciled stale references: UI result signal, caller inventory, LessonModal path, UAT enrollment flow, 401, readiness schema query, migration repair and Google UAT policy.
- Unresolved contradictions: 0.

### Session — 2026-08-20 (Phase 2 re-review)

**Findings:** 19 deduplicated from 4 lenses (Security, Failure Mode, Assumption Destroyer, Scope Critic). **Applied:** 16. **Rejected:** 3.

| # | Finding | Severity | Disposition | Applied to |
|---|---------|----------|-------------|------------|
| 1 | Decision tree missing empty-staging-applied `0006` | Critical | Accept | Phase 2 |
| 2 | Empty + populated cannot share current singleton without pre-`0006` fixture | Critical | Accept | Phase 2 |
| 3 | `alchemy deploy` after Time Travel re-applies migrations | Critical | Accept | Phase 2 |
| 4 | Unique backfill cannot be a constant `DEFAULT` | Critical | Accept | Phase 2 |
| 5 | Related-files list forbade editing `0006` while step 2 required it | Critical | Accept | Phase 2 |
| 6 | Restore revives `session` / OAuth token columns | Critical | Accept | Phase 2 |
| 7 | “Copy representative DB” is a PII channel | Critical | Accept | Phase 2 |
| 8 | Freeze `0006` and add `0007` | High | Reject | Unsafe `0006` still runs first on prod; `0007` cannot unblock it. Staging is disposable rehearsal. |
| 9 | Quiesce procedure missing | High | Accept | Phase 2 |
| 10 | GET `/api/kernel` is a false-green for `operation_id` | High | Accept | Phase 2 |
| 11 | Kernel smoke must lock `Origin`; no wrangler INSERT | High | Accept | Phase 2 |
| 12 | Pin staging D1 name + `--remote`; abort non-staging | High | Accept | Phase 2 |
| 13 | Hand-insert `membership` after restore is a privilege grant | High | Accept | Phase 2 |
| 14 | `wrangler d1 list` `num_tables=0` is a display bug | High | Accept | Phase 2 |
| 15 | Stale `alchemy.run.ts:11-13` citations | Medium | Accept | Plan, Phase 2 |
| 16 | Runbook must stay append-only (topology URI locked) | Medium | Accept | Phase 2 |
| 17 | Create `scripts/verify-d1-release-state.mjs` | Medium | Reject | Gold-plate; commands belong in the runbook. |
| 18 | Writes since bookmark have no replay log | Medium | Accept | Phase 2 (honest RPO) |
| 19 | App maintenance-mode flag / disable staging email-password | High | Reject | Scope expansion; operator quiesce on empty rehearsal is enough. |

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, all six `phase-*.md` files.
- Decision deltas checked: `0006` repair = table rebuild + recreate staging; split populated fixture vs restore drill; no `0007`; no verify script; runbook append-only; synthetic fixtures only; session wipe after restore.
- Reconciled stale references: Alchemy line numbers, Phase 1 status, “Phase 1 will create staging”, Phase 2 file list vs step 2, copy/quiesce phantom procedures.
- Unresolved contradictions: 0.

### Session — 2026-08-20 (Phase 4 re-review)

**Findings:** 11 deduplicated from 3 lenses (Security/Fact Checker, Failure Mode/Flow Tracer, Assumption Destroyer/Scope Auditor). **Applied:** 10. **Rejected:** 1 (partial).

| # | Finding | Severity | Disposition | Applied to |
|---|---------|----------|-------------|------------|
| 1 | `kernel-runtime.contract.test.ts` regex-locks the old `kernelLoaded` shape; tests fail on first commit | Critical | Accept | Phase 4 |
| 2 | "Safe return URL" has no consumer (login hardcodes `/dashboard`), files out of scope, undefined "safe" = open-redirect vector | Critical | Accept | Phase 4 |
| 3 | Test plan infeasible: vitest env is `node`, no DOM/testing-library; component behaviors untestable | High | Accept | Phase 4 (pure state-machine extraction) |
| 4 | Mid-session `401` via bus refresh retried pointlessly; provider-only 401 handling leaves the common case stuck | High | Accept | Phase 4 (bus `onAuthLost`) |
| 5 | `401` "clear in-memory state" is a no-op; session cookie survives — must best-effort `authClient.signOut()` | High | Accept | Phase 4 |
| 6 | Error taxonomy binary: no bucket for `403`/`429` (server returns real `403`), no-status errors unrepresentable | High | Accept | Phase 4 (3 buckets + no-status mapping) |
| 7 | Wrong-shape `200` passes `as KernelSnapshot` cast and can mount garbage/empty-looking workspace; "valid" undefined | High | Accept | Phase 4 (shape guard on `emptyKernelData` keys) |
| 8 | Stale in-flight attempt can flip `ready`→`error` and unmount a running workspace; no sequence guard | Medium | Accept | Phase 4 |
| 9 | Error/retry UI has no target file; "accessible" undefined; no error boundary exists | Medium | Accept | Phase 4 (`kernel-load-error.tsx`, `role="alert"`) |
| 10 | `_auth` guard redirect drops the URL, diverging from the new 401 return-URL path | Medium | Accept | Phase 4 (guard carries `returnUrl`) |
| 11 | Malformed payload should be non-retryable (deterministic) | Medium | Reject (partial) | Kept `retryable` per original requirement — proxy/partial-deploy responses are transient and retry is user-driven; distinct message instead. |

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, all six `phase-*.md` files.
- Decision deltas checked: 3-bucket taxonomy, bus `onAuthLost`, signOut-then-redirect, returnUrl plumbing through login flows + guard, shape guard, sequence token, contract-test rewrite, new files (`kernel-load-state.ts`, `kernel-load-error.tsx`).
- Reconciled stale references: 2 — `plan.md` Design decisions citation `apps/server/src/app.ts:98` → `:99` (drift after `/readyz`); Phase 4 Requirements/Steps/Success Criteria rewritten to match.
- Unresolved contradictions: 0.

### Session — 2026-08-20 (Phase 6 re-review before execution)

**Findings:** 16 raw from 2 lenses (Security/Fact Checker, Assumption Destroyer/Scope Auditor); 13 after dedup. **Applied:** 13. **Rejected:** 0. Ground truth observed live: production never deployed (no prod D1; Alchemy state only `local`), `APP_DOMAIN` absent from every env file, `apps/server/.env` still carries a dev `CORS_ORIGIN`.

| # | Finding | Severity | Disposition | Applied to |
|---|---------|----------|-------------|------------|
| 1 | Phase 6 never pinned the production origin — UAT on staging/`workers.dev` could satisfy the letter of every criterion (false GO) | Critical | Accept | Phase 6 (origin pinned everywhere; `APP_DOMAIN`-unset deploy is auto-NO-GO) |
| 2 | Negative-origin matrix had no expected values; "redirect" exists in no code path; GET endpoints are not server-side origin-enforced | High | Accept | Phase 6 (explicit matrix table with expected statuses; GET excluded) |
| 3 | Matrix missed the real trust boundary: correct-origin stranger self-registration (email/password enabled, no verification, auto-bootstrap org) | High | Accept | Phase 6 (sign-up row records verdict + risk note; no product change in this phase) |
| 4 | Safari leg required by runbook/parent plan was absent from Phase 6 steps and criteria | High | Accept | Phase 6 (Chrome AND Safari; missing evidence = NO-GO) |
| 5 | Evidence procedure itself was a leak channel: no sanitize allowlist; roster screenshots vs no-student-data rule | High | Accept | Phase 6 (allowlist: status/hostname-redacted/request-id/SHA/timestamp/runner; `fixture-*` data; counts not screenshots) |
| 6 | `CORS_ORIGIN` unset instruction is silently defeated by dev values in `apps/server/.env`/`.env.example` (dotenv precedence, warn-only) | High | Accept | Phase 6 (topology gate asserts all three env files; post-deploy CORS probe) |
| 7 | Deploy execution context undefined — worktree lacks env/state; commit ambiguity vs "green gates on release commit"; no approval artifact | High | Accept | Phase 6 (deploy from main checkout at recorded SHA; sign-off row before deploy) |
| 8 | No `APP_DOMAIN`/zone/redirect-URI pre-deploy hard gate; failed first prod deploy has no sanctioned cleanup path | High | Accept | Phase 6 (topology gate; partial-prod cleanup needs restore authority) |
| 9 | "Verify session cookie" requirement had no step (attributes never checked; same-site fetch hides wrong `Domain`) | Medium | Accept | Phase 6 (DevTools cookie attribute check vs runbook table) |
| 10 | Fault-path step could pass vacuously — load gate runs once on mount; block must be active before first fetch | Medium | Accept | Phase 6 (rule on → hard reload → blocking error → retry) |
| 11 | Preflight "Phase 2 gate" unsatisfiable as written — restage with repaired `0006` still pending; "staging exists" is not the acceptance | Medium | Accept | Phase 6 (staging rehearsal gate: restaged ledger or recorded throwaway proof) |
| 12 | Two divergent GO checklists (plan vs runbook) with no designated authority | Medium | Accept | Phase 6 (unified GO table, superset of both) |
| 13 | Evidence URL disclosure contradiction (phase mandates URL; runbook makes it operator decision); UAT data retention undecided | Medium | Accept | Phase 6 (redacted-host policy per runbook; synthetic data + recorded retention decision) |

Fact Checker corrections applied to `plan.md`: Scope Challenge citation `apps/server/src/app.ts:83-101` → CSRF guard `apps/server/src/routes/kernel.ts:42-53` + `buildApp` `app.ts:84-106`; Design decisions snapshot-failure citation updated to post-Phase-4 reality (`data-provider.tsx:176-181`).

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, all six `phase-*.md` files.
- Decision deltas checked: production-origin pinning, unified GO table, Chrome+Safari mandatory, sanitize allowlist, topology/staging/deploy gates, negative-origin matrix expected statuses, deploy-from-main-checkout rule.
- Reconciled stale references: 2 (Scope Challenge CSRF citation; Design decisions snapshot-failure citation).
- Unresolved contradictions: 0.
