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

- Existing: D1 migration được Alchemy gắn vào stack; kernel org-scoped, CSRF, unit tests và CI đã có. Bằng chứng: `packages/infra/alchemy.run.ts:11-63`, `apps/server/src/app.ts:83-101`, `.github/workflows/ci.yml:16-35`.
- Requested: roadmap đầu tiên “Production readiness”, gồm deploy/UAT/rollback-support gate trong `docs/project-roadmap.md`.
- Complexity: 6 phase, khoảng 15 file/docs có thể tác động, không thêm product feature hay service mới.
- Selected mode: HOLD SCOPE. Auto-detected Hard.

## Outcome and GO/NO-GO

GO chỉ khi toàn bộ checklist sau có evidence được lưu trong issue/runbook:

1. Google sign-in, cookie session, CORS và bootstrap org hoạt động trên origin production đã chốt.
2. D1 đã migrate đúng và recovery drill trên môi trường non-production pass; policy là migration forward-only, không sửa migration đã apply.
3. `/readyz` chỉ trả `200` khi Worker và D1 query thành công; lỗi snapshot đầu tiên không render workspace rỗng.
4. Mọi mutation đang có chỉ đóng/reset UI khi server xác nhận commit; lỗi outcome chưa xác định bắt buộc reconcile snapshot trước khi người dùng thử lại.
5. UAT incognito pass: sign-in → org rỗng → tạo syllabus/class → thêm học viên ngay trong class để tạo enrollment → hard reload → sign-out/sign-in giữ data; matrix origin sai bị `403`/redirect đúng.

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
| Readiness | `/readyz` query D1 nhẹ, không trả detail | `GET /` hiện chỉ liveness (`apps/server/src/app.ts:98`). |
| Snapshot failure | Blocking error + retry; `401` re-auth, không mount children | `DataProvider` hiện mở empty store sau lỗi (`apps/web/src/lib/data-provider.tsx:73-79`). |
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
| 1 | [Production configuration and support runbook](./phase-01-production-configuration-and-support-runbook.md) | Pending |
| 2 | [D1 migration safety and recovery drill](./phase-02-d1-migration-safety-and-recovery-drill.md) | Pending |
| 3 | [Database readiness endpoint](./phase-03-add-database-readiness-endpoint.md) | Pending |
| 4 | [Fail-safe first snapshot load](./phase-04-fail-safe-on-first-snapshot-load.md) | Pending |
| 5 | [Truthful mutation failure UI](./phase-05-make-mutation-failure-truthful-in-the-ui.md) | Pending |
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

None. Phase 1 will create an isolated staging D1 database. The user will supply the authorized deploy/restore owner and dedicated Google UAT account out of band; credentials never enter the repository or GitHub issue.

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
