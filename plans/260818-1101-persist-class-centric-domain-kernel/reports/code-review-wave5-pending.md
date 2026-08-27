## Code Review Summary

### Scope

- Mode: pending changes, Stage 2 production-readiness review after Stage 1 PASS.
- Files: 20 implementation/contract/test/schema/plan files; 2 red-team reports used as input.
- LOC: +2,260 / -36 excluding the two red-team reports; 1,566 added lines are generated Drizzle snapshot metadata.
- Checklists: base + web-app + API, two-pass critical then informational; anti-slop taxonomy applied because diff >300 lines.
- Focus: invoice schema/migration, org-scoped read/write API, shared snapshot/store consumers, serialized command bus, compatibility/deploy risks.

### Overall Assessment

**Approve.** No Critical or Important production defect found. Tenant predicates, fail-closed auth, Origin/JSON guards, explicit DTO projection, migration/export, snapshot hydration, serialized POST→refetch, and paid-replay overwrite semantics are internally consistent. Both prior suggestions are resolved; no open finding remains.

### Critical Issues

None.

### Important Issues

None.

### Suggestions

None open.

Resolved in accepted delta:

1. Direct unauthenticated mutation coverage now POSTs valid Origin/JSON without a session and asserts 401 at `apps/server/src/kernel.test.ts:344-350`. This reaches the route's explicit missing-`kernelCtx` guard at `apps/server/src/routes/kernel.ts:554-557`.
2. The suite now uses the stable domain label `invoice persistence` at `apps/server/src/kernel.test.ts:323`; the plan/wave reference is removed.

### Assessed Non-Issues

- **Malformed directly persisted status/method/negative amount — non-issue for this scope.** Runtime search finds no invoice create/import path; the only insert is the test helper at `apps/server/src/kernel.test.ts:156-178`, and `POST /api/invoices` is explicitly verified absent at `apps/server/src/kernel.test.ts:449-457`. The only public write parses a strict bounded method and updates only `status`/`method` at `apps/server/src/routes/kernel.ts:554-569`. Therefore negative amounts or invalid pre-existing status/method require direct DB insertion/corruption, not an in-scope external input path. Unknown status also maps fail-closed to `unpaid` at `apps/web/src/lib/repos/invoices.ts:5-15`. If a future create/import surface is added, validate amount/status/method there and consider DB CHECK constraints then.

- **Paid replay — locked behavior, not a race bug.** The update is a single org-scoped statement at `apps/server/src/routes/kernel.ts:560-569`; concurrent calls are last-write-wins, and replay overwrites the method by explicit accepted contract at `phase-06-wave-5-tuition-persist.md:72-76`. No recommendation reverses this decision.

- **Rolling deployment compatibility — acceptable in the supported deploy graph.** The migration is additive. Alchemy declares D1 migrations on the DB resource and binds that resource into the server at `packages/infra/alchemy.run.ts:11-22`; the server is resolved before the web deployment at `packages/infra/alchemy.run.ts:42-51`. This yields DB→server→web ordering for the supported stack deployment. Old web clients ignore the added response field. A manually deployed new web against an old server would fail because `invoices` is now required, but that is outside the repository's declared deployment path and no such deploy workflow is evidenced.

- **`loadSnapshot` coupling — no N+1 or observed availability defect.** Invoice loading is one org-scoped query added to the existing parallel snapshot batch at `apps/server/src/routes/kernel.ts:174-240`, with an org index at `packages/db/src/schema/invoice.ts:29-31`. Fail-fast behavior is appropriate because a partial kernel snapshot would desynchronize all three invoice consumers. This does make legacy `/students`, `/classes`, and `/syllabi` list handlers inherit the invoice-table dependency through their pre-existing full-snapshot implementation, but the generated migration and deploy dependency remove the concrete missing-table failure in the supported rollout.

- **Whole-store unchanged coverage — sufficient.** `kernel-loaded` shallow-merges only its typed kernel payload over the current store at `apps/web/src/lib/data-store-reducer.ts:186-188`; the contract test verifies a local collection survives while students and invoices hydrate at `apps/web/src/lib/kernel-runtime.contract.test.ts:78-139`. Exhaustively repeating the same assertion for assignments/reports/comment bank would not prove a different branch.

- **No browser E2E — not a landing blocker.** No Playwright/Cypress harness exists in the repository. The real handler test proves persistence and snapshot reload at `apps/server/src/kernel.test.ts:373-397`; repo tests prove action→path/body and mapping at `apps/web/src/lib/repos/kernel.test.ts:328-343`; reducer hydration is covered at `apps/web/src/lib/kernel-runtime.contract.test.ts:78-139`. The three consumers remain on the same `data.invoices` collection (`tuition.tsx:140-190`, `dashboard.tsx:160-166`, `students/$studentId.tsx:74-76,212-228`), so absence of a newly introduced browser framework is a coverage trade-off, not evidence of broken behavior.

- **Anti-slop review — no structural finding.** The new mapper is domain-anchored and follows existing repo modules; no dependency, generic manager/helper, parallel reimplementation, lint suppression, catch-and-swallow, or unrelated production rewrite was added. `kernel.ts` is already large, but the endpoint intentionally remains inside its guarded router; this change adds a focused helper and two routes rather than a new unguarded router.

### Edge Cases Found by Scout

- Full read chain verified: `loadInvoices` explicit projection and same-org student join (`apps/server/src/routes/kernel.ts:143-171`) → parallel snapshot (`:174-240`) → `KernelSnapshot.invoices` (`packages/api/src/contracts.ts:180-197`) → adapter (`apps/web/src/lib/repos/kernel.ts:142-149`) → typed reducer merge (`apps/web/src/lib/data-store-reducer.ts:21-25,186-188`) → three unchanged consumers.
- Full write chain verified: `mark-invoice-paid` whitelist/command (`apps/web/src/lib/repos/kernel.ts:23-35,102-106`) → POST transport (`:152-170`) → serialized POST/refetch/apply (`:216-250`) → org-scoped server update (`apps/server/src/routes/kernel.ts:554-574`) → refreshed shared store.
- Cross-org invoice/student mismatch is hidden by the same-org join; foreign/unknown mutation IDs are indistinguishable 404 and owner row stays unchanged (`apps/server/src/kernel.test.ts:460-489`).
- Double-click, multi-tab, and paid replay do not create an invalid transition; they converge through serialized per-tab writes and atomic last-write-wins server updates. Method overwrite is intentional.
- No database calls occur inside invoice loops; no SQL injection, mass assignment, raw row exposure, secret/PII logging, or internal stack response was introduced.

### Plan Follow-ups

- All five Phase 6 todo items at `phase-06-wave-5-tuition-persist.md:116-122` appear implemented and verified.
- Phase front matter remains `status: pending` at `phase-06-wave-5-tuition-persist.md:1-7`. Lead/project manager should update plan state after landing; this reviewer did not mutate plan status.

### Verification Evidence

- Fresh reviewer re-review run: server `kernel.test.ts` — 37/37 passed.
- Fresh reviewer run: web `invoices.test.ts`, `kernel.test.ts`, `kernel-runtime.contract.test.ts` — 30/30 passed.
- Fresh reviewer run: `git diff --check` — clean.
- Original evidence packet + independent tester: pre-delta full suite 131/131; check-types, build, and Biome exit 0. Accepted-delta evidence: server typecheck, Biome, and diff-check exit 0.

### Metrics

- Type coverage: percentage not instrumented; TypeScript check passes.
- Test coverage: percentage not collected; 67 focused tests rerun by reviewer pass (37 server + 30 web).
- Linting issues: 0 reported.

### Conclusion

**Approve.** No open finding.

### Unresolved Questions

None.

Status: DONE
Summary: Stage 2 re-review PASS; both suggestions resolved, no Critical/Important finding.
Concerns/Blockers: None.

## Post-merge Integration Re-review — 2026-08-19

This section supersedes pre-merge line references and the earlier plan follow-up
that said Phase 6 was still pending. Review target is the staged merged tree,
with the exact Wave 5 feature delta resolved via `git diff origin/develop`
(`origin/develop` = `5cba92f`). Historical red-team findings remain disposition
records; they are not current negative assumptions.

### Verdict

**Approve.** Base + web-app + API checklist passes found no concrete Critical,
Important, or Suggestion finding. Anti-slop calibration found no new generic
manager/helper, parallel transport, widened `any`, swallowed error, lint bypass,
phantom behavior-only test, or unrelated production rewrite in the Wave 5 delta.

### Critical Issues

None.

### Important Issues

None.

### Suggestions

None.

### Semantic Merge Verification

- Server snapshot keeps both parallel rows and both response fields:
  `assignmentRows` + `invoiceRows` at
  `apps/server/src/routes/snapshot.ts:51-62,117-122`, returned together at
  `:217-226`. The invoice list reuses the same explicit org-scoped loader; no
  duplicate or raw-row response was introduced.
- Both mutation surfaces remain under the shared Origin/JSON guard at
  `apps/server/src/routes/kernel.ts:41-52`: invoice mark-paid is org-scoped at
  `:357-376`, while the assignment router is mounted inside the guarded kernel
  router at `:543-545`. No auth/authz path was dropped by conflict resolution.
- The API contract requires both collections at
  `packages/api/src/contracts.ts:182-196,216-235`. Client `KernelSlice`, command
  whitelist/mapping, snapshot adapter, and reducer payload likewise retain both
  at `apps/web/src/lib/repos/kernel.ts:19-38,104-113,150-158` and
  `apps/web/src/lib/data-store-reducer.ts:15-30,191-193`.
- Integrated fixtures exercise both collections in one snapshot and one reducer
  hydration at `apps/web/src/lib/repos/kernel.test.ts:90-150,212-240` and
  `apps/web/src/lib/kernel-runtime.contract.test.ts:97-173`. Server handler tests
  retain invoice isolation/guard/reload coverage at
  `apps/server/src/kernel.test.ts:336-490` and assignment persistence/guard
  coverage at `:832-947`.
- Migration lineage is coherent: `0003_last_shatterstar.sql` creates assignment;
  journal entries are ordered 0003 then 0004 at
  `packages/db/src/migrations/meta/_journal.json:26-38`; `0004_snapshot.json:4-5`
  points to `0003_snapshot.json:4`; the 0004 snapshot contains both assignment
  and invoice tables/indexes. The Wave 5 delta against `origin/develop` adds only
  `0004_gray_cloak.sql` for invoice, so it does not replay or replace Wave 6's
  assignment migration.
- Plan state is consistent after merge: phases 1-7 are Completed at
  `plan.md:48-56`; Phase 6 front matter is completed at
  `phase-06-wave-5-tuition-persist.md:1-7`; the parent correctly remains
  `in-progress` at `plan.md:1-5` because phases 8-9 are still Pending.

### Checklist Disposition

- Concurrency: invoice paid replay remains the accepted atomic org-scoped
  last-write-wins update; no shared mutable server state or async ordering hole
  was introduced. The client command bus remains serialized.
- Error/API boundaries: strict bounded Zod input, 400/401/403/404/415 paths,
  explicit DTO projection, and snapshot fail-fast behavior remain intact.
- Compatibility/performance: migration is additive and ordered; snapshot adds
  one parallel indexed invoice query, with no DB call inside a loop, N+1, or
  unbounded new list query beyond the accepted full org snapshot contract.
- Security/data exposure: identity and org permission checks remain on both
  sensitive routes; foreign/unknown invoice ids share 404; invoice DTO omits
  `orgId`; malformed cross-org student relations remain hidden.

### Verification Evidence

- Controller fresh no-cache evidence: 149/149 runtime tests; 5/5
  typecheck/build gates; Biome exit 0; diff checks clean.
- Integration reviewer rerun: server `kernel.test.ts` 44/44; web integrated
  invoice + assignment + kernel adapter + runtime contract tests 40/40;
  `git diff --check origin/develop` exit 0.

### Residual Deployed Smoke

The only residual is operational validation on a deployed Cloudflare D1 stage:
hard reload Tuition, Dashboard debt, student-detail tuition, and assignment grade
after real writes. This remains a non-blocking beta smoke because migration,
handler, shared-snapshot, adapter, command-bus, and reducer contracts all pass in
the integrated tree. Run it after deployment; reopen only if deployed binding or
migration application differs from the verified repository path.

### Conclusion

**Approve.** No open Critical, Important, or Suggestion finding.

Status: DONE
Summary: Post-merge integration re-review PASS; assignment and invoice semantics coexist across migration, server snapshot/routes, API contract, client hydration, fixtures, and tests.
Concerns/Blockers: None; deployed Cloudflare D1 hard-reload smoke remains non-blocking follow-up.
